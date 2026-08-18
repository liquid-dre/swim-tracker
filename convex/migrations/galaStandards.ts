import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { GALA_SEED, type GalaCode } from "../../lib/galas";
import { STANDARDS_SEED_ROWS } from "../standardsSeedData";
import { parseTime, type Course, type Distance, type Stroke } from "../../lib/swim";

/*
  Migration: 3 tiers (LCM only) → 5 galas × 2 courses (§4.9, 2027 SSA tables)
  ===========================================================================

  What changes, and why it needs a migration at all:

    - `standards.tier` (a string union) becomes `standards.galaId` (an FK into
      the new `galas` table), so a new meet is data rather than a deploy.
    - `standards.course` is NEW and REQUIRED. Every gala publishes separate
      long- and short-course cuts and both are valid for entry, so course is
      part of a cut's identity — the old rows had no course at all ("LCM
      implied"), which would collide the moment SCM rows arrived.
    - `standards.age` becomes optional: SANS and SANY are OPEN galas with one
      cut for every age.
    - `tours` folds into `galas.tourDate` / `galas.tourName`.

  Convex validates documents at rest on every push, so this is the standard
  widen → migrate → narrow sequence (see .claude/skills/convex-migration-helper):

    1. WIDEN   Deploy the schema where `galaId`/`course`/`age` are optional and
               the deprecated `tier` + `tours` still exist. Old rows validate.
    2. MIGRATE npx convex run migrations/galaStandards:migrateToGalas
               Seeds the 5 galas (carrying any tour dates across), then replaces
               every standards row from data/qualifying-times.csv.
    3. NARROW  Deploy the schema where `galaId`/`course` are required, `tier` is
               gone and `tours` is dropped.

  Run step 2 promptly after step 1: between them the standards table still holds
  pre-galas rows that the new queries cannot resolve, so every qualifying surface
  shows its "standards not imported yet" empty state (never a wrong number).

  The cut VALUES are not backfilled row by row — they are fully replaced. That is
  deliberate: 89 of 108 Level 3 and 129 of 130 SANJ long-course cuts changed in
  the 2027 tables, so the old values are stale and must not survive. Tour dates
  ARE preserved, because a super-user typed those in by hand.

  Everything here is idempotent: `migrateToGalas` can be re-run safely, and
  re-running it after a CSV correction is the supported way to reload standards.
*/

const CATCH_ALL_YOUNG = "Y";
const CATCH_ALL_OLD = "O";

/** Old tier codes map 1:1 onto gala codes; the two new galas had no tours row. */
const TIER_TO_GALA: Record<string, GalaCode> = {
  LEVEL_2: "LEVEL_2",
  LEVEL_3: "LEVEL_3",
  SANJ: "SANJ",
};

export type SeedGalasResult = { inserted: number; updated: number };
export type SeedStandardsResult = {
  deleted: number;
  inserted: number;
  galas: number;
};

// ---------------------------------------------------------------------------
// Galas — insert/refresh the 5 rows, preserving super-user edits
// ---------------------------------------------------------------------------
//
// Identity and coverage come from the seed (they describe the 2027 tables), but
// the fields a super-user maintains — the entry window and the tour date — are
// NOT clobbered on re-run: a fresh row takes the seed's minAge/maxAge, an
// existing row keeps whatever is already there.

