import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireCoach } from "./authz";
import {
  computeAge,
  computeAgeGroup,
  eventLabel,
  highestTierMet,
  pickApplicableStandards,
  type Tier,
} from "../lib/swim";

// Base analysis reads (BRD §5.5–5.6, Step 7). Two derived views over `results`:
//   • getEventComparison — a leaderboard of headline MEET PBs for one event.
//   • getProgression     — each swimmer's full time series for one event.
// Both are pure reads; PBs are DERIVED here exactly as in personalBests.ts
// (fastest MEET only; trials/practice never count). Coaches only for now —
// viewer scoping lands in a later step (see authz.ts). Step 10 adds the LCM
// qualifying overlays: comparison rows carry their highest tier met, and
// progression carries this event's cut rows for the chart to resolve per age.

// A comparison scans every swim for one (distance, stroke, course) across the
// whole club; a progression scans one swimmer's swims for one event. Both are
// bounded defensively (guidelines: never `.collect()` unboundedly).
const EVENT_RESULTS_LIMIT = 5000;
const SWIMMER_RESULTS_LIMIT = 2000;
// One line per swimmer stops being legible past a dozen or so; cap the read so a
// runaway selection can't blow up the query. The UI caps selection to match.
const MAX_SERIES = 20;

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
const gender = v.union(v.literal("M"), v.literal("F"));
const tier = v.union(
  v.literal("LEVEL_2"),
  v.literal("LEVEL_3"),
  v.literal("SANJ"),
);
const swimType = v.union(
  v.literal("MEET"),
  v.literal("TIME_TRIAL"),
  v.literal("PRACTICE"),
);

const eventSummary = v.object({
  distance,
  stroke,
  course,
  label: v.string(),
});

// ---------------------------------------------------------------------------
// getEventComparison — leaderboard of headline MEET PBs (BRD §5.5)
// ---------------------------------------------------------------------------
//
// One row per swimmer who has at least one MEET swim for the exact
// (distance, stroke, course), carrying that swimmer's fastest MEET time.
// Sorted ascending (fastest first). Course is REQUIRED — SCM and LCM are never
// ranked together (§4.8). Optional gender / ageGroup filters use the swimmer's
// CURRENT age band (age as of today, §4.7).

const comparisonRow = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  gender,
  age: v.number(), // as of today
  ageGroup: v.string(), // current display band (§4.7)
  active: v.boolean(),
  timeMs: v.number(),
  swimDate: v.string(),
  meetName: v.union(v.string(), v.null()),
  // Hardest qualifying tier this headline PB meets, at the swimmer's EXACT age
  // (§4.9). LCM only — always null on SCM (standards are long-course, §4.2).
  highestTier: v.union(tier, v.null()),
});

