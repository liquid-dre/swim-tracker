import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import {
  assertManagesClub,
  attendanceBySwimmer,
  rosterSwimmers,
} from "./attendanceShared";
import { cleanIsoDate, isValidMinuteOfDay, todayIso } from "./attendanceLib";

/*
  Concrete training sessions (§R18). Pattern-generated rows are managed by
  sessionPatterns.ts; this module owns the direct edits a coach makes to a single
  session — creating a one-off, overriding one occurrence, cancelling, deleting —
  and the two reads the calendar/marking surfaces need. Every edit stamps the
  session `overridden` so a later pattern regeneration leaves the coach's change
  alone. All writes are club-scoped.
*/

const attendanceStatus = v.union(
  v.literal("PRESENT"),
  v.literal("ABSENT"),
  v.literal("LATE"),
  v.literal("EXCUSED"),
);
const sessionStatusV = v.union(v.literal("SCHEDULED"), v.literal("CANCELLED"));

const NAME_MAX = 80;

function cleanDate(input: string): string {
  const cleaned = cleanIsoDate(input);
  if (cleaned === null) throw new ConvexError("Enter a real date (YYYY-MM-DD).");
  return cleaned;
}

function cleanTimes(startMin: number, endMin: number): void {
  if (!isValidMinuteOfDay(startMin) || !isValidMinuteOfDay(endMin)) {
    throw new ConvexError("Enter a valid start and end time.");
  }
  if (startMin >= endMin) {
    throw new ConvexError("The end time must be after the start time.");
  }
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 4000) throw new ConvexError("That text is too long.");
  return trimmed === "" ? undefined : trimmed;
}

function cleanLabel(value: string | undefined): string | undefined {
  const cleaned = cleanOptional(value);
  if (cleaned && cleaned.length > NAME_MAX) throw new ConvexError("That label is too long.");
  return cleaned;
}