export async function applySeedGalas(ctx: MutationCtx): Promise<SeedGalasResult> {
  let inserted = 0;
  let updated = 0;

  // Tour dates to carry over, keyed by the gala they belong to. Reading the
  // deprecated table is guarded: after the narrowing deploy it is gone.
  const tourByGala = new Map<GalaCode, { date: string; name?: string }>();
  try {
    const tours = (await ctx.db.query("tours").take(10)) as Array<Doc<"tours">>;
    for (const tour of tours) {
      const code = TIER_TO_GALA[tour.tier];
      if (code) tourByGala.set(code, { date: tour.date, name: tour.name });
    }
  } catch {
    // `tours` is no longer in the schema — nothing left to carry across.
  }

  for (const seed of GALA_SEED) {
    const existing = await ctx.db
      .query("galas")
      .withIndex("by_code", (q) => q.eq("code", seed.code))
      .unique();

    const carried = tourByGala.get(seed.code);

    if (existing) {
      // Refresh identity + coverage; leave the super-user's own fields alone.
      await ctx.db.patch(existing._id, {
        displayName: seed.displayName,
        shortLabel: seed.shortLabel,
        ageScope: seed.ageScope,
        coveredEvents: [...seed.coveredEvents],
        sortHint: seed.sortHint,
        season: seed.season,
        ...(existing.tourDate === undefined && carried !== undefined
          ? { tourDate: carried.date, tourName: carried.name }
          : {}),
      });
      updated += 1;
      continue;
    }

    await ctx.db.insert("galas", {
      code: seed.code,
      displayName: seed.displayName,
      shortLabel: seed.shortLabel,
      ageScope: seed.ageScope,
      minAge: seed.minAge,
      maxAge: seed.maxAge,
      coveredEvents: [...seed.coveredEvents],
      sortHint: seed.sortHint,
      season: seed.season,
      tourDate: carried?.date,
      tourName: carried?.name,
    });
    inserted += 1;
  }

  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Standards — replace every cut from the generated 2027 seed data
// ---------------------------------------------------------------------------
//
// A full replace, not an upsert: the stale Level 3 / SANJ values must not
// survive, and a row absent from the CSV must disappear rather than linger.
// Guarded so a bad seed can never leave the table empty.

export async function applySeedStandards(
  ctx: MutationCtx,
): Promise<SeedStandardsResult> {
  const galas = await ctx.db.query("galas").take(10);
  if (galas.length === 0) {
    throw new Error("seedGalas must run before seedStandards — no galas found");
  }
  const galaIdByCode = new Map<string, Id<"galas">>(
    galas.map((g) => [g.code, g._id]),
  );

  // Build every row FIRST, so one bad cell aborts before anything is deleted.
  // (A mutation is a single transaction, so a throw here rolls the delete back.)
  const prepared = STANDARDS_SEED_ROWS.map((row, i) => {
    const [gala, course, gender, distance, stroke, age, time, catchAll] = row;
    const galaId = galaIdByCode.get(gala);
    if (galaId === undefined) {
      throw new Error(`seed row ${i + 1}: unknown gala "${gala}"`);
    }
    return {
      galaId,
      course: course as Course,
      gender: gender as "M" | "F",
      distance: distance as Distance,
      stroke: stroke as Stroke,
      ...(age === null ? {} : { age }),
      isCatchAllYoung: catchAll === CATCH_ALL_YOUNG,
      isCatchAllOld: catchAll === CATCH_ALL_OLD,
      timeMs: parseTime(time), // throws on anything ambiguous — by design
    };
  });

  // The same guard `importStandards` uses: never wipe the table for nothing.
  if (prepared.length === 0) {
    throw new Error("refusing to clear standards — the seed produced no rows");
  }

  const existing = await ctx.db.query("standards").collect();
  for (const row of existing) await ctx.db.delete(row._id);
  for (const row of prepared) await ctx.db.insert("standards", row);

  return {
    deleted: existing.length,
    inserted: prepared.length,
    galas: galas.length,
  };
}

// ---------------------------------------------------------------------------
// The callable mutations
// ---------------------------------------------------------------------------

export const seedGalas = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx) => await applySeedGalas(ctx),
});

export const seedStandards = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    inserted: v.number(),
    galas: v.number(),
  }),
  handler: async (ctx) => await applySeedStandards(ctx),
});

/** The one command to run between the widening and narrowing deploys. */
export const migrateToGalas = internalMutation({
  args: {},
  returns: v.object({
    galasInserted: v.number(),
    galasUpdated: v.number(),
    standardsDeleted: v.number(),
    standardsInserted: v.number(),
  }),
  handler: async (ctx) => {
    const galas = await applySeedGalas(ctx);
    const standards = await applySeedStandards(ctx);
    return {
      galasInserted: galas.inserted,
      galasUpdated: galas.updated,
      standardsDeleted: standards.deleted,
      standardsInserted: standards.inserted,
    };
  },
});
