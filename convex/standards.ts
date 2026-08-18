import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSignedIn, requireSuperUser } from "./authz";
import { galaCodeValidator, loadGalas, toGalaRefs } from "./galas";
import {
  prepareStandardImport,
  pickApplicableStandards,
  resolveGalaCut,
  isValidEvent,
  galaCoversEvent,
  eventLabel,
  type Course,
  type EventDef,
  type GalaCode,
  type PreparedStandard,
  type RawStandardRow,
} from "../lib/swim";

// STEP 8: qualifying-standards data + resolution (BRD §4.9). Five galas, each
// with SEPARATE long- and short-course cuts — both are valid for entry, so a cut
// is only ever compared against a PB of the same course. The judgement (parse,
// whitelist, coverage, age scope, catch-all resolution) is pure and unit-tested
// in ../lib/swim; these Convex functions are thin wrappers that add DB I/O,
// idempotency, and auth.

// Shared validators (mirror schema.ts).
const genderValidator = v.union(v.literal("M"), v.literal("F"));
const courseValidator = v.union(v.literal("SCM"), v.literal("LCM"));
const distanceValidator = v.union(
  v.literal(25),
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

const STANDARDS_READ_LIMIT = 2000;
const STANDARDS_REPLACE_LIMIT = 5000;

/** Gala `_id` by code, for turning an imported row's code into an FK. */
async function galaIdsByCode(
  ctx: MutationCtx,
): Promise<Map<GalaCode, Id<"galas">>> {
  const galas = await loadGalas(ctx);
  return new Map(galas.map((g) => [g.code as GalaCode, g._id]));
}

/** The coverage + age-scope facts `prepareStandardImport` validates against. */
async function galaRules(ctx: MutationCtx) {
  const galas = await loadGalas(ctx);
  return galas.map((g) => ({
    code: g.code as GalaCode,
    ageScope: g.ageScope,
    coveredEvents: g.coveredEvents,
  }));
}

async function loadEvents(ctx: QueryCtx | MutationCtx): Promise<EventDef[]> {
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
// Idempotent upsert of the accepted rows.
// ---------------------------------------------------------------------------
//
// A standard's identity is (galaId, course, gender, distance, stroke, age):
// re-running an import must never duplicate, and COURSE is load-bearing here —
// without it the short-course rows would overwrite the long-course ones. Convex
// mutations are transactional, so reads see writes made earlier in the same call
// and a duplicate key within one batch collapses onto the same row.

async function upsertPreparedStandards(
  ctx: MutationCtx,
  accepted: ReadonlyArray<PreparedStandard>,
  galaIds: Map<GalaCode, Id<"galas">>,
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const s of accepted) {
    const galaId = galaIds.get(s.gala);
    if (galaId === undefined) continue; // filtered out upstream; belt and braces

    const siblings = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", s.gender)
          .eq("distance", s.distance)
          .eq("stroke", s.stroke)
          .eq("course", s.course)
          .eq("galaId", galaId),
      )
      .take(200);
    // `age` is undefined on an open standard, so this also matches "the one
    // ageless row for this gala/course/event".
    const existing = siblings.find((row) => (row.age ?? null) === (s.age ?? null));

    if (!existing) {
      await ctx.db.insert("standards", {
        galaId,
        course: s.course,
        gender: s.gender,
        distance: s.distance,
        stroke: s.stroke,
        ...(s.age === undefined ? {} : { age: s.age }),
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

// ---------------------------------------------------------------------------
// importStandards — idempotent bulk load from the cleaned CSV (§4.9, §5.9).
// ---------------------------------------------------------------------------
//
// Field-level validators are intentionally LOOSE (v.string()/v.number()) so a
// bad row reaches our own validator and is REPORTED with a reason rather than
// failing the whole batch at the arg-validation layer. Super-user only.
//
// `data/qualifying-times.csv` is the tracked source of truth and is normally
// loaded by `migrations/galaStandards:seedStandards`; this mutation is the
// hand-upload path for a correction or a new season.

const rawRowValidator = v.object({
  gala: v.string(),
  course: v.string(),
  gender: v.string(),
  distance: v.number(),
  stroke: v.string(),
  // null = an open standard (SANS/SANY publish one cut for every age).
  age: v.union(v.number(), v.null()),
  isCatchAllYoung: v.boolean(),
  isCatchAllOld: v.boolean(),
  time: v.string(),
});

export const importStandards = mutation({
  args: {
    rows: v.array(rawRowValidator),
    // Delete EVERY existing cut first, so the imported file becomes the
    // complete set. Without this the import only upserts by identity — rows
    // from an earlier sample/season at ages the new file doesn't have would
    // linger and keep resolving.
    replaceExisting: v.optional(v.boolean()),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    deleted: v.number(),
    acceptedCount: v.number(),
    rejectedCount: v.number(),
    rejected: v.array(
      v.object({
        index: v.number(),
        reason: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { rows, replaceExisting }) => {
    await requireSuperUser(ctx);
    const events = await loadEvents(ctx);
    const galas = await galaRules(ctx);
    if (galas.length === 0) {
      throw new ConvexError(
        "No galas are set up yet — run the standards seed before importing cuts.",
      );
    }
    const { accepted, rejected } = prepareStandardImport(
      rows as RawStandardRow[],
      events,
      galas,
    );

    // Refuse to wipe the table for a file that imports NOTHING — a malformed
    // upload must never leave the app with zero cuts.
    let deleted = 0;
    if (replaceExisting && accepted.length > 0) {
      const existing = await ctx.db.query("standards").take(STANDARDS_REPLACE_LIMIT);
      for (const row of existing) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    const counts = await upsertPreparedStandards(
      ctx,
      accepted,
      await galaIdsByCode(ctx),
    );
    return {
      ...counts,
      deleted,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      // Report bad rows (index + reason); the full row stays server-side.
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
// Super-user only, like the whole screen.

const standardShape = v.object({
  _id: v.id("standards"),
  galaId: v.id("galas"),
  gala: galaCodeValidator,
  course: courseValidator,
  gender: genderValidator,
  distance: distanceValidator,
  stroke: strokeValidator,
  // null on an open standard — one cut for every age in the entry window.
  age: v.union(v.number(), v.null()),
  isCatchAllYoung: v.boolean(),
  isCatchAllOld: v.boolean(),
  timeMs: v.number(),
});

/**
 * listStandards — every cut, for the coach editor to filter/group client-side.
 * Each row carries its gala CODE as well as its id so the editor never has to
 * join, and rows whose gala has vanished are dropped rather than shown untagged.
 */
export const listStandards = query({
  args: {},
  returns: v.array(standardShape),
  handler: async (ctx) => {
    // Standards are public reference data — any signed-in user may read the full
    // table (the coach editor and, read-only, everyone else). Writes are gated.
    await requireSignedIn(ctx);
    const galas = await loadGalas(ctx);
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));

    // The full table is ~950 rows; a bounded read covers it.
    const rows = await ctx.db.query("standards").take(STANDARDS_READ_LIMIT);
    const out = [];
    for (const r of rows) {
      if (r.galaId === undefined || r.course === undefined) continue; // pre-migration
      const gala = codeById.get(r.galaId);
      if (gala === undefined) continue; // orphaned row — never render it untagged
      out.push({
        _id: r._id,
        galaId: r.galaId,
        gala,
        course: r.course,
        gender: r.gender,
        distance: r.distance,
        stroke: r.stroke,
        age: r.age ?? null,
        isCatchAllYoung: r.isCatchAllYoung,
        isCatchAllOld: r.isCatchAllOld,
        timeMs: r.timeMs,
      });
    }
    return out;
  },
});

// Shared domain validation for a single cut (mirrors prepareStandardImport's
// rules): a real event in that cut's course, gala coverage, an age that matches
// the gala's age scope, at most one catch-all flag, and a positive integer-ms
// time. Throws with a coach-readable message on any breach.
function assertValidCut(
  cut: {
    course: Course;
    gender: Doc<"standards">["gender"];
    distance: Doc<"standards">["distance"];
    stroke: Doc<"standards">["stroke"];
    age: number | null;
    isCatchAllYoung: boolean;
    isCatchAllOld: boolean;
    timeMs: number;
  },
  gala: Doc<"galas">,
  events: EventDef[],
): void {
  if (cut.isCatchAllYoung && cut.isCatchAllOld) {
    throw new ConvexError("A cut can't be both a youngest and an oldest catch-all.");
  }
  if (gala.ageScope === "OPEN") {
    if (cut.age !== null) {
      throw new ConvexError(
        `${gala.displayName} has one cut for every age — leave the age blank.`,
      );
    }
    if (cut.isCatchAllYoung || cut.isCatchAllOld) {
      throw new ConvexError("An open standard can't be a catch-all.");
    }
  } else {
    if (cut.age === null) {
      throw new ConvexError(`${gala.displayName} needs an exact age for each cut.`);
    }
    if (!Number.isInteger(cut.age) || cut.age <= 0 || cut.age > 100) {
      throw new ConvexError(`Invalid age "${cut.age}".`);
    }
  }
  if (!Number.isInteger(cut.timeMs) || cut.timeMs <= 0) {
    throw new ConvexError("Enter a valid time.");
  }
  if (!isValidEvent(cut.distance, cut.stroke, cut.course, events)) {
    throw new ConvexError(
      `${eventLabel(cut.distance, cut.stroke)} is not a ${
        cut.course === "LCM" ? "long" : "short"
      }-course event.`,
    );
  }
  if (!galaCoversEvent(gala, cut.distance, cut.stroke)) {
    throw new ConvexError(
      `${gala.displayName} has no cut for ${eventLabel(cut.distance, cut.stroke)}.`,
    );
  }
}

/** createStandard — add a single missing cut (§5.8). Super-user only. */
export const createStandard = mutation({
  args: {
    galaId: v.id("galas"),
    course: courseValidator,
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    age: v.union(v.number(), v.null()),
    isCatchAllYoung: v.boolean(),
    isCatchAllOld: v.boolean(),
    timeMs: v.number(),
  },
  returns: v.id("standards"),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);
    const gala = await ctx.db.get(args.galaId);
    if (!gala) throw new ConvexError("That gala no longer exists.");
    const events = await loadEvents(ctx);
    assertValidCut(args, gala, events);

    // Identity is (galaId, course, gender, distance, stroke, age) — never dupe.
    const siblings = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", args.gender)
          .eq("distance", args.distance)
          .eq("stroke", args.stroke)
          .eq("course", args.course)
          .eq("galaId", args.galaId),
      )
      .take(200);
    if (siblings.some((s) => (s.age ?? null) === args.age)) {
      throw new ConvexError(
        "A cut already exists for that gala, course and age — edit it instead.",
      );
    }

    return await ctx.db.insert("standards", {
      galaId: args.galaId,
      course: args.course,
      gender: args.gender,
      distance: args.distance,
      stroke: args.stroke,
      ...(args.age === null ? {} : { age: args.age }),
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
    await requireSuperUser(ctx);
    const existing = await ctx.db.get(standardId);
    if (!existing) throw new ConvexError("That cut no longer exists.");
    if (!Number.isInteger(timeMs) || timeMs <= 0) {
      throw new ConvexError("Enter a valid time.");
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
    await requireSuperUser(ctx);
    const existing = await ctx.db.get(standardId);
    if (existing) await ctx.db.delete(standardId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// resolveStandard — one gala's cut (ms) for an exact age + course, or null.
// ---------------------------------------------------------------------------

export const resolveStandard = query({
  args: {
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    course: courseValidator,
    gala: galaCodeValidator,
    exactAge: v.number(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { gender, distance, stroke, course, gala, exactAge }) => {
    await requireSignedIn(ctx);
    const galas = await loadGalas(ctx);
    const target = galas.find((g) => g.code === gala);
    if (!target) return null;

    const cuts = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) =>
        q
          .eq("gender", gender)
          .eq("distance", distance)
          .eq("stroke", stroke)
          .eq("course", course)
          .eq("galaId", target._id),
      )
      .take(200);
    return resolveGalaCut(toGalaRefs([target])[0], cuts, exactAge);
  },
});

// ---------------------------------------------------------------------------
// getApplicableStandards — every gala's cut for an exact age + course, omitting
// galas with no coverage, no row for that age, or an age outside their entry
// window (§4.9, §5.5).
// ---------------------------------------------------------------------------

export const getApplicableStandards = query({
  args: {
    gender: genderValidator,
    distance: distanceValidator,
    stroke: strokeValidator,
    course: courseValidator,
    age: v.number(),
  },
  returns: v.object({
    SANS: v.optional(v.number()),
    SANY: v.optional(v.number()),
    SANJ: v.optional(v.number()),
    LEVEL_3: v.optional(v.number()),
    LEVEL_2: v.optional(v.number()),
  }),
  handler: async (ctx, { gender, distance, stroke, course, age }) => {
    // Qualifying standards are public reference data (docs/access-control.md):
    // any signed-in user may read them — coaches for their charts, viewers for
    // the rankings cut lines. Only editing them is restricted (super-user).
    await requireSignedIn(ctx);
    const galas = await loadGalas(ctx);
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));

    const rows: Doc<"standards">[] = await ctx.db
      .query("standards")
      .withIndex("by_event", (q) =>
        q.eq("gender", gender).eq("distance", distance).eq("stroke", stroke),
      )
      .take(1000);

    const tagged = rows.flatMap((r) => {
      if (r.course !== course || r.galaId === undefined) return [];
      const gala = codeById.get(r.galaId);
      return gala === undefined ? [] : [{ ...r, gala }];
    });
    return pickApplicableStandards(tagged, toGalaRefs(galas), age);
  },
});