async function cleanSquadIds(
  ctx: MutationCtx,
  squadIds: Id<"squads">[],
): Promise<Id<"squads">[]> {
  if (squadIds.length === 0) {
    throw new ConvexError("Pick at least one squad for this session.");
  }
  const unique = [...new Set(squadIds)];
  for (const id of unique) {
    const squad = await ctx.db.get(id);
    if (!squad) throw new ConvexError("One of the chosen squads no longer exists.");
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createOneOffSession = mutation({
  args: {
    date: v.string(),
    startMin: v.number(),
    endMin: v.number(),
    squadIds: v.array(v.id("squads")),
    label: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) {
      throw new ConvexError(
        "You aren't assigned to a club yet. Ask an admin to add you to one.",
      );
    }
    cleanTimes(args.startMin, args.endMin);
    return await ctx.db.insert("sessions", {
      clubId: profile.clubId,
      date: cleanDate(args.date),
      startMin: args.startMin,
      endMin: args.endMin,
      squadIds: await cleanSquadIds(ctx, args.squadIds),
      label: cleanLabel(args.label),
      location: cleanOptional(args.location),
      patternId: undefined, // a one-off is definitionally hand-authored
      status: "SCHEDULED",
      overridden: true,
      createdBy: profile._id,
      createdAt: Date.now(),
    });
  },
});

export const updateSession = mutation({
  args: {
    sessionId: v.id("sessions"),
    date: v.optional(v.string()),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    squadIds: v.optional(v.array(v.id("squads"))),
    label: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    assertManagesClub(profile, session.clubId);

    const nextStart = args.startMin ?? session.startMin;
    const nextEnd = args.endMin ?? session.endMin;
    if (args.startMin !== undefined || args.endMin !== undefined) {
      cleanTimes(nextStart, nextEnd);
    }

    const patch: Partial<Doc<"sessions">> = {
      overridden: true, // a hand edit — survives pattern regeneration
      lastEditedBy: profile._id,
      updatedAt: Date.now(),
    };
    let newDate: string | undefined;
    if (args.date !== undefined) {
      newDate = cleanDate(args.date);
      patch.date = newDate;
    }
    if (args.startMin !== undefined) patch.startMin = args.startMin;
    if (args.endMin !== undefined) patch.endMin = args.endMin;
    if (args.squadIds !== undefined) patch.squadIds = await cleanSquadIds(ctx, args.squadIds);
    if (args.label !== undefined) patch.label = cleanLabel(args.label);
    if (args.location !== undefined) patch.location = cleanOptional(args.location);

    await ctx.db.patch(args.sessionId, patch);

    // Keep the denormalised attendance.date in sync so by_swimmer_date reads stay
    // correct (§R18 R1).
    if (newDate !== undefined && newDate !== session.date) {
      const rows = await ctx.db
        .query("attendance")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .take(1000);
      for (const row of rows) await ctx.db.patch(row._id, { date: newDate });
    }
    return null;
  },
});

export const cancelSession = mutation({
  args: { sessionId: v.id("sessions"), cancelled: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    assertManagesClub(profile, session.clubId);
    const cancelled = args.cancelled ?? true;
    await ctx.db.patch(args.sessionId, {
      status: cancelled ? "CANCELLED" : "SCHEDULED",
      overridden: true,
      lastEditedBy: profile._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    assertManagesClub(profile, session.clubId);

    // Only a one-off (no pattern) with zero marks may be hard-deleted; everything
    // else is cancel-only, so history and pattern lineage survive (§R18).
    if (session.patternId) {
      throw new ConvexError("Cancel this session instead — it belongs to a schedule.");
    }
    const marked = await ctx.db
      .query("attendance")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (marked) {
      throw new ConvexError("Cancel this session instead — it already has attendance.");
    }
    await ctx.db.delete(args.sessionId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const sessionSummary = v.object({
  _id: v.id("sessions"),
  date: v.string(),
  startMin: v.number(),
  endMin: v.number(),
  label: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  status: sessionStatusV,
  squadIds: v.array(v.id("squads")),
  squadNames: v.array(v.string()),
  present: v.number(),
  late: v.number(),
  absent: v.number(),
  excused: v.number(),
  marked: v.number(),
  total: v.number(), // roster size
  // Set only when the query is filtered to a single swimmer: that swimmer's
  // status on this session (null = unmarked).
  swimmerStatus: v.union(attendanceStatus, v.null()),
});

/**
 * Every session in the coach's club within [from, to], with a per-session
 * attendance summary. Optionally narrowed to one squad and/or one swimmer; a
 * swimmer filter also colours each session by that swimmer's own status (the
 * single-swimmer calendar state). Coach-only.
 */
export const listSessionsInRange = query({
  args: {
    from: v.string(),
    to: v.string(),
    squadId: v.optional(v.id("squads")),
    swimmerId: v.optional(v.id("swimmers")),
  },
  returns: v.array(sessionSummary),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) return [];
    const from = cleanIsoDate(args.from);
    const to = cleanIsoDate(args.to);
    if (from === null || to === null || from > to) return [];

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_club_date", (q) =>
        q.eq("clubId", profile.clubId!).gte("date", from).lte("date", to),
      )
      .take(2000);

    // The swimmer's own squads — a session is on their roster iff it targets one
    // of these (roster = union of target squads' members).
    let swimmerSquads: Set<string> | null = null;
    if (args.swimmerId) {
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId!))
        .take(100);
      swimmerSquads = new Set(memberships.map((m) => String(m.squadId)));
    }

    // Cache each squad's active member ids + name across the whole month.
    const squadMembers = new Map<string, Id<"swimmers">[]>();
    const squadName = new Map<string, string>();
    const activeMembers = async (squadId: Id<"squads">): Promise<Id<"swimmers">[]> => {
      const key = String(squadId);
      const cached = squadMembers.get(key);
      if (cached) return cached;
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_squad", (q) => q.eq("squadId", squadId))
        .take(500);
      const ids: Id<"swimmers">[] = [];
      for (const m of memberships) {
        const swimmer = await ctx.db.get(m.swimmerId);
        if (swimmer && swimmer.active) ids.push(m.swimmerId);
      }
      squadMembers.set(key, ids);
      return ids;
    };
    const nameOf = async (squadId: Id<"squads">): Promise<string> => {
      const key = String(squadId);
      const cached = squadName.get(key);
      if (cached !== undefined) return cached;
      const squad = await ctx.db.get(squadId);
      const name = squad?.name ?? "Unknown squad";
      squadName.set(key, name);
      return name;
    };

    const results = [];
    for (const s of sessions) {
      if (args.squadId && !s.squadIds.some((id) => id === args.squadId)) continue;
      if (swimmerSquads && !s.squadIds.some((id) => swimmerSquads!.has(String(id)))) {
        continue;
      }

      // Roster size = union of active members across the session's squads.
      const rosterSet = new Set<string>();
      for (const squadId of s.squadIds) {
        for (const id of await activeMembers(squadId)) rosterSet.add(String(id));
      }

      const rows = await ctx.db
        .query("attendance")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .take(1000);
      let present = 0;
      let late = 0;
      let absent = 0;
      let excused = 0;
      let swimmerStatus: Doc<"attendance">["status"] | null = null;
      for (const r of rows) {
        if (r.status === "PRESENT") present++;
        else if (r.status === "LATE") late++;
        else if (r.status === "ABSENT") absent++;
        else if (r.status === "EXCUSED") excused++;
        if (args.swimmerId && r.swimmerId === args.swimmerId) swimmerStatus = r.status;
      }

      results.push({
        _id: s._id,
        date: s.date,
        startMin: s.startMin,
        endMin: s.endMin,
        label: s.label ?? null,
        location: s.location ?? null,
        status: s.status,
        squadIds: s.squadIds,
        squadNames: await Promise.all(s.squadIds.map(nameOf)),
        present,
        late,
        absent,
        excused,
        marked: present + late + absent + excused,
        total: rosterSet.size,
        swimmerStatus,
      });
    }

    results.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startMin - b.startMin,
    );
    return results;
  },
});

const rosterEntry = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  status: v.union(attendanceStatus, v.null()),
  note: v.union(v.string(), v.null()),
  noteVisibleToViewer: v.boolean(),
});

