import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCoach } from "./authz";
import {
  prepareStandardImport,
  pickApplicableStandards,
  resolveStandardTime,
  isValidEvent,
  tierCoversEvent,
  eventLabel,
  type EventDef,
  type PreparedStandard,
  type RawStandardRow,
} from "../lib/swim";
import { SAMPLE_STANDARDS } from "./standardsSampleData";

// STEP 8: qualifying-standards data + resolution (BRD §4.9). LCM only; tier
// order SANJ > LEVEL_3 > LEVEL_2. The judgement (parse, whitelist, coverage,
// catch-all resolution) is pure and unit-tested in ../lib/swim; these Convex
// functions are thin wrappers that add DB I/O, idempotency, and auth.

// Shared validators (mirror schema.ts).
const tierValidator = v.union(
  v.literal("LEVEL_2"),
  v.literal("LEVEL_3"),
  v.literal("SANJ"),
);
const genderValidator = v.union(v.literal("M"), v.literal("F"));
const distanceValidator = v.union(
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const strokeValidator = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);

// ---------------------------------------------------------------------------
// Idempotent upsert of the accepted rows.
// ---------------------------------------------------------------------------
//
// A standard's identity is (tier, gender, distance, stroke, age): re-running an
// import must never duplicate. Convex mutations are transactional, so reads see
// writes made earlier in the same call — a duplicate key within one batch also
// collapses onto the same row.

async function upsertPreparedStandards(
  ctx: MutationCtx,
  accepted: ReadonlyArray<PreparedStandard>,
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const s of accepted) {
    const siblings = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", s.gender)
          .eq("distance", s.distance)
          .eq("stroke", s.stroke)
          .eq("tier", s.tier),
      )
      .take(200);
    const existing = siblings.find((row) => row.age === s.age);

    if (!existing) {
      await ctx.db.insert("standards", {
        tier: s.tier,
        gender: s.gender,
        distance: s.distance,
        stroke: s.stroke,
        age: s.age,
        isCatchAllYoung: s.isCatchAllYoung,
        isCatchAllOld: s.isCatchAllOld,
        timeMs: s.timeMs,
      });
      inserted++;
      continue;
    }

    const changed =
      existing.timeMs !== s.timeMs ||
      existing.isCatchAllYoung !== s.isCatchAllYoung ||
      existing.isCatchAllOld !== s.isCatchAllOld;

    if (changed) {
      await ctx.db.patch(existing._id, {
        timeMs: s.timeMs,
        isCatchAllYoung: s.isCatchAllYoung,
        isCatchAllOld: s.isCatchAllOld,
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  return { inserted, updated, unchanged };
}

async function loadEvents(ctx: MutationCtx): Promise<EventDef[]> {
  // The whitelist is tiny and fixed (§4.3); a bounded read covers it.
  const events = await ctx.db.query("events").take(200);
  return events.map((e) => ({
    distance: e.distance,
    stroke: e.stroke,
    allowedCourses: e.allowedCourses,
    active: e.active,
    label: e.label,
  }));
}

// ---------------------------------------------------------------------------
// importStandards — idempotent bulk load from the cleaned CSV (§4.9, §5.9).
// ---------------------------------------------------------------------------
//
// Field-level validators are intentionally LOOSE (v.string()/v.number()) so a
// bad row reaches our own validator and is REPORTED with a reason rather than
// failing the whole batch at the arg-validation layer. Coach-only.

const rawRowValidator = v.object({
  tier: v.string(),
  gender: v.string(),
  distance: v.number(),
  stroke: v.string(),
  age: v.number(),
  isCatchAllYoung: v.boolean(),
  isCatchAllOld: v.boolean(),
  time: v.string(),
});

export const importStandards = mutation({
  args: { rows: v.array(rawRowValidator) },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    acceptedCount: v.number(),
    rejectedCount: v.number(),
    rejected: v.array(
      v.object({
        index: v.number(),
        reason: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { rows }) => {
    await requireCoach(ctx);
    const events = await loadEvents(ctx);
    const { accepted, rejected } = prepareStandardImport(
      rows as RawStandardRow[],
      events,
    );
    const counts = await upsertPreparedStandards(ctx, accepted);
    return {
      ...counts,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      // Report bad rows (index + reason); the full row stays server-side.
      rejected: rejected.map((r) => ({ index: r.index, reason: r.reason })),
    };
  },
});

// Minimal trigger: run from the Convex dashboard to seed a sample set of cuts
// (mirrors events.seedEvents). Same import pipeline, so it is idempotent and
// reports any bad sample row rather than dropping it. No custom UI — the full
// standards-management screen (view/edit + CSV upload) is Step 10.
export const importSampleStandards = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await loadEvents(ctx);
    const { accepted, rejected } = prepareStandardImport(
      SAMPLE_STANDARDS as RawStandardRow[],
      events,
    );
    const counts = await upsertPreparedStandards(ctx, accepted);
    return {
      ...counts,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      rejected: rejected.map((r) => ({ index: r.index, reason: r.reason })),
    };
  },
});

// ---------------------------------------------------------------------------
// Coach standards editor — list + single-cut mutations (§5.8, §5.9, Step 9).
// ---------------------------------------------------------------------------
//
// These power the /standards screen. Every edit is the single source of truth
// for every chart and the status matrix — no cut value is hard-coded anywhere.
// Coach-only, like the whole screen.

const standardShape = v.object({
  _id: v.id("standards"),
  tier: tierValidator,
  gender: genderValidator,
  distance: distanceValidator,
  stroke: strokeValidator,
  age: v.number(),
  isCatchAllYoung: v.boolean(),
  isCatchAllOld: v.boolean(),
  timeMs: v.number(),
});

/** listStandards — every cut, for the coach editor to filter/group client-side. */
export const listStandards = query({
  args: {},
  returns: v.array(standardShape),
  handler: async (ctx) => {
    await requireCoach(ctx);
    // The full table is small (a few hundred rows); a bounded read covers it.
    const rows = await ctx.db.query("standards").take(2000);
    return rows.map((r) => ({
      _id: r._id,
      tier: r.tier,
      gender: r.gender,
      distance: r.distance,
      stroke: r.stroke,
      age: r.age,
      isCatchAllYoung: r.isCatchAllYoung,
      isCatchAllOld: r.isCatchAllOld,
      timeMs: r.timeMs,
    }));
  },
});

// Shared domain validation for a single cut (mirrors prepareStandardImport's
// rules): LCM event, tier coverage, sane age, one catch-all flag at most, and a
// positive integer-ms time. Throws with a coach-readable message on any breach.
function assertValidCut(
  cut: {
    tier: Doc<"standards">["tier"];
    gender: Doc<"standards">["gender"];
    distance: Doc<"standards">["distance"];
    stroke: Doc<"standards">["stroke"];
    age: number;
    isCatchAllYoung: boolean;
    isCatchAllOld: boolean;
    timeMs: number;
  },
  events: EventDef[],
): void {
  if (cut.isCatchAllYoung && cut.isCatchAllOld) {
    throw new Error("A cut can't be both a youngest and an oldest catch-all.");
  }
  if (!Number.isInteger(cut.age) || cut.age <= 0 || cut.age > 100) {
    throw new Error(`Invalid age "${cut.age}".`);
  }
  if (!Number.isInteger(cut.timeMs) || cut.timeMs <= 0) {
    throw new Error("Enter a valid time.");
  }
  if (!isValidEvent(cut.distance, cut.stroke, "LCM", events)) {
    throw new Error(`${eventLabel(cut.distance, cut.stroke)} is not a long-course event.`);
  }
  if (!tierCoversEvent(cut.tier, cut.distance, cut.stroke)) {
    throw new Error(
      `That tier has no cut for ${eventLabel(cut.distance, cut.stroke)}.`,
    );
  }
}

/** createStandard — add a single missing cut (§5.8). Coach-only. */
export const createStandard = mutation({
  args: {
    tier: tierValidator,
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    age: v.number(),
    isCatchAllYoung: v.boolean(),
    isCatchAllOld: v.boolean(),
    timeMs: v.number(),
  },
  returns: v.id("standards"),
  handler: async (ctx, args) => {
    await requireCoach(ctx);
    const events = await loadEvents(ctx);
    assertValidCut(args, events);

    // A cut's identity is (tier, gender, distance, stroke, age) — never dupe it.
    const siblings = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", args.gender)
          .eq("distance", args.distance)
          .eq("stroke", args.stroke)
          .eq("tier", args.tier),
      )
      .take(200);
    if (siblings.some((s) => s.age === args.age)) {
      throw new Error(
        "A cut already exists for that age and tier — edit it instead.",
      );
    }

    return await ctx.db.insert("standards", {
      tier: args.tier,
      gender: args.gender,
      distance: args.distance,
      stroke: args.stroke,
      age: args.age,
      isCatchAllYoung: args.isCatchAllYoung,
      isCatchAllOld: args.isCatchAllOld,
      timeMs: args.timeMs,
    });
  },
});

