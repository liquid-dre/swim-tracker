import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { accessibleSwimmerIds, requireSwimmerAccess } from "./authz";
import {
  computeMatrixCell,
  computePersonalBests,
  computeAge,
  eventLabel,
  pickApplicableStandardsPerTier,
  tierResolutionAges,
  type ResultForPB,
  type Tier,
} from "../lib/swim";
import { loadTourDates } from "./tours";

// Personal bests + swimmer profile (BRD §4.6, §5.4, Step 6). PBs are DERIVED —
// there is NO personalBests table. Every read recomputes from `results` over the
// `by_swimmer` index, which is fine at club scale (BRD §11.1). Coaches only for
// now; viewer scoping lands in Step 15 (see authz.ts).

// A swimmer can accumulate many swims over a career, but a bounded read keeps the
// query cheap and predictable (guidelines: never `.collect()` unboundedly).
const RESULTS_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Shared validators (mirror the schema unions, BRD §4.1–4.3)
// ---------------------------------------------------------------------------

const stroke = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);
const course = v.union(v.literal("SCM"), v.literal("LCM"));
const distance = v.union(
  v.literal(25),
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const swimType = v.union(
  v.literal("MEET"),
  v.literal("TIME_TRIAL"),
  v.literal("PRACTICE"),
  v.literal("SCHOOL_GALA"), // parent-entered, unofficial (§R15)
);
const role = v.union(
  v.literal("SUPER_USER"),
  v.literal("COACH"),
  v.literal("VIEWER"),
);

// Entry / edit provenance for a history row (§R17, Part B). Coach-only: null for
// a viewer so a parent never sees which coach captured a time. `enteredBy` is
// the original enterer (name + role, so a parent-entered SCHOOL_GALA reads as a
// viewer); the edit block is set only once a row has been changed.
const provenance = v.union(
  v.null(),
  v.object({
    enteredByName: v.string(),
    enteredByRole: role,
    enteredAt: v.number(),
    editedByName: v.union(v.string(), v.null()),
    editedByRole: v.union(role, v.null()),
    editedAt: v.union(v.number(), v.null()),
  }),
);

// ---------------------------------------------------------------------------
// Return validators (one place, shared by both queries)
// ---------------------------------------------------------------------------

const pbRow = v.object({
  distance,
  stroke,
  course,
  label: v.string(),
  headline: v.union(
    v.null(),
    v.object({
      timeMs: v.number(),
      swimDate: v.string(),
      meetName: v.union(v.string(), v.null()),
      // Age at the gala where the PB was set (§4.9). computePersonalBests always
      // returns this; it must be in the validator or Convex rejects the value and
      // the profile query throws whenever a headline (meet) PB exists.
      ageAtSwim: v.union(v.number(), v.null()),
    }),
  ),
  overallBest: v.object({
    timeMs: v.number(),
    swimDate: v.string(),
    swimType,
  }),
  improvement: v.union(
    v.null(),
    v.object({
      fromMs: v.number(),
      fromDate: v.string(),
      fromSwimType: swimType,
      toMs: v.number(),
      absMs: v.number(),
      pct: v.number(),
    }),
  ),
});

const historyRow = v.object({
  _id: v.id("results"),
  distance,
  stroke,
  course,
  label: v.string(),
  timeMs: v.number(),
  swimType,
  swimDate: v.string(),
  ageAtSwim: v.number(),
  meetName: v.union(v.string(), v.null()),
  venue: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  provenance, // who entered/edited this time (coach-only; null for a viewer)
});

const swimmerSummary = v.object({
  _id: v.id("swimmers"),
  name: v.string(),
  dob: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  active: v.boolean(),
  notes: v.union(v.string(), v.null()),
  age: v.number(), // as of today
  inSystemSince: v.string(), // ISO date derived from createdAt
  resultCount: v.number(),
  club: v.union(v.string(), v.null()), // owning club's name (null if unassigned)
});

// ---------------------------------------------------------------------------
// Load + derive helper (shared)
// ---------------------------------------------------------------------------

async function loadResults(ctx: QueryCtx, swimmerId: Id<"swimmers">) {
  return await ctx.db
    .query("results")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .take(RESULTS_LIMIT);
}

// ---------------------------------------------------------------------------
// getPersonalBests — the PB board data (per (distance, stroke, course))
// ---------------------------------------------------------------------------

export const getPersonalBests = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.array(pbRow),
  handler: async (ctx, args) => {
    // Coach → any swimmer; viewer → only their linked swimmer(s). Rejected
    // server-side, so a direct function call can't read an unlinked swimmer.
    await requireSwimmerAccess(ctx, args.swimmerId);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");

    const results = await loadResults(ctx, args.swimmerId);
    return computePersonalBests(results as ResultForPB[]);
  },
});

