import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import { assertManagesClub } from "./attendanceShared";
import {
  datesForPattern,
  isValidMinuteOfDay,
  isValidWeekdays,
  resolveSeasonEnd,
  todayIso,
} from "./attendanceLib";
import { rollingSeasonStart } from "../lib/swim";

/*
  Recurring session patterns (§R18). A coach defines named weekly templates
  ("Evening — Mon–Fri 4:30pm, all squads"); each MATERIALISES concrete `sessions`
  across the current season window. The generator is the heart of the feature:

    • FREEZE the past — a session dated before today, or one that already carries
      any attendance mark, is historical record and never touched.
    • PRESERVE overrides — a session a coach hand-edited (`overridden`) survives
      regeneration unchanged (seniors-only that day, a moved time, a cancellation).
    • REGENERATE the future — remaining future sessions are re-derived from the
      pattern: valid dates refresh their time/squads, dropped dates are removed,
      new dates are inserted.

  All writes are club-scoped: a coach manages only their own club's patterns.
*/

const NAME_MAX = 80;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new ConvexError("Give this pattern a name.");
  if (trimmed.length > NAME_MAX) throw new ConvexError("That name is too long.");
  return trimmed;
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function cleanWeekdays(weekdays: number[]): number[] {
  if (!isValidWeekdays(weekdays)) {
    throw new ConvexError("Choose at least one day of the week.");
  }
  return [...weekdays].sort((a, b) => a - b);
}

function cleanTimes(startMin: number, endMin: number): void {
  if (!isValidMinuteOfDay(startMin) || !isValidMinuteOfDay(endMin)) {
    throw new ConvexError("Enter a valid start and end time.");
  }
  if (startMin >= endMin) {
    throw new ConvexError("The end time must be after the start time.");
  }
}

async function cleanSquadIds(
  ctx: MutationCtx,
  squadIds: Id<"squads">[],
): Promise<Id<"squads">[]> {
  if (squadIds.length === 0) {
    throw new ConvexError("Pick at least one squad for this pattern.");
  }
  const unique = [...new Set(squadIds)];
  for (const id of unique) {
    const squad = await ctx.db.get(id);
    if (!squad) throw new ConvexError("One of the chosen squads no longer exists.");
  }
  return unique;
}

/** The season window generation runs over: coach start (or rolling default), capped end. */
async function seasonWindow(
  ctx: QueryCtx | MutationCtx,
): Promise<{ start: string; end: string; source: "custom" | "rolling" }> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "app"))
    .unique();
  const today = todayIso();
  const start = row?.seasonStart ?? rollingSeasonStart(today);
  const end = resolveSeasonEnd(start, row?.seasonEnd ?? null);
  return { start, end, source: row?.seasonStart ? "custom" : "rolling" };
}

/**
 * Materialise/refresh a pattern's future sessions across [start, end]. Returns how
 * many NEW rows were inserted. Idempotent: running it twice with no changes is a
 * no-op. Never inserts a date before today and never mutates a frozen row.
 */