/**
 * A single session's roster for the marking view: every active swimmer across its
 * target squads (deduped), joined to any existing mark. `isFuture` tells the
 * client to allow only EXCUSED (an advance absence must be an excusal). Coach-only.
 */
export const getSessionRoster = query({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    session: v.object({
      _id: v.id("sessions"),
      date: v.string(),
      startMin: v.number(),
      endMin: v.number(),
      label: v.union(v.string(), v.null()),
      location: v.union(v.string(), v.null()),
      status: sessionStatusV,
      squadIds: v.array(v.id("squads")),
      squadNames: v.array(v.string()),
      patternId: v.union(v.id("sessionPatterns"), v.null()),
    }),
    isFuture: v.boolean(),
    roster: v.array(rosterEntry),
  }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    assertManagesClub(profile, session.clubId);

    const swimmers = await rosterSwimmers(ctx, session.squadIds);
    const marks = await attendanceBySwimmer(ctx, args.sessionId);
    const squadNames: string[] = [];
    for (const id of session.squadIds) {
      const squad = await ctx.db.get(id);
      squadNames.push(squad?.name ?? "Unknown squad");
    }

    return {
      session: {
        _id: session._id,
        date: session.date,
        startMin: session.startMin,
        endMin: session.endMin,
        label: session.label ?? null,
        location: session.location ?? null,
        status: session.status,
        squadIds: session.squadIds,
        squadNames,
        patternId: session.patternId ?? null,
      },
      isFuture: session.date > todayIso(),
      roster: swimmers.map((s) => {
        const mark = marks.get(s._id);
        return {
          swimmerId: s._id,
          name: s.name,
          status: mark?.status ?? null,
          note: mark?.note ?? null,
          noteVisibleToViewer: mark?.noteVisibleToViewer ?? false,
        };
      }),
    };
  },
});