// ---------------------------------------------------------------------------
// getSwimmerProfile — PB board + improvement + full history + identity
// ---------------------------------------------------------------------------

export const getSwimmerProfile = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.object({
    swimmer: swimmerSummary,
    personalBests: v.array(pbRow),
    history: v.array(historyRow),
    // Whether the caller may EDIT this swimmer (own-club coach / super-user) —
    // drives the write controls (edit, log, viewer access) on the profile page.
    editable: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Coach → any swimmer; viewer → only their linked swimmer(s). The read is
    // the same shape for both; write controls are gated separately (results.ts).
    const profile = await requireSwimmerAccess(ctx, args.swimmerId);

    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");

    const editable =
      profile.role === "SUPER_USER" ||
      (profile.role === "COACH" &&
        profile.clubId != null &&
        swimmer.clubId === profile.clubId);

    const results = await loadResults(ctx, args.swimmerId);
    const personalBests = computePersonalBests(results as ResultForPB[]);

    const today = new Date().toISOString().slice(0, 10);
    const inSystemSince = new Date(swimmer.createdAt).toISOString().slice(0, 10);
    const club = swimmer.clubId ? await ctx.db.get(swimmer.clubId) : null;

    // Entry provenance is coach-only (§R17): a viewer never sees which coach
    // captured a time. Resolve enterer/editor names once, memoised, for staff.
    const staff = profile.role !== "VIEWER";
    const profileCache = new Map<
      Id<"profiles">,
      { name: string; role: "SUPER_USER" | "COACH" | "VIEWER" } | null
    >();
    const personFor = async (id: Id<"profiles"> | undefined) => {
      if (!id) return null;
      if (profileCache.has(id)) return profileCache.get(id)!;
      const p = await ctx.db.get(id);
      const shaped = p ? { name: p.name, role: p.role } : null;
      profileCache.set(id, shaped);
      return shaped;
    };

    // History: newest first is the useful default for a log; the client can
    // re-sort. Attach the human event label so the table stays presentational.
    const sorted = [...results].sort((a, b) =>
      a.swimDate < b.swimDate ? 1 : a.swimDate > b.swimDate ? -1 : 0,
    );
    const history = await Promise.all(
      sorted.map(async (res) => {
        let prov = null as
          | null
          | {
              enteredByName: string;
              enteredByRole: "SUPER_USER" | "COACH" | "VIEWER";
              enteredAt: number;
              editedByName: string | null;
              editedByRole: "SUPER_USER" | "COACH" | "VIEWER" | null;
              editedAt: number | null;
            };
        if (staff) {
          const enterer = await personFor(res.enteredBy);
          const editor = await personFor(res.lastEditedBy);
          prov = {
            enteredByName: enterer?.name ?? "(removed account)",
            enteredByRole: enterer?.role ?? "VIEWER",
            enteredAt: res.createdAt,
            editedByName: res.lastEditedBy ? (editor?.name ?? "(removed account)") : null,
            editedByRole: res.lastEditedBy ? (editor?.role ?? "VIEWER") : null,
            editedAt: res.updatedAt ?? null,
          };
        }
        return {
          _id: res._id,
          distance: res.distance,
          stroke: res.stroke,
          course: res.course,
          label: eventLabel(res.distance, res.stroke),
          timeMs: res.timeMs,
          swimType: res.swimType,
          swimDate: res.swimDate,
          ageAtSwim: res.ageAtSwim,
          meetName: res.meetName ?? null,
          venue: res.venue ?? null,
          notes: res.notes ?? null,
          provenance: prov,
        };
      }),
    );

    return {
      swimmer: {
        _id: swimmer._id,
        name: swimmer.name,
        dob: swimmer.dob,
        gender: swimmer.gender,
        active: swimmer.active,
        notes: swimmer.notes ?? null,
        age: computeAge(swimmer.dob, today),
        inSystemSince,
        resultCount: results.length,
        club: club?.name ?? null,
      },
      personalBests,
      history,
      editable,
    };
  },
});

