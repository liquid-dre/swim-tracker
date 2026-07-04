import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireSwimmerAccess } from "./authz";
import {
  computePersonalBests,
  computeAge,
  eventLabel,
  type ResultForPB,
} from "../lib/swim";

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
    if (!swimmer) throw new Error("Swimmer not found.");

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
    if (!swimmer) throw new Error("Swimmer not found.");

    const editable =
      profile.role === "SUPER_USER" ||
      (profile.role === "COACH" &&
        profile.clubId != null &&
        swimmer.clubId === profile.clubId);

    const results = await loadResults(ctx, args.swimmerId);
    const personalBests = computePersonalBests(results as ResultForPB[]);

    const today = new Date().toISOString().slice(0, 10);
    const inSystemSince = new Date(swimmer.createdAt).toISOString().slice(0, 10);

    // History: newest first is the useful default for a log; the client can
    // re-sort. Attach the human event label so the table stays presentational.
    const history = [...results]
      .sort((a, b) => (a.swimDate < b.swimDate ? 1 : a.swimDate > b.swimDate ? -1 : 0))
      .map((res) => ({
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
      }));

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
      },
      personalBests,
      history,
      editable,
    };
  },
});