export const getEventComparison = query({
  args: {
    distance,
    stroke,
    course,
    gender: v.optional(gender),
    ageGroup: v.optional(v.string()),
  },
  returns: v.object({
    event: eventSummary,
    rows: v.array(comparisonRow),
  }),
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    const results = await ctx.db
      .query("results")
      .withIndex("by_event_global", (q) =>
        q
          .eq("distance", args.distance)
          .eq("stroke", args.stroke)
          .eq("course", args.course),
      )
      .take(EVENT_RESULTS_LIMIT);

    // Headline PB = fastest MEET only. Ties break to the earliest date so the PB
    // reads as "first achieved on…" — same rule as computePersonalBests.
    const bestBySwimmer = new Map<
      Id<"swimmers">,
      { timeMs: number; swimDate: string; meetName: string | null }
    >();
    for (const r of results) {
      if (r.swimType !== "MEET") continue;
      const cur = bestBySwimmer.get(r.swimmerId);
      if (
        !cur ||
        r.timeMs < cur.timeMs ||
        (r.timeMs === cur.timeMs && r.swimDate < cur.swimDate)
      ) {
        bestBySwimmer.set(r.swimmerId, {
          timeMs: r.timeMs,
          swimDate: r.swimDate,
          meetName: r.meetName ?? null,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    // Standards are LCM-only (§4.2, §4.9). On LCM, colour each bar by the
    // hardest tier its PB meets AT THE SWIMMER'S EXACT AGE — so we resolve cuts
    // per (gender, exact age) from this event's cut rows, loaded once per gender.
    const cutsByGender = new Map<"M" | "F", Doc<"standards">[]>();
    async function loadCuts(g: "M" | "F"): Promise<Doc<"standards">[]> {
      const cached = cutsByGender.get(g);
      if (cached) return cached;
      const loaded =
        args.course === "LCM"
          ? await ctx.db
              .query("standards")
              .withIndex("by_event", (q) =>
                q
                  .eq("gender", g)
                  .eq("distance", args.distance)
                  .eq("stroke", args.stroke),
              )
              .take(500)
          : [];
      cutsByGender.set(g, loaded);
      return loaded;
    }

    const rows: Array<{
      swimmerId: Id<"swimmers">;
      name: string;
      gender: "M" | "F";
      age: number;
      ageGroup: string;
      active: boolean;
      timeMs: number;
      swimDate: string;
      meetName: string | null;
      highestTier: Tier | null;
    }> = [];

    for (const [swimmerId, best] of bestBySwimmer) {
      const swimmer = await ctx.db.get(swimmerId);
      if (!swimmer) continue; // deleted swimmer with orphaned results — skip

      if (args.gender && swimmer.gender !== args.gender) continue;
      const band = computeAgeGroup(swimmer.dob, today);
      if (args.ageGroup && band !== args.ageGroup) continue;

      const age = computeAge(swimmer.dob, today);
      let highestTier: Tier | null = null;
      if (args.course === "LCM") {
        const cuts = pickApplicableStandards(await loadCuts(swimmer.gender), age);
        highestTier = highestTierMet(best.timeMs, cuts);
      }

      rows.push({
        swimmerId,
        name: swimmer.name,
        gender: swimmer.gender,
        age,
        ageGroup: band,
        active: swimmer.active,
        timeMs: best.timeMs,
        swimDate: best.swimDate,
        meetName: best.meetName,
        highestTier,
      });
    }

    // Fastest first; ties break to the earlier date, then name, for stability.
    rows.sort(
      (a, b) =>
        a.timeMs - b.timeMs ||
        (a.swimDate < b.swimDate ? -1 : a.swimDate > b.swimDate ? 1 : 0) ||
        a.name.localeCompare(b.name),
    );

    return {
      event: {
        distance: args.distance,
        stroke: args.stroke,
        course: args.course,
        label: eventLabel(args.distance, args.stroke),
      },
      rows,
    };
  },
});

// ---------------------------------------------------------------------------
// getProgression — full time series per swimmer for one event (BRD §5.6)
// ---------------------------------------------------------------------------
//
// One series per swimmer: EVERY logged swim (all types) for the exact
// (distance, stroke, course), sorted by date. MEET swims are flagged and the
// current headline PB (fastest MEET) is marked so the chart can distinguish
// them. One swimmer or a group — the client passes 1..N ids (a squad resolves
// to its members client-side). Course is required (SCM/LCM never mixed).

const progressionPoint = v.object({
  resultId: v.id("results"),
  swimDate: v.string(),
  timeMs: v.number(),
  swimType,
  isMeet: v.boolean(),
  isPB: v.boolean(), // the current headline PB (fastest MEET) for this swimmer
});

const progressionSeries = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  gender,
  dob: v.string(), // ISO — lets the chart step tier cuts across a birthday (§4.9)
  pbTimeMs: v.union(v.number(), v.null()), // null => no MEET swim yet
  points: v.array(progressionPoint),
});

// One qualifying cut row for the charted event (§4.9). LCM only — the chart
// resolves these to the swimmer's EXACT age (stepping across birthdays) rather
// than the server picking a single age, so a multi-year time series is honest.
const standardCut = v.object({
  gender,
  tier,
  age: v.number(),
  isCatchAllYoung: v.boolean(),
  isCatchAllOld: v.boolean(),
  timeMs: v.number(),
});

export const getProgression = query({
  args: {
    swimmerIds: v.array(v.id("swimmers")),
    distance,
    stroke,
    course,
  },
  returns: v.object({
    event: eventSummary,
    series: v.array(progressionSeries),
    // The charted event's cut rows for the genders in this selection (LCM only;
    // empty on SCM). The chart resolves them to each swimmer's exact age.
    standards: v.array(standardCut),
  }),
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // De-dupe and cap so a squad with repeats or a huge selection stays bounded.
    const ids = [...new Set(args.swimmerIds)].slice(0, MAX_SERIES);

    const series: Array<{
      swimmerId: Id<"swimmers">;
      name: string;
      gender: "M" | "F";
      dob: string;
      pbTimeMs: number | null;
      points: Array<{
        resultId: Id<"results">;
        swimDate: string;
        timeMs: number;
        swimType: "MEET" | "TIME_TRIAL" | "PRACTICE";
        isMeet: boolean;
        isPB: boolean;
      }>;
    }> = [];

    for (const id of ids) {
      const swimmer = await ctx.db.get(id);
      if (!swimmer) continue;

      const results = await ctx.db
        .query("results")
        .withIndex("by_event", (q) =>
          q
            .eq("swimmerId", id)
            .eq("distance", args.distance)
            .eq("stroke", args.stroke)
            .eq("course", args.course),
        )
        .take(SWIMMER_RESULTS_LIMIT);

      // PB = fastest MEET; ties break to the earliest date (mirrors §4.6).
      let pb: { timeMs: number; swimDate: string; resultId: Id<"results"> } | null =
        null;
      for (const r of results) {
        if (r.swimType !== "MEET") continue;
        if (
          !pb ||
          r.timeMs < pb.timeMs ||
          (r.timeMs === pb.timeMs && r.swimDate < pb.swimDate)
        ) {
          pb = { timeMs: r.timeMs, swimDate: r.swimDate, resultId: r._id };
        }
      }

      const points = [...results]
        .sort((a, b) =>
          a.swimDate < b.swimDate
            ? -1
            : a.swimDate > b.swimDate
              ? 1
              : a.timeMs - b.timeMs,
        )
        .map((r) => ({
          resultId: r._id,
          swimDate: r.swimDate,
          timeMs: r.timeMs,
          swimType: r.swimType,
          isMeet: r.swimType === "MEET",
          isPB: pb !== null && r._id === pb.resultId,
        }));

      series.push({
        swimmerId: id,
        name: swimmer.name,
        gender: swimmer.gender,
        dob: swimmer.dob,
        pbTimeMs: pb ? pb.timeMs : null,
        points,
      });
    }

    series.sort((a, b) => a.name.localeCompare(b.name));

    // Overlay cuts (§4.9) are LCM-only. Load this event's cut rows for just the
    // genders present in the selection — the chart resolves them per swimmer.
    const standards: Array<{
      gender: "M" | "F";
      tier: Tier;
      age: number;
      isCatchAllYoung: boolean;
      isCatchAllOld: boolean;
      timeMs: number;
    }> = [];
    if (args.course === "LCM") {
      const genders = [...new Set(series.map((s) => s.gender))];
      for (const g of genders) {
        const cuts = await ctx.db
          .query("standards")
          .withIndex("by_event", (q) =>
            q
              .eq("gender", g)
              .eq("distance", args.distance)
              .eq("stroke", args.stroke),
          )
          .take(500);
        for (const c of cuts) {
          standards.push({
            gender: c.gender,
            tier: c.tier,
            age: c.age,
            isCatchAllYoung: c.isCatchAllYoung,
            isCatchAllOld: c.isCatchAllOld,
            timeMs: c.timeMs,
          });
        }
      }
    }

    return {
      event: {
        distance: args.distance,
        stroke: args.stroke,
        course: args.course,
        label: eventLabel(args.distance, args.stroke),
      },
      series,
      standards,
    };
  },
});
