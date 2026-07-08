import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireCoach, requireSignedIn, requireSuperUser } from "./authz";
import {
  computeAge,
  computePersonalBests,
  eventLabel,
  eventSortKey,
  resolveStandardTime,
  tierCoversEvent,
  TIER_ORDER,
  type ResultForPB,
  type StandardCut,
  type Tier,
  type TourDateByTier,
} from "../lib/swim";

/*
  Tour dates (docs/access-control.md): global reference data the SUPER_USER
  maintains and every role reads. One date per tier. When a tier has a date,
  qualifying surfaces judge swimmers against the cut for the age they will be
  on tour day; without one, behaviour is unchanged (age as swum, §4.9).
*/

const tierValidator = v.union(
  v.literal("LEVEL_2"),
  v.literal("LEVEL_3"),
  v.literal("SANJ"),
);

const NAME_MAX = 80;

/** Validate a super-user-entered tour date (future dates are the norm). */
function cleanTourDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ConvexError("Tour date must be a date in YYYY-MM-DD form.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new ConvexError("That is not a real date.");
  }
  return trimmed;
}

/** Shared loader for the analysis queries: tier → tour date (absent = unset). */
export async function loadTourDates(
  ctx: QueryCtx | MutationCtx,
): Promise<TourDateByTier> {
  const rows = await ctx.db.query("tours").take(10);
  const byTier: TourDateByTier = {};
  for (const row of rows) byTier[row.tier as Tier] = row.date;
  return byTier;
}

export const listTours = query({
  args: {},
  returns: v.array(
    v.object({
      tier: tierValidator,
      date: v.string(),
      name: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    // Reference data: coaches and viewers alike read it (a viewer's Road
    // screen explains resolution with it), but only a super-user writes.
    await requireSignedIn(ctx);
    const rows = await ctx.db.query("tours").take(10);
    return rows.map((r) => ({ tier: r.tier, date: r.date, name: r.name ?? null }));
  },
});

export const setTour = mutation({
  args: {
    tier: tierValidator,
    date: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);

    const date = cleanTourDate(args.date);
    const name = args.name?.trim() || undefined;
    if (name && name.length > NAME_MAX) {
      throw new ConvexError("Tour name is too long.");
    }

    const existing = await ctx.db
      .query("tours")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { date, name });
    } else {
      await ctx.db.insert("tours", { tier: args.tier, date, name });
    }
    return null;
  },
});

export const clearTour = mutation({
  args: { tier: tierValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);
    const existing = await ctx.db
      .query("tours")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// getTourQualification — who is going to which tour (coach-only)
// ---------------------------------------------------------------------------
//
// The forward-looking counterpart to the status matrix: for each tier
// (hardest first), the swimmers whose headline LCM MEET PBs meet at least one
// of that tier's cuts, each listed ONLY under the highest tour they qualify
// for. Cuts resolve per the tour rule: age ON TOUR DAY when the tier has a
// date, else the age each PB was swum (§4.9). Meet times only; LCM only.

const QUAL_SWIMMERS_LIMIT = 500;
const QUAL_STANDARDS_LIMIT = 5000;
const QUAL_RESULTS_LIMIT = 2000;

const qualifyingEvent = v.object({
  label: v.string(),
  pbMs: v.number(),
  cutMs: v.number(),
  marginMs: v.number(), // cut − PB, ≥ 0: how far inside the cut the PB sits
});

const qualifiedSwimmer = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  // Age on tour day when this tier has a date; today's age otherwise.
  age: v.number(),
  events: v.array(qualifyingEvent),
});

