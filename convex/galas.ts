import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireSignedIn, requireSuperUser } from "./authz";
import { GALA_ORDER, type GalaCode, type GalaRef } from "../lib/swim";

/*
  Galas — the five meets a swimmer can qualify for (BRD §4.9, 2027 SSA tables).

  Global reference data (docs/access-control.md): the SUPER_USER maintains it and
  every role reads it. Three groups of fields, with different lifecycles:

    identity   code / displayName / shortLabel / sortHint / season / ageScope
               Seeded from lib/galas.ts; refreshed by the seeding mutation.
    policy     minAge / maxAge / coveredEvents
               Seeded, then editable — SSA publishes entry windows outside the
               cut tables, so a coach must be able to correct them without a
               deploy (Youth's real window in particular is not yet confirmed).
    tour       tourDate / tourName
               Purely coach-entered. Setting a date switches every qualifying
               surface to judging the swimmer at the age they will be ON TOUR
               DAY (the birthday rule, §4.9); clearing it falls back to their
               current age. Never overwritten by seeding.
*/

const MAX_GALAS = 10; // five today; a bounded read that cannot silently truncate
const NAME_MAX = 80;
const AGE_MIN = 5;
const AGE_MAX = 100;

export const galaCodeValidator = v.union(
  v.literal("SANS"),
  v.literal("SANY"),
  v.literal("SANJ"),
  v.literal("LEVEL_3"),
  v.literal("LEVEL_2"),
);

const coveredEventValidator = v.object({
  distance: v.union(
    v.literal(25),
    v.literal(50),
    v.literal(100),
    v.literal(200),
    v.literal(400),
    v.literal(800),
    v.literal(1500),
  ),
  stroke: v.union(
    v.literal("FREE"),
    v.literal("BACK"),
    v.literal("BREAST"),
    v.literal("FLY"),
    v.literal("IM"),
  ),
});

export const galaShape = v.object({
  _id: v.id("galas"),
  code: galaCodeValidator,
  displayName: v.string(),
  shortLabel: v.string(),
  ageScope: v.union(v.literal("AGE_GRADED"), v.literal("OPEN")),
  minAge: v.union(v.number(), v.null()),
  maxAge: v.union(v.number(), v.null()),
  coveredEvents: v.array(coveredEventValidator),
  sortHint: v.number(),
  season: v.string(),
  tourDate: v.union(v.string(), v.null()),
  tourName: v.union(v.string(), v.null()),
});

// ---------------------------------------------------------------------------
// Shared loaders — every qualifying surface starts here
// ---------------------------------------------------------------------------

/**
 * All galas, ordered hardest → easiest by `GALA_ORDER` (NOT by `sortHint`, which
 * is only a display hint the seed keeps in step). Unknown codes are dropped
 * rather than rendered in an arbitrary position.
 */
export async function loadGalas(
  ctx: QueryCtx | MutationCtx,
): Promise<Array<Doc<"galas">>> {
  const rows = await ctx.db.query("galas").take(MAX_GALAS);
  const rank = new Map<string, number>(GALA_ORDER.map((code, i) => [code, i]));
  return rows
    .filter((g) => rank.has(g.code))
    .sort((a, b) => rank.get(a.code)! - rank.get(b.code)!);
}

/** The subset of a gala row that the pure resolution helpers in lib/swim need. */
export function toGalaRefs(galas: ReadonlyArray<Doc<"galas">>): GalaRef[] {
  return galas.map((g) => ({
    code: g.code as GalaCode,
    minAge: g.minAge ?? null,
    maxAge: g.maxAge ?? null,
    tourDate: g.tourDate ?? null,
  }));
}

/** Tour dates by gala code, for the surfaces that explain the resolution rule. */
export function tourDatesByGala(
  galas: ReadonlyArray<Doc<"galas">>,
): Partial<Record<GalaCode, string>> {
  const out: Partial<Record<GalaCode, string>> = {};
  for (const g of galas) {
    if (g.tourDate) out[g.code as GalaCode] = g.tourDate;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listGalas = query({
  args: {},
  returns: v.array(galaShape),
  handler: async (ctx) => {
    // Reference data: coaches and viewers alike read it (a viewer's Road screen
    // explains resolution with it). Only a super-user writes.
    await requireSignedIn(ctx);
    const galas = await loadGalas(ctx);
    return galas.map((g) => ({
      _id: g._id,
      code: g.code,
      displayName: g.displayName,
      shortLabel: g.shortLabel,
      ageScope: g.ageScope,
      minAge: g.minAge ?? null,
      maxAge: g.maxAge ?? null,
      coveredEvents: g.coveredEvents,
      sortHint: g.sortHint,
      season: g.season,
      tourDate: g.tourDate ?? null,
      tourName: g.tourName ?? null,
    }));
  },
});

// ---------------------------------------------------------------------------
// Writes (super-user only)
// ---------------------------------------------------------------------------

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
  // A typo'd year (0206, 20260) silently pins cuts to a nonsense age — bound it.
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    throw new ConvexError("Tour date must be between 2000 and 2100.");
  }
  return trimmed;
}

async function requireGala(
  ctx: MutationCtx,
  code: GalaCode,
): Promise<Doc<"galas">> {
  const gala = await ctx.db
    .query("galas")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!gala) {
    throw new ConvexError(
      "That gala is not set up yet — run the standards seed first.",
    );
  }
  return gala;
}

export const setGalaTour = mutation({
  args: {
    code: galaCodeValidator,
    date: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);
    const gala = await requireGala(ctx, args.code);

    const date = cleanTourDate(args.date);
    const name = args.name?.trim() || undefined;
    if (name && name.length > NAME_MAX) {
      throw new ConvexError("Tour name is too long.");
    }

    await ctx.db.patch(gala._id, { tourDate: date, tourName: name });
    return null;
  },
});

export const clearGalaTour = mutation({
  args: { code: galaCodeValidator },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    await requireSuperUser(ctx);
    const gala = await requireGala(ctx, code);
    await ctx.db.patch(gala._id, { tourDate: undefined, tourName: undefined });
    return null;
  },
});

/**
 * Correct a gala's entry window (§4.9). Both bounds are inclusive and either may
 * be cleared to mean "unbounded" — SANS has no upper limit, and the age-graded
 * galas have no lower one (their `&U` catch-all rows cover the young end).
 */
export const setGalaEligibility = mutation({
  args: {
    code: galaCodeValidator,
    minAge: v.union(v.number(), v.null()),
    maxAge: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { code, minAge, maxAge }) => {
    await requireSuperUser(ctx);
    const gala = await requireGala(ctx, code);

    for (const [label, age] of [
      ["Minimum age", minAge],
      ["Maximum age", maxAge],
    ] as const) {
      if (age === null) continue;
      if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
        throw new ConvexError(
          `${label} must be a whole number between ${AGE_MIN} and ${AGE_MAX}.`,
        );
      }
    }
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      throw new ConvexError("Minimum age cannot be above the maximum age.");
    }

    await ctx.db.patch(gala._id, {
      minAge: minAge ?? undefined,
      maxAge: maxAge ?? undefined,
    });
    return null;
  },
});