// ---------------------------------------------------------------------------
// getViewerHighlights — the viewer home's one-line story per linked swimmer
// ---------------------------------------------------------------------------
//
// For each swimmer this viewer follows: their most recent lifetime best (any
// course) and the closest outstanding cut (LCM, tour-rule resolved — the same
// judgement every other surface uses). Empty for staff (their home is the
// dashboard) and for viewers with no links yet.

export const getViewerHighlights = query({
  args: {},
  returns: v.array(
    v.object({
      swimmerId: v.id("swimmers"),
      name: v.string(),
      latestPb: v.union(
        v.null(),
        v.object({
          label: v.string(),
          course,
          timeMs: v.number(),
          swimDate: v.string(),
        }),
      ),
      closestCut: v.union(
        v.null(),
        v.object({
          label: v.string(),
          tier: v.union(
            v.literal("LEVEL_2"),
            v.literal("LEVEL_3"),
            v.literal("SANJ"),
          ),
          gapMs: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    if (swimmerIds === "ALL") return [];

    const tourDates = await loadTourDates(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const out = [];

    for (const swimmerId of swimmerIds) {
      const swimmer = await ctx.db.get(swimmerId);
      if (!swimmer) continue;

      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
        .take(RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);

      // Most recently SET lifetime best, any course.
      let latestPb: {
        label: string;
        course: "SCM" | "LCM";
        timeMs: number;
        swimDate: string;
      } | null = null;
      for (const pb of pbs) {
        if (!pb.headline) continue;
        if (latestPb === null || pb.headline.swimDate > latestPb.swimDate) {
          latestPb = {
            label: eventLabel(pb.distance, pb.stroke),
            course: pb.course,
            timeMs: pb.headline.timeMs,
            swimDate: pb.headline.swimDate,
          };
        }
      }

      // Closest outstanding cut across LCM events — same resolution rule as
      // the matrix/road (tour day where set, else age as swum).
      const cutRows = await ctx.db
        .query("standards")
        .withIndex("by_lookup", (q) => q.eq("gender", swimmer.gender))
        .take(2000);
      const age = computeAge(swimmer.dob, today);
      let closestCut: { label: string; tier: Tier; gapMs: number } | null = null;
      for (const pb of pbs) {
        if (pb.course !== "LCM" || !pb.headline) continue;
        const cuts = pickApplicableStandardsPerTier(
          cutRows.filter(
            (r) => r.distance === pb.distance && r.stroke === pb.stroke,
          ),
          // Tour-day age when a date is set, else current age — never the age
          // the PB was swum, matching every qualification surface.
          tierResolutionAges(swimmer.dob, age, tourDates),
        );
        const cell = computeMatrixCell(pb.headline.timeMs, cuts);
        if (cell.gapMs === null || cell.gapMs <= 0 || cell.nextTier === null) {
          continue;
        }
        if (closestCut === null || cell.gapMs < closestCut.gapMs) {
          closestCut = {
            label: eventLabel(pb.distance, pb.stroke),
            tier: cell.nextTier,
            gapMs: cell.gapMs,
          };
        }
      }

      out.push({ swimmerId, name: swimmer.name, latestPb, closestCut });
    }
    return out;
  },
});