export const getTourQualification = query({
  args: {},
  returns: v.object({
    hasStandards: v.boolean(),
    hasSwimmers: v.boolean(),
    tiers: v.array(
      v.object({
        tier: tierValidator,
        tour: v.union(
          v.null(),
          v.object({ name: v.union(v.string(), v.null()), date: v.string() }),
        ),
        swimmers: v.array(qualifiedSwimmer),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireCoach(ctx);

    const tourRows = await ctx.db.query("tours").take(10);
    const tourByTier = new Map(tourRows.map((t) => [t.tier as Tier, t]));

    // Cuts grouped by (gender|distance|stroke|tier is kept on the row).
    const allStandards = await ctx.db
      .query("standards")
      .take(QUAL_STANDARDS_LIMIT);
    const cutsByEvent = new Map<string, Array<StandardCut & { tier: Tier }>>();
    for (const s of allStandards) {
      const key = `${s.gender}|${s.distance}|${s.stroke}`;
      const cut: StandardCut & { tier: Tier } = {
        tier: s.tier,
        age: s.age,
        isCatchAllYoung: s.isCatchAllYoung,
        isCatchAllOld: s.isCatchAllOld,
        timeMs: s.timeMs,
      };
      const arr = cutsByEvent.get(key);
      if (arr) arr.push(cut);
      else cutsByEvent.set(key, [cut]);
    }

    // The active roster — "who's going" is a question about current swimmers.
    const swimmers = await ctx.db
      .query("swimmers")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(QUAL_SWIMMERS_LIMIT);
    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    const today = new Date().toISOString().slice(0, 10);
    const byTier = new Map<
      Tier,
      Array<{
        swimmerId: typeof swimmers[number]["_id"];
        name: string;
        age: number;
        events: Array<{ label: string; pbMs: number; cutMs: number; marginMs: number }>;
      }>
    >(TIER_ORDER.map((t) => [t, []]));

    for (const swimmer of swimmers) {
      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(QUAL_RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);
      const lcmPbs = pbs.filter((pb) => pb.course === "LCM" && pb.headline);
      if (lcmPbs.length === 0) continue;

      const ageToday = computeAge(swimmer.dob, today);

      // Highest tour only: walk hardest → easiest and stop at the first tier
      // with at least one qualifying event.
      for (const tier of TIER_ORDER) {
        const tourDate = tourByTier.get(tier)?.date;
        const tourAge =
          tourDate !== undefined ? computeAge(swimmer.dob, tourDate) : null;

        const qualifying: Array<{
          sortKey: number;
          label: string;
          pbMs: number;
          cutMs: number;
          marginMs: number;
        }> = [];
        for (const pb of lcmPbs) {
          if (!tierCoversEvent(tier, pb.distance, pb.stroke)) continue;
          const headline = pb.headline!;
          const cutAge = tourAge ?? headline.ageAtSwim ?? ageToday;
          const cutMs = resolveStandardTime(
            (cutsByEvent.get(`${swimmer.gender}|${pb.distance}|${pb.stroke}`) ?? [])
              .filter((r) => r.tier === tier),
            cutAge,
          );
          if (cutMs === null || headline.timeMs > cutMs) continue;
          qualifying.push({
            sortKey: eventSortKey(pb.distance, pb.stroke),
            label: eventLabel(pb.distance, pb.stroke),
            pbMs: headline.timeMs,
            cutMs,
            marginMs: cutMs - headline.timeMs,
          });
        }

        if (qualifying.length > 0) {
          qualifying.sort((a, b) => a.sortKey - b.sortKey);
          byTier.get(tier)!.push({
            swimmerId: swimmer._id,
            name: swimmer.name,
            age: tourAge ?? ageToday,
            events: qualifying.map(({ sortKey: _sortKey, ...e }) => e),
          });
          break; // highest tour only
        }
      }
    }

    return {
      hasStandards: allStandards.length > 0,
      hasSwimmers: swimmers.length > 0,
      tiers: TIER_ORDER.map((tier) => {
        const tour = tourByTier.get(tier);
        return {
          tier,
          tour: tour ? { name: tour.name ?? null, date: tour.date } : null,
          swimmers: byTier.get(tier)!,
        };
      }),
    };
  },
});
