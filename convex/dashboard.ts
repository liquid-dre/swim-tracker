import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireCoach } from "./authz";
import {
  computeAge,
  computeMatrixCell,
  computePersonalBests,
  eventSortKey,
  pickApplicableStandards,
  type Distance,
  type ResultForPB,
  type StandardCut,
  type Stroke,
  type Tier,
} from "../lib/swim";

/*
  Coach dashboard squad overview (the "punchy home" — the vibrance revamp). One
  read that summarises the roster the way a coach scans it after a meet: four
  headline counts, then one representative "top event" per swimmer with its
  headline PB, the hardest tier that PB meets, the gap to the next cut, and a
  short trend of recent meet times for a sparkline.

  Everything is DERIVED with the exact same domain rules as the rest of the app —
  headline PB = fastest MEET time only (§4.6), tiers resolve to the swimmer's
  EXACT single-year age on LCM standards only (§4.9), tier order SANJ > L3 > L2.
  Nothing here invents a number: SCM never carries a tier, and no cut is drawn
  where coverage doesn't exist. Coach-only (cross-roster, §5.9) — a viewer is
  rejected server-side.
*/

const DASH_SWIMMERS_LIMIT = 500;
const DASH_STANDARDS_LIMIT = 5000;
const SWIMMER_RESULTS_LIMIT = 2000;
// "Close to a cut" threshold and the recent-PB window, matching the dashboard copy.
const CLOSE_MS = 1000; // within 1.00s of the next cut
const PB_WINDOW_DAYS = 7; // "PBs this week"
const TREND_POINTS = 6; // recent meet times in the roster sparkline

const stroke = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);
const distance = v.union(
  v.literal(25),
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

const topEvent = v.object({
  distance,
  stroke,
  label: v.string(),
  pbMs: v.number(), // headline MEET LCM PB
  tier: v.union(tier, v.null()), // hardest tier met, or null (has a cut, none met)
  nextTier: v.union(tier, v.null()), // the next cut to chase, or null at the top
  gapMs: v.union(v.number(), v.null()), // PB − next cut (≥0 to drop); null at top / no cut
  // Recent MEET times for this event (chronological), for the sparkline. 1 point
  // is legitimate (a flat spark); the client handles a short series.
  trend: v.array(v.number()),
});

const rosterRow = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  gender,
  age: v.number(),
  // null when the swimmer has no LCM meet time to anchor a tier read yet.
  top: v.union(v.null(), topEvent),
});

const TIER_RANK: Record<Tier, number> = { SANJ: 3, LEVEL_3: 2, LEVEL_2: 1 };

export const getCoachDashboard = query({
  args: {},
  returns: v.object({
    counts: v.object({
      swimmers: v.number(), // active swimmers
      pbsThisWeek: v.number(), // lifetime headline PBs set in the last 7 days
      cutsQualified: v.number(), // swimmer×event cells with a tier met (LCM)
      closeToCut: v.number(), // swimmers within 1.00s of a next cut
    }),
    roster: v.array(rosterRow),
  }),
  handler: async (ctx) => {
    await requireCoach(ctx);

    const today = new Date().toISOString().slice(0, 10);
    const pbCutoff = new Date(Date.now() - PB_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Cuts, loaded once and grouped by (gender|distance|stroke); each swimmer
    // resolves to their exact age. Small table at club scale.
    const allStandards = await ctx.db
      .query("standards")
      .take(DASH_STANDARDS_LIMIT);
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

    // The active roster only — the dashboard is "who's in the water now".
    const swimmers = await ctx.db
      .query("swimmers")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(DASH_SWIMMERS_LIMIT);
    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    let pbsThisWeek = 0;
    let cutsQualified = 0;
    let closeToCut = 0;
    const roster = [];

    for (const swimmer of swimmers) {
      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(SWIMMER_RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);
      const age = computeAge(swimmer.dob, today); // display age (as of today)

      // "PBs this week": any headline (fastest-ever MEET) whose date is inside the
      // window — i.e. the swimmer set a new lifetime best this week (any course).
      for (const pb of pbs) {
        if (pb.headline && pb.headline.swimDate >= pbCutoff) pbsThisWeek += 1;
      }

      // Evaluate every LCM event that has a headline PB against this swimmer's
      // exact-age cuts. Track the "top" event and the two roster-level flags.
      let top: {
        distance: Distance;
        stroke: Stroke;
        label: string;
        pbMs: number;
        tier: Tier | null;
        nextTier: Tier | null;
        gapMs: number | null;
      } | null = null;
      let swimmerIsClose = false;

      for (const pb of pbs) {
        if (pb.course !== "LCM" || !pb.headline) continue;
        // Judge each PB against the cut for the swimmer's age AT THE GALA where it
        // was swum (§4.9), not their age today.
        const applicable = pickApplicableStandards(
          cutsByEvent.get(`${swimmer.gender}|${pb.distance}|${pb.stroke}`) ?? [],
          pb.headline.ageAtSwim ?? age,
        );
        const cell = computeMatrixCell(pb.headline.timeMs, applicable);
        if (cell.tier !== null) cutsQualified += 1;
        if (cell.gapMs !== null && cell.gapMs > 0 && cell.gapMs <= CLOSE_MS) {
          swimmerIsClose = true;
        }

        const candidate = {
          distance: pb.distance,
          stroke: pb.stroke,
          label: pb.label,
          pbMs: pb.headline.timeMs,
          tier: cell.tier,
          nextTier: cell.nextTier,
          gapMs: cell.gapMs,
        };
        if (top === null || isBetterTop(candidate, top)) top = candidate;
      }

      if (swimmerIsClose) closeToCut += 1;

      // Trend: recent MEET times for the chosen top event (chronological).
      let trend: number[] = [];
      if (top !== null) {
        trend = results
          .filter(
            (r) =>
              r.course === "LCM" &&
              r.swimType === "MEET" &&
              r.distance === top!.distance &&
              r.stroke === top!.stroke,
          )
          .sort((a, b) =>
            a.swimDate < b.swimDate ? -1 : a.swimDate > b.swimDate ? 1 : 0,
          )
          .slice(-TREND_POINTS)
          .map((r) => r.timeMs);
      }

      roster.push({
        swimmerId: swimmer._id,
        name: swimmer.name,
        gender: swimmer.gender,
        age,
        top: top === null ? null : { ...top, trend },
      });
    }

    return {
      counts: {
        swimmers: swimmers.length,
        pbsThisWeek,
        cutsQualified,
        closeToCut,
      },
      roster,
    };
  },
});

/**
 * Is `a` a better "top event" than the incumbent `b`? Proudest first: hardest
 * tier met, then closest to the next cut (smallest positive gap), then canonical
 * event order as a stable tiebreak. Events with a cut beat events with none.
 */
function isBetterTop(
  a: { tier: Tier | null; gapMs: number | null; distance: number; stroke: string },
  b: { tier: Tier | null; gapMs: number | null; distance: number; stroke: string },
): boolean {
  const ra = a.tier ? TIER_RANK[a.tier] : 0;
  const rb = b.tier ? TIER_RANK[b.tier] : 0;
  if (ra !== rb) return ra > rb;
  // Both same tier: prefer the one with a measurable gap, closest to the next cut.
  const ga = a.gapMs === null ? Infinity : a.gapMs;
  const gb = b.gapMs === null ? Infinity : b.gapMs;
  if (ga !== gb) return ga < gb;
  return eventSortKey(a.distance, a.stroke) < eventSortKey(b.distance, b.stroke);
}