/** updateStandard — edit a cut's time (§5.8). The one field a coach corrects. */
export const updateStandard = mutation({
  args: { standardId: v.id("standards"), timeMs: v.number() },
  returns: v.null(),
  handler: async (ctx, { standardId, timeMs }) => {
    await requireCoach(ctx);
    const existing = await ctx.db.get(standardId);
    if (!existing) throw new Error("That cut no longer exists.");
    if (!Number.isInteger(timeMs) || timeMs <= 0) {
      throw new Error("Enter a valid time.");
    }
    await ctx.db.patch(standardId, { timeMs });
    return null;
  },
});

/** deleteStandard — remove a cut (§5.8). Idempotent. */
export const deleteStandard = mutation({
  args: { standardId: v.id("standards") },
  returns: v.null(),
  handler: async (ctx, { standardId }) => {
    await requireCoach(ctx);
    const existing = await ctx.db.get(standardId);
    if (existing) await ctx.db.delete(standardId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// resolveStandard — the cut (ms) for an exact age, or null (§4.9). LCM only.
// ---------------------------------------------------------------------------

export const resolveStandard = query({
  args: {
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    tier: tierValidator,
    exactAge: v.number(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { gender, distance, stroke, tier, exactAge }) => {
    await requireCoach(ctx);
    const cuts = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", gender)
          .eq("distance", distance)
          .eq("stroke", stroke)
          .eq("tier", tier),
      )
      .take(200);
    return resolveStandardTime(cuts, exactAge);
  },
});

// ---------------------------------------------------------------------------
// getApplicableStandards — L2/L3/SANJ cuts for an exact age, omitting missing
// tiers (§4.9, §5.5). LCM only.
// ---------------------------------------------------------------------------

export const getApplicableStandards = query({
  args: {
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    age: v.number(),
  },
  returns: v.object({
    LEVEL_2: v.optional(v.number()),
    LEVEL_3: v.optional(v.number()),
    SANJ: v.optional(v.number()),
  }),
  handler: async (ctx, { gender, distance, stroke, age }) => {
    await requireCoach(ctx);
    const rows: Doc<"standards">[] = await ctx.db
      .query("standards")
      .withIndex("by_event", (q) =>
        q.eq("gender", gender).eq("distance", distance).eq("stroke", stroke),
      )
      .take(500);
    return pickApplicableStandards(rows, age);
  },
});