async function generateSessionsForPattern(
  ctx: MutationCtx,
  pattern: Doc<"sessionPatterns">,
  actorId: Id<"profiles">,
  window: { start: string; end: string },
): Promise<number> {
  const today = todayIso();
  const targetDates = new Set(
    pattern.active ? datesForPattern(pattern.weekdays, window.start, window.end) : [],
  );

  const existing = await ctx.db
    .query("sessions")
    .withIndex("by_pattern", (q) => q.eq("patternId", pattern._id))
    .take(2000);

  const keptDates = new Set<string>();
  for (const s of existing) {
    const attended =
      (await ctx.db
        .query("attendance")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .first()) !== null;
    // Frozen: the past, anything marked, and any hand-edited override. Leave it
    // and remember its date so we never insert a duplicate on top.
    if (s.date < today || attended || s.overridden) {
      keptDates.add(s.date);
      continue;
    }
    if (targetDates.has(s.date)) {
      // Still a valid occurrence — refresh it to the pattern's current schedule.
      await ctx.db.patch(s._id, {
        startMin: pattern.startMin,
        endMin: pattern.endMin,
        squadIds: pattern.squadIds,
        label: pattern.label,
        location: pattern.location,
      });
      keptDates.add(s.date);
    } else {
      // No longer produced by the pattern (weekday/window changed) — drop it.
      await ctx.db.delete(s._id);
    }
  }

  let generated = 0;
  for (const date of targetDates) {
    if (date < today || keptDates.has(date)) continue;
    await ctx.db.insert("sessions", {
      clubId: pattern.clubId,
      date,
      startMin: pattern.startMin,
      endMin: pattern.endMin,
      squadIds: pattern.squadIds,
      label: pattern.label,
      location: pattern.location,
      patternId: pattern._id,
      status: "SCHEDULED",
      overridden: false,
      createdBy: actorId,
      createdAt: Date.now(),
    });
    generated++;
  }
  return generated;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createPattern = mutation({
  args: {
    name: v.string(),
    weekdays: v.array(v.number()),
    startMin: v.number(),
    endMin: v.number(),
    squadIds: v.array(v.id("squads")),
    label: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  returns: v.object({ patternId: v.id("sessionPatterns"), generated: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) {
      throw new ConvexError(
        "You aren't assigned to a club yet. Ask an admin to add you to one.",
      );
    }
    const clubId = profile.clubId;
    cleanTimes(args.startMin, args.endMin);
    const patternId = await ctx.db.insert("sessionPatterns", {
      clubId,
      name: cleanName(args.name),
      weekdays: cleanWeekdays(args.weekdays),
      startMin: args.startMin,
      endMin: args.endMin,
      squadIds: await cleanSquadIds(ctx, args.squadIds),
      label: cleanOptional(args.label),
      location: cleanOptional(args.location),
      active: true,
      createdBy: profile._id,
      createdAt: Date.now(),
    });
    const pattern = (await ctx.db.get(patternId))!;
    const window = await seasonWindow(ctx);
    const generated = await generateSessionsForPattern(ctx, pattern, profile._id, window);
    return { patternId, generated };
  },
});

export const updatePattern = mutation({
  args: {
    patternId: v.id("sessionPatterns"),
    name: v.optional(v.string()),
    weekdays: v.optional(v.array(v.number())),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    squadIds: v.optional(v.array(v.id("squads"))),
    label: v.optional(v.string()),
    location: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.object({ generated: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const pattern = await ctx.db.get(args.patternId);
    if (!pattern) throw new ConvexError("Pattern not found.");
    assertManagesClub(profile, pattern.clubId);

    const nextStart = args.startMin ?? pattern.startMin;
    const nextEnd = args.endMin ?? pattern.endMin;
    if (args.startMin !== undefined || args.endMin !== undefined) {
      cleanTimes(nextStart, nextEnd);
    }

    const patch: Partial<Doc<"sessionPatterns">> = {
      lastEditedBy: profile._id,
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.weekdays !== undefined) patch.weekdays = cleanWeekdays(args.weekdays);
    if (args.startMin !== undefined) patch.startMin = args.startMin;
    if (args.endMin !== undefined) patch.endMin = args.endMin;
    if (args.squadIds !== undefined) patch.squadIds = await cleanSquadIds(ctx, args.squadIds);
    if (args.label !== undefined) patch.label = cleanOptional(args.label);
    if (args.location !== undefined) patch.location = cleanOptional(args.location);
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.patternId, patch);
    const updated = (await ctx.db.get(args.patternId))!;
    const window = await seasonWindow(ctx);
    const generated = await generateSessionsForPattern(ctx, updated, profile._id, window);
    return { generated };
  },
});

export const deletePattern = mutation({
  args: { patternId: v.id("sessionPatterns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const pattern = await ctx.db.get(args.patternId);
    if (!pattern) return null; // already gone
    assertManagesClub(profile, pattern.clubId);

    const today = todayIso();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_pattern", (q) => q.eq("patternId", args.patternId))
      .take(2000);
    for (const s of sessions) {
      const attended =
        (await ctx.db
          .query("attendance")
          .withIndex("by_session", (q) => q.eq("sessionId", s._id))
          .first()) !== null;
      // Delete only clean future occurrences. Anything past, marked, or hand-
      // edited is DETACHED (patternId cleared) so the history/override survives.
      if (s.date >= today && !attended && !s.overridden) {
        await ctx.db.delete(s._id);
      } else {
        await ctx.db.patch(s._id, { patternId: undefined });
      }
    }
    await ctx.db.delete(args.patternId);
    return null;
  },
});

/**
 * Re-materialise every active pattern across the current season window. The
 * "Generate season" action on the Schedule screen and the entry point to run
 * after the season dates change. Idempotent.
 */
export const regenerateSeason = mutation({
  args: {},
  returns: v.object({
    generated: v.number(),
    patternsRun: v.number(),
    from: v.string(),
    to: v.string(),
    seasonSource: v.union(v.literal("custom"), v.literal("rolling")),
  }),
  handler: async (ctx) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) {
      throw new ConvexError(
        "You aren't assigned to a club yet. Ask an admin to add you to one.",
      );
    }
    const window = await seasonWindow(ctx);
    const patterns = await ctx.db
      .query("sessionPatterns")
      .withIndex("by_club", (q) => q.eq("clubId", profile.clubId!))
      .take(500);
    let generated = 0;
    let patternsRun = 0;
    for (const pattern of patterns) {
      if (!pattern.active) continue;
      generated += await generateSessionsForPattern(ctx, pattern, profile._id, window);
      patternsRun++;
    }
    return {
      generated,
      patternsRun,
      from: window.start,
      to: window.end,
      seasonSource: window.source,
    };
  },
});

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export const listPatterns = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sessionPatterns"),
      name: v.string(),
      weekdays: v.array(v.number()),
      startMin: v.number(),
      endMin: v.number(),
      squadIds: v.array(v.id("squads")),
      squadNames: v.array(v.string()),
      label: v.union(v.string(), v.null()),
      location: v.union(v.string(), v.null()),
      active: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) return [];
    const patterns = await ctx.db
      .query("sessionPatterns")
      .withIndex("by_club", (q) => q.eq("clubId", profile.clubId!))
      .take(500);

    const squadName = new Map<Id<"squads">, string>();
    const resolve = async (id: Id<"squads">): Promise<string> => {
      const cached = squadName.get(id);
      if (cached !== undefined) return cached;
      const squad = await ctx.db.get(id);
      const name = squad?.name ?? "Unknown squad";
      squadName.set(id, name);
      return name;
    };

    const shaped = await Promise.all(
      patterns.map(async (p) => ({
        _id: p._id,
        name: p.name,
        weekdays: p.weekdays,
        startMin: p.startMin,
        endMin: p.endMin,
        squadIds: p.squadIds,
        squadNames: await Promise.all(p.squadIds.map(resolve)),
        label: p.label ?? null,
        location: p.location ?? null,
        active: p.active,
      })),
    );
    shaped.sort((a, b) => a.name.localeCompare(b.name));
    return shaped;
  },
});
