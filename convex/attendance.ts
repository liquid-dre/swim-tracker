import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  accessibleSwimmerIds,
  assertCoachManagesSwimmer,
  requireCoach,
  requireSwimmerAccess,
} from "./authz";
import { assertManagesClub, attendanceBySwimmer, rosterSwimmers } from "./attendanceShared";
import {
  cleanIsoDate,
  computeRates,
  resolveSeasonEnd,
  todayIso,
} from "./attendanceLib";
import { rollingSeasonStart } from "../lib/swim";

/*
  Attendance marks (§R18) — the coach action and the reads swimmers/parents get.

  Marking rules:
    • A mark is one row per (session, swimmer); unmarked leaves no row.
    • A swimmer may only be marked on a session their squad membership puts on the
      roster, in the coach's own club, on a session that isn't cancelled.
    • FUTURE sessions accept only EXCUSED — an absence recorded ahead of time must
      be a communicated excusal, never a bare "absent"/"present".

  Viewer reads strip the private coaching `note` unless the coach flagged that mark
  visible-to-swimmer. Viewers get no attendance-rate summary (a product choice).
*/

const attendanceStatus = v.union(
  v.literal("PRESENT"),
  v.literal("ABSENT"),
  v.literal("LATE"),
  v.literal("EXCUSED"),
);
const sessionStatusV = v.union(v.literal("SCHEDULED"), v.literal("CANCELLED"));

function cleanNote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 2000) throw new ConvexError("That note is too long.");
  return trimmed === "" ? undefined : trimmed;
}

/** The swimmer's live squad ids, as a set of strings. */
async function swimmerSquadSet(
  ctx: QueryCtx | MutationCtx,
  swimmerId: Id<"swimmers">,
): Promise<Set<string>> {
  const memberships = await ctx.db
    .query("squadMemberships")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .take(100);
  return new Set(memberships.map((m) => String(m.squadId)));
}

/** True when the session targets at least one squad the swimmer belongs to. */
function onRoster(session: Doc<"sessions">, swimmerSquads: Set<string>): boolean {
  return session.squadIds.some((id) => swimmerSquads.has(String(id)));
}

// ---------------------------------------------------------------------------
// Mutations (coach-only)
// ---------------------------------------------------------------------------

export const markAttendance = mutation({
  args: {
    sessionId: v.id("sessions"),
    swimmerId: v.id("swimmers"),
    status: attendanceStatus,
    note: v.optional(v.string()),
    noteVisibleToViewer: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    assertManagesClub(profile, session.clubId);
    if (session.status === "CANCELLED") {
      throw new ConvexError("This session is cancelled.");
    }

    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);
    if (!swimmer.active) throw new ConvexError("That swimmer is not active.");

    const squads = await swimmerSquadSet(ctx, args.swimmerId);
    if (!onRoster(session, squads)) {
      throw new ConvexError("That swimmer isn't on this session's roster.");
    }

    // Future sessions: only an EXCUSED (pre-excusal) is permitted.
    if (session.date > todayIso() && args.status !== "EXCUSED") {
      throw new ConvexError(
        "Only 'Excused' can be set for a future session — mark present, late or absent once it has taken place.",
      );
    }

    const note = cleanNote(args.note);
    const noteVisibleToViewer = args.noteVisibleToViewer ?? false;

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("swimmerId"), args.swimmerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        note,
        noteVisibleToViewer,
        lastEditedBy: profile._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("attendance", {
        sessionId: args.sessionId,
        swimmerId: args.swimmerId,
        clubId: session.clubId,
        date: session.date,
        status: args.status,
        note,
        noteVisibleToViewer,
        enteredBy: profile._id,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const markAllRemainingPresent = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ marked: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    assertManagesClub(profile, session.clubId);
    if (session.status === "CANCELLED") {
      throw new ConvexError("This session is cancelled.");
    }
    if (session.date > todayIso()) {
      throw new ConvexError("You can't mark a future session present.");
    }

    const roster = await rosterSwimmers(ctx, session.squadIds);
    const marks = await attendanceBySwimmer(ctx, args.sessionId);
    let marked = 0;
    for (const swimmer of roster) {
      if (marks.has(swimmer._id)) continue; // leave existing marks untouched
      await ctx.db.insert("attendance", {
        sessionId: args.sessionId,
        swimmerId: swimmer._id,
        clubId: session.clubId,
        date: session.date,
        status: "PRESENT",
        noteVisibleToViewer: false,
        enteredBy: profile._id,
        createdAt: Date.now(),
      });
      marked++;
    }
    return { marked };
  },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Resolve the club-wide season window (custom or rolling default, capped end). */
async function seasonWindow(
  ctx: QueryCtx,
): Promise<{ start: string; end: string }> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "app"))
    .unique();
  const today = todayIso();
  const start = row?.seasonStart ?? rollingSeasonStart(today);
  const end = resolveSeasonEnd(start, row?.seasonEnd ?? null);
  return { start, end };
}

