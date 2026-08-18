import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireCoach } from "./authz";
import {
  computeAge,
  computeMatrixCell,
  computePersonalBests,
  eventSortKey,
  galaResolutionAges,
  pickApplicableStandardsPerGala,
  GALA_ORDER,
  type Course,
  type Distance,
  type GalaCode,
  type ResultForPB,
  type StandardCut,
  type Stroke,
} from "../lib/swim";
import { galaCodeValidator, loadGalas, toGalaRefs } from "./galas";

/*
  Coach dashboard squad overview (the "punchy home" — the vibrance revamp). One
  read that summarises the roster the way a coach scans it after a meet: four
  headline counts, then one representative "top event" per swimmer with its
  headline PB, the hardest gala that PB meets, the gap to the next cut, and a
  short trend of recent meet times for a sparkline.

  Everything is DERIVED with the exact same domain rules as the rest of the app —
  headline PB = fastest MEET time only (§4.6), cuts resolve to the swimmer's
  EXACT single-year age (§4.9), and each PB is judged against its OWN course's
  cut because both courses are valid for entry (§4.2). Gala order comes from
  GALA_ORDER. Nothing here invents a number: no cut is drawn where coverage
  doesn't exist. Coach-only (cross-roster, §5.9) — a viewer is rejected
  server-side.
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
const course = v.union(v.literal("SCM"), v.literal("LCM"));

const topEvent = v.object({
  distance,
  stroke,
  label: v.string(),
  course, // the course this PB (and its cut) belong to — never mixed
  pbMs: v.number(), // headline MEET PB in that course
  gala: v.union(galaCodeValidator, v.null()), // hardest gala met, or null (cut exists, none met)
  nextGala: v.union(galaCodeValidator, v.null()), // the next cut to chase, or null at the top
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
  // null when the swimmer has no meet time to anchor a gala read yet.
  top: v.union(v.null(), topEvent),
});

// Rank from the single source of truth in lib/galas (GALA_ORDER is hardest
// first, so invert the index) — never a second, drift-prone copy.
const GALA_RANK: Record<GalaCode, number> = GALA_ORDER.reduce(
  (acc, code, i) => {
    acc[code] = GALA_ORDER.length - i;
    return acc;
  },
  {} as Record<GalaCode, number>,
);

export const getCoachDashboard = query({
  args: {
    // The coach's PREVIOUS visit (from profiles.beginSession) — anchors the
    // "since you were last here" digest. Omitted = no digest (first visit).
    digestSince: v.optional(v.number()),
  },
  returns: v.object({
    counts: v.object({
      swimmers: v.number(), // active swimmers
      pbsThisWeek: v.number(), // lifetime headline PBs set in the last 7 days
      cutsQualified: v.number(), // swimmer×event×course PBs that meet a gala cut
      closeToCut: v.number(), // swimmers within 1.00s of a next cut
    }),
    // First-run signals: which setup steps (swimmers → standards → results)
    // still need doing. Drives the dashboard checklist for a new coach.
    setup: v.object({
      hasStandards: v.boolean(),
      hasResults: v.boolean(),
    }),
    // What changed since the coach's previous visit; null without an anchor.
    digest: v.union(
      v.null(),
      v.object({
        // Swimmers whose CURRENT headline PB was logged since the last visit.
        newPbSwimmers: v.array(v.string()),
        swimsLogged: v.number(),
      }),
    ),
    roster: v.array(rosterRow),
  }),
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    const today = new Date().toISOString().slice(0, 10);
    const pbCutoff = new Date(Date.now() - PB_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Cuts, loaded once and grouped by (gender|distance|stroke); each swimmer
    // resolves to their exact age. Small table at club scale.
    const galas = await loadGalas(ctx);
    const galaRefs = toGalaRefs(galas);
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));
    const allStandards = await ctx.db
      .query("standards")
      .take(DASH_STANDARDS_LIMIT);
    const cutsByEvent = new Map<
      string,
      Array<StandardCut & { gala: GalaCode; course: Course }>
    >();
    for (const s of allStandards) {
      if (s.galaId === undefined || s.course === undefined) continue;
      const key = `${s.gender}|${s.distance}|${s.stroke}`;
      const gala = codeById.get(s.galaId);
      if (gala === undefined) continue;
      const cut = {
        gala,
        course: s.course as Course,
        age: s.age ?? null,
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
    let hasResults = false;
    let digestSwims = 0;
    const digestPbSwimmers: string[] = [];
    const roster = [];

    for (const swimmer of swimmers) {
      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(SWIMMER_RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);
      const age = computeAge(swimmer.dob, today); // display age (as of today)
      if (results.length > 0) hasResults = true;

      // Digest: swims logged since the last visit, and whether any CURRENT
      // headline PB is among them (i.e. a lifetime best set while away).
      if (args.digestSince !== undefined) {
        let newPb = false;
        for (const r of results) {
          if (r.createdAt <= args.digestSince) continue;
          digestSwims += 1;
          if (r.swimType !== "MEET" || newPb) continue;
          newPb = pbs.some(
            (pb) =>
              pb.headline !== null &&
              pb.distance === r.distance &&
              pb.stroke === r.stroke &&
              pb.course === r.course &&
              pb.headline.timeMs === r.timeMs &&
              pb.headline.swimDate === r.swimDate,
          );
        }
        if (newPb) digestPbSwimmers.push(swimmer.name);
      }

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
        course: Course;
        pbMs: number;
        gala: GalaCode | null;
        nextGala: GalaCode | null;
        gapMs: number | null;
      } | null = null;
      let swimmerIsClose = false;

      // Both courses count (§4.2): a swimmer is qualified on an event if either
      // their LCM or their SCM PB beats that course's own cut, so each PB is
      // judged in its OWN course and every qualifying PB counts once.
      for (const pb of pbs) {
        if (!pb.headline) continue;
        const course = pb.course as Course;
        // Same rule as the status matrix: galas WITH a tour date judge at the
        // swimmer's age on tour day; the rest at their CURRENT age (§4.9) —
        // never the age the PB was swum, so these counts match what the
        // qualification screens show.
        const applicable = pickApplicableStandardsPerGala(
          (cutsByEvent.get(`${swimmer.gender}|${pb.distance}|${pb.stroke}`) ?? [])
            .filter((c) => c.course === course),
          galaRefs,
          galaResolutionAges(swimmer.dob, age, galaRefs),
        );
        const cell = computeMatrixCell(
          { [course]: pb.headline.timeMs },
          course === "LCM"
            ? { LCM: applicable, SCM: {} }
            : { LCM: {}, SCM: applicable },
          course,
        );
        if (cell.gala !== null) cutsQualified += 1;
        if (cell.gapMs !== null && cell.gapMs > 0 && cell.gapMs <= CLOSE_MS) {
          swimmerIsClose = true;
        }

        const candidate = {
          distance: pb.distance,
          stroke: pb.stroke,
          label: pb.label,
          course,
          pbMs: pb.headline.timeMs,
          gala: cell.gala,
          nextGala: cell.nextGala,
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
      setup: {
        hasStandards: allStandards.length > 0,
        hasResults,
      },
      digest:
        args.digestSince === undefined
          ? null
          : { newPbSwimmers: digestPbSwimmers, swimsLogged: digestSwims },
      roster,
    };
  },
});

/**
 * Is `a` a better "top event" than the incumbent `b`? Proudest first: hardest
 * gala met, then closest to the next cut (smallest positive gap), then canonical
 * event order as a stable tiebreak. Events with a cut beat events with none.
 */
function isBetterTop(
  a: { gala: GalaCode | null; gapMs: number | null; distance: number; stroke: string },
  b: { gala: GalaCode | null; gapMs: number | null; distance: number; stroke: string },
): boolean {
  const ra = a.gala ? GALA_RANK[a.gala] : 0;
  const rb = b.gala ? GALA_RANK[b.gala] : 0;
  if (ra !== rb) return ra > rb;
  // Both same gala: prefer the one with a measurable gap, closest to the next cut.
  const ga = a.gapMs === null ? Infinity : a.gapMs;
  const gb = b.gapMs === null ? Infinity : b.gapMs;
  if (ga !== gb) return ga < gb;
  return eventSortKey(a.distance, a.stroke) < eventSortKey(b.distance, b.stroke);
}