/**
 * The combined attendance calendar for a viewer's linked swimmer(s) across
 * [from, to] — every session those swimmers are rostered for (including upcoming
 * ones), each carrying a per-swimmer status. A private `note` is included only
 * when the mark is flagged visible-to-swimmer (or the caller is staff). A single
 * `swimmerId` narrows it to one linked swimmer. No rate summary (§R18).
 */
export const getViewerCalendar = query({
  args: {
    from: v.string(),
    to: v.string(),
    swimmerId: v.optional(v.id("swimmers")),
  },
  returns: v.object({
    swimmers: v.array(v.object({ swimmerId: v.id("swimmers"), name: v.string() })),
    sessions: v.array(
      v.object({
        _id: v.id("sessions"),
        date: v.string(),
        startMin: v.number(),
        endMin: v.number(),
        label: v.union(v.string(), v.null()),
        location: v.union(v.string(), v.null()),
        status: sessionStatusV,
        perSwimmer: v.array(
          v.object({
            swimmerId: v.id("swimmers"),
            name: v.string(),
            status: v.union(attendanceStatus, v.null()),
            note: v.union(v.string(), v.null()),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const from = cleanIsoDate(args.from);
    const to = cleanIsoDate(args.to);
    if (from === null || to === null || from > to) {
      return { swimmers: [], sessions: [] };
    }

    // Resolve the target swimmer set, role-scoped.
    let role: Doc<"profiles">["role"];
    let targetIds: Id<"swimmers">[];
    if (args.swimmerId) {
      const profile = await requireSwimmerAccess(ctx, args.swimmerId);
      role = profile.role;
      targetIds = [args.swimmerId];
    } else {
      const { profile, swimmerIds } = await accessibleSwimmerIds(ctx);
      role = profile.role;
      // Staff have no "linked" set; they use the coach calendar. Require an
      // explicit swimmer to avoid an unbounded all-club read here.
      targetIds = swimmerIds === "ALL" ? [] : swimmerIds;
    }
    if (targetIds.length === 0) return { swimmers: [], sessions: [] };

    // Each target's name, club and squads.
    const targets: Array<{
      id: Id<"swimmers">;
      name: string;
      clubId: Id<"clubs"> | null;
      squads: Set<string>;
    }> = [];
    for (const id of targetIds) {
      const swimmer = await ctx.db.get(id);
      if (!swimmer) continue;
      targets.push({
        id,
        name: swimmer.name,
        clubId: swimmer.clubId ?? null,
        squads: await swimmerSquadSet(ctx, id),
      });
    }

    // Sessions across every club the target swimmers belong to, within range.
    const clubIds = [...new Set(targets.map((t) => t.clubId).filter(Boolean))] as Id<"clubs">[];
    const sessions: Doc<"sessions">[] = [];
    for (const clubId of clubIds) {
      const rows = await ctx.db
        .query("sessions")
        .withIndex("by_club_date", (q) =>
          q.eq("clubId", clubId).gte("date", from).lte("date", to),
        )
        .take(2000);
      sessions.push(...rows);
    }

    const isViewer = role === "VIEWER";
    const out = [];
    for (const s of sessions) {
      // Which targets are on THIS session's roster.
      const onIt = targets.filter((t) => onRoster(s, t.squads));
      if (onIt.length === 0) continue;

      const marks = await attendanceBySwimmer(ctx, s._id);
      const perSwimmer = onIt.map((t) => {
        const mark = marks.get(t.id);
        const showNote = mark && (!isViewer || mark.noteVisibleToViewer);
        return {
          swimmerId: t.id,
          name: t.name,
          status: mark?.status ?? null,
          note: showNote ? (mark!.note ?? null) : null,
        };
      });

      out.push({
        _id: s._id,
        date: s.date,
        startMin: s.startMin,
        endMin: s.endMin,
        label: s.label ?? null,
        location: s.location ?? null,
        status: s.status,
        perSwimmer,
      });
    }
    out.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startMin - b.startMin,
    );

    return {
      swimmers: targets.map((t) => ({ swimmerId: t.id, name: t.name })),
      sessions: out,
    };
  },
});

/**
 * A swimmer's attendance figure over the season (or an explicit range): attended /
 * eligible, with the excused count. Feeds the per-swimmer stat on the coach's
 * swimmer profile. Role-scoped (a viewer could read their own swimmer's, but the
 * viewer UI doesn't surface a summary).
 */
export const getSwimmerAttendanceFigure = query({
  args: {
    swimmerId: v.id("swimmers"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  returns: v.object({
    present: v.number(),
    absent: v.number(),
    late: v.number(),
    excused: v.number(),
    marked: v.number(),
    attended: v.number(),
    eligible: v.number(),
    ratePct: v.union(v.number(), v.null()),
    from: v.string(),
    to: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireSwimmerAccess(ctx, args.swimmerId);
    const window = await seasonWindow(ctx);
    const from = cleanIsoDate(args.from ?? "") ?? window.start;
    const to = cleanIsoDate(args.to ?? "") ?? window.end;

    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_swimmer_date", (q) =>
        q.eq("swimmerId", args.swimmerId).gte("date", from).lte("date", to),
      )
      .take(2000);

    return { ...computeRates(rows), from, to };
  },
});
