import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  accessibleSwimmerIds,
  requireSwimmerAccess,
  requireSwimmersAccess,
} from "./authz";
import {
  computeAge,
  recentBirthday,
  computeAgeGroup,
  computeCalibratedRadius,
  computeMatrixCell,
  computeOverallImprovement,
  computePersonalBests,
  computeSeasonImprovements,
  eventLabel,
  eventSortKey,
  emptyCutsByCourse,
  galaCoversEvent,
  galaResolutionAges,
  isGalaAgeEligible,
  highestGalaMet,
  pickApplicableStandardsPerGala,
  resolveGalaCut,
  rollingSeasonStart,
  type Course,
  type CourseMode,
  type CutsByCourse,
  type GalaCode,
  type GalaRef,
  type Distance,
  buildRingScale,
  type Stroke as StrokeT,
  type TourDateByGala,
  type ResultForPB,
  type SeasonSwim,
  type StandardCut,
} from "../lib/swim";
import { galaCodeValidator, loadGalas, toGalaRefs, tourDatesByGala } from "./galas";

// Tour dates by gala, as returned to screens that explain their resolution.
const tourDatesValidator = v.object({
  SANS: v.optional(v.string()),
  SANY: v.optional(v.string()),
  SANJ: v.optional(v.string()),
  LEVEL_3: v.optional(v.string()),
  LEVEL_2: v.optional(v.string()),
});

/**
 * Tag a raw standards row with its gala code and course so the pure resolvers
 * can filter it, dropping pre-migration and orphaned rows. Cuts are NEVER used
 * across courses (§4.2).
 */
function tagCuts(
  rows: ReadonlyArray<Doc<"standards">>,
  codeById: Map<Id<"galas">, GalaCode>,
): Array<StandardCut & { gala: GalaCode; course: Course }> {
  const out: Array<StandardCut & { gala: GalaCode; course: Course }> = [];
  for (const r of rows) {
    if (r.galaId === undefined || r.course === undefined) continue;
    const gala = codeById.get(r.galaId);
    if (gala === undefined) continue;
    out.push({
      gala,
      course: r.course as Course,
      age: r.age ?? null,
      isCatchAllYoung: r.isCatchAllYoung,
      isCatchAllOld: r.isCatchAllOld,
      timeMs: r.timeMs,
    });
  }
  return out;
}

/** Resolve every gala's cut for one event in BOTH courses at the swimmer's ages. */
function resolveBothCourses(
  tagged: ReadonlyArray<StandardCut & { gala: GalaCode; course: Course }>,
  galaRefs: ReadonlyArray<GalaRef>,
  ages: Record<GalaCode, number>,
): CutsByCourse {
  const out = emptyCutsByCourse();
  for (const course of ["LCM", "SCM"] as const) {
    out[course] = pickApplicableStandardsPerGala(
      tagged.filter((c) => c.course === course),
      galaRefs,
      ages,
    );
  }
  return out;
}

// Base analysis reads (BRD §5.5–5.6, Step 7). Two derived views over `results`:
//   • getEventComparison — a leaderboard of headline MEET PBs for one event.
//   • getProgression     — each swimmer's full time series for one event.
// Both are pure reads; PBs are DERIVED here exactly as in personalBests.ts
// (fastest MEET only; trials/practice never count). Comparison and the status
// matrix / season ranking are coach-only (cross-roster, §5.9); progression and
// road-to-qualify are role-scoped so a viewer sees their own. Step 10 adds the LCM
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
  v.literal(25),
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const gender = v.union(v.literal("M"), v.literal("F"));
const courseMode = v.union(
  v.literal("LCM"),
  v.literal("SCM"),
  v.literal("BEST"),
);
const swimType = v.union(
  v.literal("MEET"),
  v.literal("TIME_TRIAL"),
  v.literal("PRACTICE"),
  v.literal("SCHOOL_GALA"), // parent-entered, unofficial — shown in progression (§R15)
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
  // Hardest gala this headline PB meets, at the swimmer's EXACT age (§4.9),
  // judged against THIS COURSE's own cut — never a borrowed one. Null when no
  // cut covers this event/age/course (e.g. 100 IM, which no gala has a cut for).
  highestGala: v.union(galaCodeValidator, v.null()),
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
    // True when the event's result scan hit its cap — some swimmers' older
    // results were not considered, so the leaderboard may be incomplete.
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Role-scoped. A coach / super-user sees the full cross-roster leaderboard;
    // a viewer sees only the swimmer(s) they are linked to (a parent comparing
    // their own children against each other and the cut). accessibleSwimmerIds
    // returns "ALL" for staff, so their leaderboard is unchanged.
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    const accessible = swimmerIds === "ALL" ? null : new Set(swimmerIds);
    const galas = await loadGalas(ctx);
    const galaRefs = toGalaRefs(galas);
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));

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
      { timeMs: number; swimDate: string; meetName: string | null; ageAtSwim: number }
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
          ageAtSwim: r.ageAtSwim,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    // A comparison is for ONE course, so each bar is coloured by the hardest gala
    // its PB meets against THAT COURSE's own cut at the swimmer's exact age —
    // never a borrowed long-course cut. Cut rows are loaded once per gender.
    // (An event with no cut rows — e.g. a 100 IM SCM — simply resolves to none.)
    const cutsByGender = new Map<"M" | "F", Doc<"standards">[]>();
    async function loadCuts(g: "M" | "F"): Promise<Doc<"standards">[]> {
      const cached = cutsByGender.get(g);
      if (cached) return cached;
      const loaded = await ctx.db
        .query("standards")
        .withIndex("by_event", (q) =>
          q
            .eq("gender", g)
            .eq("distance", args.distance)
            .eq("stroke", args.stroke),
        )
        .take(500);
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
      highestGala: GalaCode | null;
    }> = [];

    for (const [swimmerId, best] of bestBySwimmer) {
      if (accessible && !accessible.has(swimmerId)) continue; // viewer scope
      const swimmer = await ctx.db.get(swimmerId);
      if (!swimmer) continue; // deleted swimmer with orphaned results — skip

      if (args.gender && swimmer.gender !== args.gender) continue;
      const band = computeAgeGroup(swimmer.dob, today);
      if (args.ageGroup && band !== args.ageGroup) continue;

      const age = computeAge(swimmer.dob, today); // display age (as of today)
      // Resolve each gala's cut at the age the swimmer IS FOR THE COMPETITION:
      // the tour date when one is set, else their current age (§4.9). NEVER the
      // age a past PB was swum — a swimmer who beat the easier 14-year-old cut
      // must not still read as qualified once they're 15 and need the 15 cut.
      const ages = galaResolutionAges(swimmer.dob, age, galaRefs);
      const cuts = resolveBothCourses(
        tagCuts(await loadCuts(swimmer.gender), codeById),
        galaRefs,
        ages,
      );
      // This leaderboard is a single course, so judge on that course alone.
      const highestGala =
        highestGalaMet({ [args.course]: best.timeMs }, cuts, args.course)?.gala ??
        null;

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
        highestGala,
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
      truncated: results.length === EVENT_RESULTS_LIMIT,
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
//
// Access is role-scoped SERVER-SIDE (requireSwimmersAccess): a coach charts any
// swimmers, a viewer only their own linked swimmer(s) — a mixed selection that
// includes one unlinked swimmer is rejected outright, never silently trimmed.

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
  // ISO DOB lets the chart step tier cuts across a birthday (§4.9). SENSITIVE:
  // null for a "public" view (another swimmer) so an exact birth date never
  // leaks — the chart just omits the qualifying-cut overlay for that series.
  dob: v.union(v.string(), v.null()),
  // How much of this swimmer the caller may see (docs/access-control.md).
  view: v.union(v.literal("full"), v.literal("sensitive"), v.literal("public")),
  pbTimeMs: v.union(v.number(), v.null()), // null => no MEET swim yet
  points: v.array(progressionPoint),
});

// One qualifying cut row for the charted event (§4.9). LCM only — the chart
// resolves these to the swimmer's EXACT age (stepping across birthdays) rather
// than the server picking a single age, so a multi-year time series is honest.
const standardCut = v.object({
  gender,
  gala: galaCodeValidator,
  course, // cuts are course-specific — never borrowed across courses (§4.2)
  age: v.union(v.number(), v.null()), // null on an open standard (SANS/SANY)
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
    // Projections are coach-only (docs/access-control.md) — the client shows the
    // time-to-qualify control only when this is true.
    canSeeProjections: v.boolean(),
    // Tour dates by gala: the projection targets the cut for the swimmer's
    // age on tour day where one is set. (The historical stepped overlay
    // deliberately stays age-as-of-each-date — it describes the past.)
    tourDates: tourDatesValidator,
  }),
  handler: async (ctx, args) => {
    // De-dupe and cap so a squad with repeats or a huge selection stays bounded.
    const ids = [...new Set(args.swimmerIds)].slice(0, MAX_SERIES);

    // Role-scoped SERVER-SIDE (docs/access-control.md): a coach / super-user
    // charts any swimmers; a VIEWER may chart ONLY their own linked swimmer(s).
    // A selection that includes one swimmer the viewer isn't linked to is
    // rejected outright — never silently trimmed — so a viewer never sees another
    // swimmer's name, times, or history here. Projections stay coach-only below.
    const profile = await requireSwimmersAccess(ctx, ids);
    const staff = profile.role !== "VIEWER";

    const series: Array<{
      swimmerId: Id<"swimmers">;
      name: string;
      gender: "M" | "F";
      dob: string | null;
      view: "full" | "sensitive" | "public";
      pbTimeMs: number | null;
      points: Array<{
        resultId: Id<"results">;
        swimDate: string;
        timeMs: number;
        swimType: "MEET" | "TIME_TRIAL" | "PRACTICE" | "SCHOOL_GALA";
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

      // A viewer only ever reaches their OWN linked swimmers here (gated above),
      // so every charted swimmer is one they may see in full detail: staff get
      // "full", a viewer "sensitive". The exact DOB is always included so the
      // qualifying-cut overlay resolves per the swimmer's age; "public" never
      // occurs on this screen any more.
      const view = staff ? "full" : "sensitive";
      series.push({
        swimmerId: id,
        name: swimmer.name,
        gender: swimmer.gender,
        dob: swimmer.dob,
        view,
        pbTimeMs: pb ? pb.timeMs : null,
        points,
      });
    }

    series.sort((a, b) => a.name.localeCompare(b.name));

    // Overlay cuts (§4.9). Every row carries its gala AND its course, so the
    // chart draws THIS course's own cut rather than borrowing the long-course one
    // (never interpolated; an event with no row for a gala simply draws no line).
    // Load this event's cut rows for just the genders present in the selection —
    // the chart resolves them per age. `age` is null on an open standard.
    const galasForOverlay = await loadGalas(ctx);
    const overlayCodeById = new Map(
      galasForOverlay.map((g) => [g._id, g.code as GalaCode]),
    );
    const standards: Array<{
      gender: "M" | "F";
      gala: GalaCode;
      course: Course;
      age: number | null;
      isCatchAllYoung: boolean;
      isCatchAllOld: boolean;
      timeMs: number;
    }> = [];
    {
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
          .take(1000);
        for (const c of cuts) {
          if (c.galaId === undefined || c.course === undefined) continue;
          const gala = overlayCodeById.get(c.galaId);
          if (gala === undefined) continue;
          standards.push({
            gender: c.gender,
            gala,
            course: c.course as Course,
            age: c.age ?? null,
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
      // Projections are staff-only (docs/access-control.md): coaches and the
      // super-user, never a viewer — not even for their own swimmer.
      canSeeProjections: staff,
      tourDates: tourDatesByGala(galasForOverlay),
    };
  },
});

// ---------------------------------------------------------------------------
// getQualificationMatrix — the "who's ready for what" dashboard (BRD §5.7)
// ---------------------------------------------------------------------------
//
// A dense grid: rows = swimmers (after gender / age-band / squad filters),
// columns = the LCM events. Each cell carries the HARDEST qualifying tier the
// swimmer's headline MEET PB meets, plus the gap to the next gala up.
//
// `courseMode` picks what the grid means: "LCM"/"SCM" judge that course alone,
// and "BEST" — the default and the honest answer to "is my swimmer in?" — judges
// EITHER course against its own cut, because both are valid for entry (§4.2).
// A PB is never measured against the other course's cut.
//
// Cuts are resolved to each swimmer's EXACT single-year age (never the two-year
// display band the filter uses), and events with no cut at that age render
// blank/neutral. All the cell judgement is the pure `computeMatrixCell`; here we
// only load and shape. Bounded reads throughout (club scale, §11.1).

const MATRIX_SWIMMERS_LIMIT = 500;
const MATRIX_STANDARDS_LIMIT = 5000;

const matrixEvent = v.object({
  distance,
  stroke,
  label: v.string(),
});

const matrixCell = v.object({
  distance,
  stroke,
  label: v.string(),
  hasCut: v.boolean(), // a cut exists for this event at the swimmer's exact age
  // Headline MEET PB in each active course (null = never raced it in that course).
  pbLcmMs: v.union(v.number(), v.null()),
  pbScmMs: v.union(v.number(), v.null()),
  gala: v.union(galaCodeValidator, v.null()), // hardest gala met (null = none / no PB)
  galaCourse: v.union(course, v.null()), // which course earned it (the L/S marker)
  nextGala: v.union(galaCodeValidator, v.null()), // next gala up to chase (null at top)
  gapMs: v.union(v.number(), v.null()), // PB − next cut (≥ 0); null at top / no PB
  gapCourse: v.union(course, v.null()), // the course `gapMs` was measured in
});

const matrixRow = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  gender,
  age: v.number(), // exact single-year age as of today (drives cut resolution)
  ageBand: v.string(), // display band (§4.7) — for the row's group label
  active: v.boolean(),
  cells: v.array(matrixCell), // parallel to the returned `events`
});

export const getQualificationMatrix = query({
  args: {
    gender: v.optional(gender),
    ageBand: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
    // Which course(s) the grid judges. Defaults to BEST (either course counts).
    courseMode: v.optional(courseMode),
  },
  returns: v.object({
    events: v.array(matrixEvent), // columns, canonical 50→1500 order
    rows: v.array(matrixRow),
    courseMode,
    // False until any cuts are imported — the screen explains the blank matrix
    // and points a coach at Standards instead of looking broken.
    hasStandards: v.boolean(),
    // Which galas are judged at age-on-tour-day (the screen says so).
    tourDates: tourDatesValidator,
  }),
  handler: async (ctx, args) => {
    // Role-scoped. Staff get the full roster (optionally squad-filtered); a
    // viewer gets a matrix of only their linked swimmer(s).
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    const galas = await loadGalas(ctx);
    const galaRefs = toGalaRefs(galas);
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));
    const mode: CourseMode = args.courseMode ?? "BEST";
    const activeCourses: ReadonlyArray<Course> =
      mode === "BEST" ? (["LCM", "SCM"] as const) : ([mode] as const);

    // Columns: every active event swimmable in an active course, canonical order.
    // The only SCM-exclusive events (25 m, 100 IM) have no cut at any gala, so
    // the column set is in practice identical whichever course mode is picked.
    const allEvents = await ctx.db.query("events").take(200);
    const lcmEvents = allEvents
      .filter(
        (e) =>
          e.active &&
          activeCourses.some((c) => e.allowedCourses.includes(c)),
      )
      .sort(
        (a, b) =>
          eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke),
      );

    // Cuts, loaded once and grouped by (gender|distance|stroke) so each cell just
    // resolves to the swimmer's exact age. The table is small at club scale.
    const allStandards = await ctx.db
      .query("standards")
      .take(MATRIX_STANDARDS_LIMIT);
    const cutsByEvent = new Map<
      string,
      Array<StandardCut & { gala: GalaCode; course: Course }>
    >();
    // Group by event key. `tagCuts` drops pre-migration and orphaned rows, so a
    // cell can never resolve against an untagged cut. Both courses are kept —
    // `computeMatrixCell` picks the ones the active course mode asked for.
    for (const s of allStandards) {
      if (s.galaId === undefined || s.course === undefined) continue;
      const gala = codeById.get(s.galaId);
      if (gala === undefined) continue;
      const key = `${s.gender}|${s.distance}|${s.stroke}`;
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

    // Rows: for a viewer, only their linked swimmers (the squad filter is a coach
    // concept and is ignored). For staff, the roster scoped by squad (via the
    // join table) then gender/band.
    let swimmers;
    if (swimmerIds !== "ALL") {
      const loaded = await Promise.all(swimmerIds.map((id) => ctx.db.get(id)));
      swimmers = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
    } else if (args.squadId !== undefined) {
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_squad", (q) => q.eq("squadId", args.squadId!))
        .take(MATRIX_SWIMMERS_LIMIT);
      const loaded = await Promise.all(
        memberships.map((m) => ctx.db.get(m.swimmerId)),
      );
      swimmers = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
    } else {
      swimmers = await ctx.db.query("swimmers").take(MATRIX_SWIMMERS_LIMIT);
    }

    const today = new Date().toISOString().slice(0, 10);

    if (args.gender) {
      swimmers = swimmers.filter((s) => s.gender === args.gender);
    }
    if (args.ageBand) {
      // Filter by the two-year DISPLAY band (§4.7); resolution still uses the
      // exact age below — the band never leaks into a cut lookup.
      swimmers = swimmers.filter(
        (s) => computeAgeGroup(s.dob, today) === args.ageBand,
      );
    }

    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    const rows = [];
    for (const swimmer of swimmers) {
      // Headline MEET PBs for every event this swimmer has swum (same derivation
      // as the profile board): fastest MEET only, SCM/LCM kept separate.
      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(SWIMMER_RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);
      // Headline MEET PB per event PER COURSE — both are kept, because either
      // course can qualify a swimmer (§4.2) and they are never merged.
      const pbByEventCourse = new Map<string, number>();
      for (const pb of pbs) {
        if (pb.headline) {
          pbByEventCourse.set(
            `${pb.distance}|${pb.stroke}|${pb.course}`,
            pb.headline.timeMs,
          );
        }
      }

      const age = computeAge(swimmer.dob, today); // display age (as of today)
      const ageBand = computeAgeGroup(swimmer.dob, today);
      // Judge each gala's cut at the age the swimmer IS FOR THE COMPETITION:
      // the tour date when one is set, else their current age (§4.9). Never the
      // age a past PB was swum — a swimmer who beat the easier younger cut must
      // not keep reading as qualified once they've aged into a harder one.
      const ages = galaResolutionAges(swimmer.dob, age, galaRefs);

      const cells = lcmEvents.map((e) => {
        const pbLcmMs =
          pbByEventCourse.get(`${e.distance}|${e.stroke}|LCM`) ?? null;
        const pbScmMs =
          pbByEventCourse.get(`${e.distance}|${e.stroke}|SCM`) ?? null;
        const cuts = resolveBothCourses(
          cutsByEvent.get(`${swimmer.gender}|${e.distance}|${e.stroke}`) ?? [],
          galaRefs,
          ages,
        );
        const cell = computeMatrixCell(
          { LCM: pbLcmMs, SCM: pbScmMs },
          cuts,
          mode,
        );
        return {
          distance: e.distance,
          stroke: e.stroke,
          label: e.label,
          hasCut: cell.hasCut,
          // Only surface the course(s) this mode is judging, so the cell can
          // never show a time the grid is not measuring.
          pbLcmMs: mode === "SCM" ? null : pbLcmMs,
          pbScmMs: mode === "LCM" ? null : pbScmMs,
          gala: cell.gala,
          galaCourse: cell.galaCourse,
          nextGala: cell.nextGala,
          gapMs: cell.gapMs,
          gapCourse: cell.gapCourse,
        };
      });

      rows.push({
        swimmerId: swimmer._id,
        name: swimmer.name,
        gender: swimmer.gender,
        age,
        ageBand,
        active: swimmer.active,
        cells,
      });
    }

    return {
      events: lcmEvents.map((e) => ({
        distance: e.distance,
        stroke: e.stroke,
        label: e.label,
      })),
      rows,
      courseMode: mode,
      hasStandards: allStandards.length > 0,
      tourDates: tourDatesByGala(galas),
    };
  },
});

// ---------------------------------------------------------------------------
// getRoadToQualify — one swimmer's gap to a single target tier (BRD §5.10–5.11)
// ---------------------------------------------------------------------------
//
// The per-swimmer counterpart to the status matrix: pick a swimmer and ONE
// target tier (§5.10), and for every LCM event that tier covers at the
// swimmer's EXACT single-year age (§4.9), return the gap between their headline
// MEET PB and that tier's cut. LCM only — standards are long-course (§4.2).
//
//   • cutMs      the tier's cut for this event at the swimmer's exact age.
//   • pbMs       headline MEET LCM PB, or null (trials/practice never count).
//   • gapMs      pbMs − cutMs (positive = time to drop; ≤ 0 = qualified); null
//                with no PB (never drawn as a huge gap).
//   • gapPct     the gap as a % of the cut (signed); null with no PB.
//   • pctOfCut   pbMs as a % of the cut (100% = on the line, < 100% = qualified);
//                null with no PB. This is the sort key AND the profile bar.
//   • qualified  pbMs ≤ cutMs.
//
// Only events the tier actually covers at that age render (coverage is a HARD
// rule, §4.9: SANJ has no 50s, L2 nothing above 200 m). Events sort closest-first
// (ascending pctOfCut, so qualified float to the top); no-time events sort last
// in canonical order so they read as a separate "not raced yet" list, never a
// giant gap. Access is role-scoped server-side (requireSwimmerAccess): a coach
// reads any swimmer, a viewer only their own linked swimmer(s). Bounded reads.

const ROAD_STANDARDS_LIMIT = 5000;

const roadEvent = v.object({
  distance,
  stroke,
  label: v.string(),
  // The course this row is measured in — the one the swimmer is closest in when
  // the mode is BEST, since either course would qualify them (§4.2).
  course,
  cutMs: v.number(),
  pbMs: v.union(v.number(), v.null()),
  gapMs: v.union(v.number(), v.null()),
  gapPct: v.union(v.number(), v.null()),
  pctOfCut: v.union(v.number(), v.null()),
  qualified: v.boolean(),
});

export const getRoadToQualify = query({
  args: {
    swimmerId: v.id("swimmers"),
    gala: galaCodeValidator,
    // Which course to chase. Defaults to BEST: the gap shown is to whichever
    // course the swimmer is closest in, since either would qualify them (§4.2).
    courseMode: v.optional(courseMode),
  },
  returns: v.union(
    v.null(), // swimmer vanished (deleted elsewhere) → caller shows empty state
    v.object({
      swimmer: v.object({
        _id: v.id("swimmers"),
        name: v.string(),
        gender,
        age: v.number(), // exact single-year age today — drives cut resolution
        active: v.boolean(),
      }),
      gala: galaCodeValidator,
      displayName: v.string(),
      courseMode,
      events: v.array(roadEvent),
      // False when no cuts exist for this swimmer's gender at all — the screen
      // explains the empty road instead of looking broken.
      hasStandards: v.boolean(),
      // ISO date of the swimmer's birthday when it fell in the last 30 days —
      // the screen notes which cuts moved. Null (suppressed) when this gala
      // has a tour date: cuts are pinned to age-on-tour-day, so a birthday
      // changes nothing here. Never the raw dob.
      agedUpAt: v.union(v.string(), v.null()),
      // True when the swimmer's age falls outside this gala's entry window —
      // there is no road to walk, and the screen must say why rather than
      // showing an empty list that reads as "no cuts imported".
      ineligible: v.boolean(),
      // This gala's tour, when the super-user has set one — the screen says
      // "judged at age on tour day" with the name/date.
      tour: v.union(
        v.null(),
        v.object({
          name: v.union(v.string(), v.null()),
          date: v.string(),
          ageAtTour: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { swimmerId, gala: targetGala, courseMode: modeArg }) => {
    // Coach → any swimmer; viewer → only their linked swimmer(s). A viewer's own
    // road-to-qualify (§5.9) is authorised here, server-side.
    await requireSwimmerAccess(ctx, swimmerId);

    const swimmer = await ctx.db.get(swimmerId);
    if (swimmer === null) return null;

    const today = new Date().toISOString().slice(0, 10);
    const age = computeAge(swimmer.dob, today);

    const mode: CourseMode = modeArg ?? "BEST";
    const activeCourses: ReadonlyArray<Course> =
      mode === "BEST" ? (["LCM", "SCM"] as const) : ([mode] as const);

    const galas = await loadGalas(ctx);
    const gala = galas.find((g) => g.code === targetGala);
    const galaRef = gala ? toGalaRefs([gala])[0] : null;
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));

    // Columns: active events swimmable in a course we're judging, 50→1500.
    const allEvents = await ctx.db.query("events").take(200);
    const lcmEvents = allEvents
      .filter(
        (e) =>
          e.active && activeCourses.some((c) => e.allowedCourses.includes(c)),
      )
      .sort(
        (a, b) =>
          eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke),
      );

    // This swimmer's gender's cuts for the target gala, grouped by event and
    // kept per course. Small table at club scale; bounded read (guidelines).
    const allStandards = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) => q.eq("gender", swimmer.gender))
      .take(ROAD_STANDARDS_LIMIT);
    const cutsByEvent = new Map<string, Array<StandardCut & { course: Course }>>();
    for (const s of allStandards) {
      if (s.galaId === undefined || s.course === undefined) continue;
      if (codeById.get(s.galaId) !== targetGala) continue; // one gala only (§5.10)
      const key = `${s.distance}|${s.stroke}`;
      const cut = {
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

    // Headline MEET PBs per event PER COURSE (same derivation as the matrix).
    const results = await ctx.db
      .query("results")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(SWIMMER_RESULTS_LIMIT);
    const pbs = computePersonalBests(results as ResultForPB[]);
    const pbByEventCourse = new Map<string, number>();
    for (const pb of pbs) {
      if (pb.headline) {
        pbByEventCourse.set(
          `${pb.distance}|${pb.stroke}|${pb.course}`,
          pb.headline.timeMs,
        );
      }
    }

    // With a tour date for this gala, every cut resolves at the age the swimmer
    // will be on tour day — the question this screen answers is "can they go?".
    // Without one, judge against their CURRENT age (§4.9) — never the age a past
    // PB was swum.
    const tourDate = gala?.tourDate ?? undefined;
    const tourAge = tourDate !== undefined ? computeAge(swimmer.dob, tourDate) : null;
    const cutAge = tourAge ?? age;
    // Outside the gala's entry window there is no road at all — say so rather
    // than returning an empty list that reads as "no standards imported".
    const ineligible = galaRef !== null && !isGalaAgeEligible(galaRef, cutAge);

    const events = [];
    for (const e of lcmEvents) {
      // Coverage is a HARD rule (§4.9): only render where the gala covers this
      // event AND a cut actually resolves for the applicable age.
      if (gala === undefined || galaRef === null) break;
      if (!galaCoversEvent(gala, e.distance, e.stroke)) continue;

      const eventCuts = cutsByEvent.get(`${e.distance}|${e.stroke}`) ?? [];

      // Pick the course this row is measured in: the one the swimmer is CLOSEST
      // in (or qualified in), since either course would get them there. With a
      // single-course mode there is only ever one candidate.
      let bestRow: {
        course: Course;
        cutMs: number;
        pbMs: number | null;
        pctOfCut: number | null;
      } | null = null;
      for (const c of activeCourses) {
        const cutMs = resolveGalaCut(
          galaRef,
          eventCuts.filter((cut) => cut.course === c),
          cutAge,
        );
        if (cutMs === null) continue;
        const pbMs = pbByEventCourse.get(`${e.distance}|${e.stroke}|${c}`) ?? null;
        const pctOfCut = pbMs === null ? null : (pbMs / cutMs) * 100;
        if (bestRow === null) {
          bestRow = { course: c, cutMs, pbMs, pctOfCut };
          continue;
        }
        // A measurable row always beats an unmeasurable one; otherwise the
        // smaller percentage-of-cut wins (closer to, or further inside, the line).
        if (bestRow.pctOfCut === null) {
          if (pctOfCut !== null) bestRow = { course: c, cutMs, pbMs, pctOfCut };
        } else if (pctOfCut !== null && pctOfCut < bestRow.pctOfCut) {
          bestRow = { course: c, cutMs, pbMs, pctOfCut };
        }
      }
      if (bestRow === null) continue; // no cut in any active course → no row

      const { course: rowCourse, cutMs, pbMs, pctOfCut } = bestRow;
      const gapMs = pbMs === null ? null : pbMs - cutMs;
      const gapPct = pbMs === null ? null : (gapMs! / cutMs) * 100;
      const qualified = pbMs !== null && pbMs <= cutMs;

      events.push({
        distance: e.distance,
        stroke: e.stroke,
        label: e.label,
        course: rowCourse,
        cutMs,
        pbMs,
        gapMs,
        gapPct,
        pctOfCut,
        qualified,
      });
    }

    // Closest-first: ascending pctOfCut floats qualified (< 100%) to the top and
    // orders the chasers by how near the line they are. Events with no meet time
    // can't be measured, so they trail in canonical order as their own list.
    const withTime = events
      .filter((e) => e.pbMs !== null)
      .sort((a, b) => (a.pctOfCut as number) - (b.pctOfCut as number));
    const noTime = events
      .filter((e) => e.pbMs === null)
      .sort(
        (a, b) =>
          eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke),
      );

    return {
      swimmer: {
        _id: swimmer._id,
        name: swimmer.name,
        gender: swimmer.gender,
        age,
        active: swimmer.active,
      },
      gala: targetGala,
      displayName: gala?.displayName ?? targetGala,
      courseMode: mode,
      events: [...withTime, ...noTime],
      hasStandards: allStandards.length > 0,
      agedUpAt: tourAge !== null ? null : recentBirthday(swimmer.dob, today),
      ineligible,
      tour:
        tourAge !== null && tourDate !== undefined
          ? { name: gala?.tourName ?? null, date: tourDate, ageAtTour: tourAge }
          : null,
    };
  },
});

// ---------------------------------------------------------------------------
// getStrokeProfile — the radial "stroke profile" wheel data (BRD §5, Step 12.5)
// ---------------------------------------------------------------------------
//
// One entry per APPLICABLE LCM event for a swimmer: an event is applicable when
// at least one gala the swimmer can ENTER has a cut at their EXACT single-year
// age (§4.9). Each entry carries the headline MEET LCM PB (fastest meet only —
// trials/practice never count, §4.6), that event's cuts as a sparse list ordered
// inner ring → outer ring (a gala with no coverage simply contributes no entry —
// never a faked one, §4.9), the calibrated radius (the PB on this event's own
// scale, in ring units; null with no PB), and the hardest gala the PB meets.
//
// The RINGS are the union of galas that produced a cut, which the entry windows
// hold to 2-4 and never 5 (SANS opens at 15 and SANY at 17, while L2/L3/SANJ
// close at 16) — that bound is what keeps the wheel legible. `ringGalas` ships
// that layout; the client rebuilds the full scale with `buildRingScale` rather
// than carry a second copy of numbers that must agree.
//
// The client splits events into "full coverage" (a cut on every ring) and
// "partial coverage" (some rings absent, drawn flagged) purely from the returned
// cuts — no hard-coded event list, so it stays honest as a swimmer ages across
// coverage boundaries. The wheel reads ONE course, long, so every spoke is
// measured on the same footing; short-course cuts exist (§4.2) but mixing the two
// on one radial scale would compare times that are not comparable.
//
// Access is role-scoped SERVER-SIDE: a coach reads any swimmer, a viewer only
// their own linked swimmer(s) (requireSwimmerAccess). The screen's compare mode
// is a client concern — each swimmer is a separate authorised read.

const STROKE_ORDER_KEY: Record<string, number> = {
  FREE: 0,
  BACK: 1,
  BREAST: 2,
  FLY: 3,
  IM: 4,
};

const strokeProfileEvent = v.object({
  distance,
  stroke,
  label: v.string(),
  pbMs: v.union(v.number(), v.null()),
  // This event's cuts, one per gala that both covers it and is on the wheel,
  // ordered inner ring → outer ring. Sparse by design: a 50 Free carries no
  // Level 3 or SANJ cut, so it simply anchors on fewer rings.
  cuts: v.array(v.object({ gala: galaCodeValidator, timeMs: v.number() })),
  // The PB on this event's calibrated ring scale (ring units). Null when there
  // is no PB; the wheel renders those spokes as an empty tick.
  calibratedRadius: v.union(v.number(), v.null()),
  // Hardest gala this event's PB meets. Any of the five — which one is possible
  // depends on the swimmer's age, since the wheel only carries galas they can enter.
  highestGala: v.union(galaCodeValidator, v.null()),
  // Convenience flag the client would otherwise recompute: this event has a cut
  // on every ring of the wheel.
  fullCoverage: v.boolean(),
});

/** Explicit shape for `getStrokeProfile` — see the note on its handler. */
type StrokeProfileResult = {
  swimmer: {
    _id: Id<"swimmers">;
    name: string;
    gender: "M" | "F";
    age: number;
    active: boolean;
  };
  events: Array<{
    distance: Distance;
    stroke: StrokeT;
    label: string;
    pbMs: number | null;
    cuts: Array<{ gala: GalaCode; timeMs: number }>;
    calibratedRadius: number | null;
    highestGala: GalaCode | null;
    fullCoverage: boolean;
  }>;
  /** The wheel's rings, inner → outer. Feed to `buildRingScale` for the full scale. */
  ringGalas: GalaCode[];
  hasStandards: boolean;
  agedUpAt: string | null;
  tourDates: TourDateByGala;
} | null;

export const getStrokeProfile = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.union(
    v.null(), // swimmer vanished → caller shows an empty state
    v.object({
      swimmer: v.object({
        _id: v.id("swimmers"),
        name: v.string(),
        gender,
        age: v.number(), // exact single-year age today — drives cut resolution
        active: v.boolean(),
      }),
      events: v.array(strokeProfileEvent),
      // The wheel's rings, inner → outer. Derived from the galas this swimmer can
      // enter, so it is 2-4 long. Everything else about the scale (ring positions,
      // the outer bound) is derivable — clients call `buildRingScale(order)` rather
      // than carry a second copy of numbers that must agree.
      ringGalas: v.array(galaCodeValidator),
      // False when no cuts exist for this swimmer's gender — callers show the
      // standards-missing guidance instead of a shrugging empty state.
      hasStandards: v.boolean(),
      // See getRoadToQualify — birthday within the last 30 days, else null.
      agedUpAt: v.union(v.string(), v.null()),
      // Which tiers are pinned to a tour day, so the age-up note can say
      // which cuts a birthday does NOT move.
      tourDates: tourDatesValidator,
    }),
  ),
  // The return type is pinned explicitly: this validator is large enough that
  // inferring it re-instantiates the generated DataModel type and TS then reports
  // the two instantiations as unrelated (TS2719).
  handler: async (ctx, { swimmerId }): Promise<StrokeProfileResult> => {
    // Read gate: coach → any swimmer; viewer → only their linked swimmer(s).
    await requireSwimmerAccess(ctx, swimmerId);

    const swimmer = await ctx.db.get(swimmerId);
    if (swimmer === null) return null;

    const today = new Date().toISOString().slice(0, 10);
    const age = computeAge(swimmer.dob, today);

    // Active LCM events (standards are LCM-only), canonical 50→1500 order.
    const allEvents = await ctx.db.query("events").take(200);
    const lcmEvents = allEvents
      .filter((e) => e.active && e.allowedCourses.includes("LCM"))
      .sort(
        (a, b) =>
          eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke),
      );

    // This swimmer's gender's cuts, grouped by event so each resolves to the
    // exact age via pickApplicableStandards. Small table at club scale.
    const allStandards = await ctx.db
      .query("standards")
      .withIndex("by_lookup", (q) => q.eq("gender", swimmer.gender))
      .take(ROAD_STANDARDS_LIMIT);
    const profileGalas = await loadGalas(ctx);
    const profileCodeById = new Map(
      profileGalas.map((g) => [g._id, g.code as GalaCode]),
    );
    const cutsByEvent = new Map<
      string,
      Array<StandardCut & { gala: GalaCode; course: Course }>
    >();
    for (const s of allStandards) {
      if (s.galaId === undefined || s.course === undefined) continue;
      const gala = profileCodeById.get(s.galaId);
      if (gala === undefined) continue;
      const key = `${s.distance}|${s.stroke}`;
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

    // Headline MEET LCM PBs (same derivation as the profile board / matrix).
    const results = await ctx.db
      .query("results")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(SWIMMER_RESULTS_LIMIT);
    const pbs = computePersonalBests(results as ResultForPB[]);
    const lcmPbByEvent = new Map<
      string,
      { timeMs: number; ageAtSwim: number | null }
    >();
    for (const pb of pbs) {
      if (pb.course === "LCM" && pb.headline) {
        lcmPbByEvent.set(`${pb.distance}|${pb.stroke}`, {
          timeMs: pb.headline.timeMs,
          ageAtSwim: pb.headline.ageAtSwim,
        });
      }
    }

    const galaRefs = toGalaRefs(profileGalas);
    const ages = galaResolutionAges(swimmer.dob, age, galaRefs);

    // PASS 1 — resolve each event's cuts and learn which galas the wheel needs.
    //
    // Calibrate against the cut the swimmer must meet FOR THE COMPETITION:
    // tour-day age when a date is set, else current age (§4.9). Never the age a
    // past PB was swum. `pickApplicableStandardsPerGala` already drops galas the
    // swimmer is too young or too old to enter, which is what keeps the wheel to
    // 2-4 rings and never 5: SANS opens at 15 and SANY at 17, while L2/L3/SANJ
    // close at 16. Long course only — the wheel reads one course.
    const resolved: Array<{
      event: (typeof lcmEvents)[number];
      pbMs: number | null;
      applicable: Partial<Record<GalaCode, number>>;
    }> = [];
    const galasOnWheel = new Set<GalaCode>();
    for (const e of lcmEvents) {
      const pb = lcmPbByEvent.get(`${e.distance}|${e.stroke}`) ?? null;
      const applicable = pickApplicableStandardsPerGala(
        (cutsByEvent.get(`${e.distance}|${e.stroke}`) ?? []).filter(
          (c) => c.course === "LCM",
        ),
        galaRefs,
        ages,
      );
      const present = Object.keys(applicable) as GalaCode[];
      // Applicable = at least one gala has a cut here at this age. An event with
      // no cut at all can't be placed on any ring — omit it (§4.9).
      if (present.length === 0) continue;
      for (const gala of present) galasOnWheel.add(gala);
      resolved.push({ event: e, pbMs: pb ? pb.timeMs : null, applicable });
    }

    // The ring layout is a property of the WHOLE wheel, so it is built from the
    // union across events. Deriving it from galas that actually produced a cut
    // (rather than from eligibility alone) guarantees no empty ring is drawn.
    const ringScale = buildRingScale([...galasOnWheel]);

    // PASS 2 — place each event's PB on that shared scale.
    const events = [];
    for (const { event: e, pbMs, applicable } of resolved) {
      // Ordered inner ring → outer ring, so the client can render without sorting.
      const cuts = ringScale.order.flatMap((gala) => {
        const timeMs = applicable[gala];
        return timeMs === undefined ? [] : [{ gala, timeMs }];
      });
      events.push({
        distance: e.distance,
        stroke: e.stroke,
        label: e.label,
        pbMs,
        cuts,
        calibratedRadius: computeCalibratedRadius(pbMs, cuts, ringScale),
        highestGala:
          pbMs === null
            ? null
            : (highestGalaMet(
                { LCM: pbMs },
                { LCM: applicable, SCM: {} },
                "LCM",
              )?.gala ?? null),
        fullCoverage: cuts.length === ringScale.order.length,
      });
    }

    // Group contiguously by stroke (Free→Back→Breast→Fly→IM), distance ascending
    // within a stroke — the wheel draws each stroke as one coloured arc.
    events.sort(
      (a, b) =>
        (STROKE_ORDER_KEY[a.stroke] ?? 9) - (STROKE_ORDER_KEY[b.stroke] ?? 9) ||
        a.distance - b.distance,
    );

    return {
      swimmer: {
        _id: swimmer._id,
        name: swimmer.name,
        gender: swimmer.gender,
        age,
        active: swimmer.active,
      },
      events,
      ringGalas: [...ringScale.order],
      hasStandards: allStandards.length > 0,
      // Suppressed once every gala ON THIS WHEEL is pinned to a tour date — a
      // birthday changes none of its cuts then. Galas absent from the wheel are
      // irrelevant to this note.
      agedUpAt: ringScale.order.every(
        (code) => profileGalas.find((g) => g.code === code)?.tourDate,
      )
        ? null
        : recentBirthday(swimmer.dob, today),
      tourDates: tourDatesByGala(profileGalas),
    };
  },
});

// ---------------------------------------------------------------------------
// getSeasonImprovement — rank swimmers by time dropped this season (BRD §5.12)
// ---------------------------------------------------------------------------
//
// "Who is responding to training." Two modes over MEET times only (§4.6):
//   • event   — pick one (distance, stroke, course); rank swimmers by the drop
//               between their FIRST in-season meet time and their fastest
//               in-season meet time in that exact event. Course is REQUIRED and
//               never mixed (§4.2).
//   • overall — rank swimmers by their AVERAGE % improvement across every event
//               they raced this season (each course counted as its own event).
//
// The season window is the coach's `seasonStart` app-setting, resolved here: an
// explicit value if the caller passes one, else the stored setting, else the
// default rolling 12-month window. The effective start is returned so the screen
// can label it and re-compute reactively when the coach changes it. A swimmer
// with a single in-season point can't have a drop measured → `insufficient`,
// never 0% (§5.12). All the judgement is the pure `computeSeasonImprovements` /
// `computeOverallImprovement`; here we only load, scope, and shape. Coach-only
// (viewers have no season ranking, §5.9). Bounded reads throughout.

const SEASON_EVENT_RESULTS_LIMIT = 8000;
const SEASON_ALL_RESULTS_LIMIT = 20000;
const SEASON_SWIMMERS_LIMIT = 1000;

const seasonEventDetail = v.object({
  distance,
  stroke,
  course,
  label: v.string(),
});

// One ranked swimmer. Fields split by mode: `event` carries a single event's
// drop; `overall` carries the cross-event average. The unused block is null.
const seasonRow = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  gender,
  age: v.number(),
  active: v.boolean(),
  insufficient: v.boolean(), // single in-season point (event) / no measurable event (overall)
  // Event mode (null in overall mode):
  event: v.union(
    v.object({
      count: v.number(),
      firstMs: v.number(),
      firstDate: v.string(),
      currentMs: v.number(),
      currentDate: v.string(),
      improvedMs: v.union(v.number(), v.null()),
      improvedPct: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  // Overall mode (null in event mode):
  overall: v.union(
    v.object({
      eventsInSeason: v.number(),
      eventsMeasured: v.number(),
      avgImprovedPct: v.union(v.number(), v.null()),
      totalImprovedMs: v.union(v.number(), v.null()),
      bestLabel: v.union(v.string(), v.null()),
      bestImprovedPct: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
});

export const getSeasonImprovement = query({
  args: {
    mode: v.union(v.literal("event"), v.literal("overall")),
    distance: v.optional(distance),
    stroke: v.optional(stroke),
    course: v.optional(course),
    // Explicit override; when omitted the stored setting (or rolling default) wins.
    seasonStart: v.optional(v.string()),
  },
  returns: v.object({
    mode: v.union(v.literal("event"), v.literal("overall")),
    seasonStart: v.string(), // the EFFECTIVE window start actually used
    source: v.union(
      v.literal("explicit"),
      v.literal("custom"),
      v.literal("rolling"),
    ),
    event: v.union(seasonEventDetail, v.null()), // event mode only
    rows: v.array(seasonRow),
  }),
  handler: async (ctx, args) => {
    // Role-scoped. Staff rank the whole roster; a viewer ranks only their linked
    // swimmer(s). accessibleSwimmerIds returns "ALL" for staff.
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    const accessible = swimmerIds === "ALL" ? null : new Set(swimmerIds);

    // Resolve the season window: an explicit arg wins, then the stored setting,
    // then the rolling 12-month default. The effective start drives everything.
    const today = new Date().toISOString().slice(0, 10);
    let seasonStart: string;
    let source: "explicit" | "custom" | "rolling";
    if (args.seasonStart !== undefined) {
      seasonStart = args.seasonStart;
      source = "explicit";
    } else {
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "app"))
        .unique();
      if (settings?.seasonStart) {
        seasonStart = settings.seasonStart;
        source = "custom";
      } else {
        seasonStart = rollingSeasonStart(today);
        source = "rolling";
      }
    }

    // Load each swimmer's identity once, on demand, memoised across rows.
    const swimmerCache = new Map<
      Id<"swimmers">,
      { name: string; gender: "M" | "F"; age: number; active: boolean } | null
    >();
    async function loadSwimmer(id: Id<"swimmers">) {
      if (swimmerCache.has(id)) return swimmerCache.get(id)!;
      const s = await ctx.db.get(id);
      const shaped = s
        ? {
            name: s.name,
            gender: s.gender,
            age: computeAge(s.dob, today),
            active: s.active,
          }
        : null;
      swimmerCache.set(id, shaped);
      return shaped;
    }

    // -----------------------------------------------------------------------
    // Event mode — one (distance, stroke, course); drop per swimmer.
    // -----------------------------------------------------------------------
    if (args.mode === "event") {
      // Without a complete event selection there is nothing to rank yet.
      if (
        args.distance === undefined ||
        args.stroke === undefined ||
        args.course === undefined
      ) {
        return { mode: "event" as const, seasonStart, source, event: null, rows: [] };
      }

      const results = await ctx.db
        .query("results")
        .withIndex("by_event_global", (q) =>
          q
            .eq("distance", args.distance!)
            .eq("stroke", args.stroke!)
            .eq("course", args.course!),
        )
        .take(SEASON_EVENT_RESULTS_LIMIT);

      // Group this event's swims by swimmer for the pure derivation.
      const bySwimmer = new Map<Id<"swimmers">, SeasonSwim[]>();
      for (const r of results) {
        const arr = bySwimmer.get(r.swimmerId);
        const swim: SeasonSwim = {
          distance: r.distance,
          stroke: r.stroke,
          course: r.course,
          timeMs: r.timeMs,
          swimType: r.swimType,
          swimDate: r.swimDate,
        };
        if (arr) arr.push(swim);
        else bySwimmer.set(r.swimmerId, [swim]);
      }

      const rows = [];
      for (const [swimmerId, swims] of bySwimmer) {
        if (accessible && !accessible.has(swimmerId)) continue; // viewer scope
        const improvements = computeSeasonImprovements(swims, seasonStart);
        // Exactly one group (one event×course) — or none, if no in-season meet.
        const imp = improvements[0];
        if (!imp) continue; // no in-season meet time for this event → not ranked
        const swimmer = await loadSwimmer(swimmerId);
        if (!swimmer) continue; // orphaned results → skip

        rows.push({
          swimmerId,
          name: swimmer.name,
          gender: swimmer.gender,
          age: swimmer.age,
          active: swimmer.active,
          insufficient: imp.insufficient,
          event: {
            count: imp.count,
            firstMs: imp.firstMs,
            firstDate: imp.firstDate,
            currentMs: imp.currentMs,
            currentDate: imp.currentDate,
            improvedMs: imp.improvedMs,
            improvedPct: imp.improvedPct,
          },
          overall: null,
        });
      }

      sortSeasonRows(rows, (r) => r.event?.improvedPct ?? null);

      return {
        mode: "event" as const,
        seasonStart,
        source,
        event: {
          distance: args.distance,
          stroke: args.stroke,
          course: args.course,
          label: eventLabel(args.distance, args.stroke),
        },
        rows,
      };
    }

    // -----------------------------------------------------------------------
    // Overall mode — average % improvement across every event this season.
    // -----------------------------------------------------------------------
    // Scan just the in-season slice via the date index, then group by swimmer.
    const results = await ctx.db
      .query("results")
      .withIndex("by_date", (q) => q.gte("swimDate", seasonStart))
      .take(SEASON_ALL_RESULTS_LIMIT);

    const bySwimmer = new Map<Id<"swimmers">, SeasonSwim[]>();
    for (const r of results) {
      if (r.swimType !== "MEET") continue; // MEET only (§4.6)
      const arr = bySwimmer.get(r.swimmerId);
      const swim: SeasonSwim = {
        distance: r.distance,
        stroke: r.stroke,
        course: r.course,
        timeMs: r.timeMs,
        swimType: r.swimType,
        swimDate: r.swimDate,
      };
      if (arr) arr.push(swim);
      else bySwimmer.set(r.swimmerId, [swim]);
    }

    const rows = [];
    let processed = 0;
    for (const [swimmerId, swims] of bySwimmer) {
      if (accessible && !accessible.has(swimmerId)) continue; // viewer scope
      if (processed >= SEASON_SWIMMERS_LIMIT) break;
      processed += 1;

      const improvements = computeSeasonImprovements(swims, seasonStart);
      if (improvements.length === 0) continue; // no in-season meet at all → not ranked
      const overall = computeOverallImprovement(improvements);
      const swimmer = await loadSwimmer(swimmerId);
      if (!swimmer) continue;

      rows.push({
        swimmerId,
        name: swimmer.name,
        gender: swimmer.gender,
        age: swimmer.age,
        active: swimmer.active,
        insufficient: overall.insufficient,
        event: null,
        overall: {
          eventsInSeason: overall.eventsInSeason,
          eventsMeasured: overall.eventsMeasured,
          avgImprovedPct: overall.avgImprovedPct,
          totalImprovedMs: overall.totalImprovedMs,
          // Course kept in the label — SCM/LCM are separate events (§4.2), so a
          // bare "100 Free" would be ambiguous about which one led the average.
          bestLabel: overall.best
            ? `${overall.best.label} ${overall.best.course}`
            : null,
          bestImprovedPct: overall.best?.improvedPct ?? null,
        },
      });
    }

    sortSeasonRows(rows, (r) => r.overall?.avgImprovedPct ?? null);

    return { mode: "overall" as const, seasonStart, source, event: null, rows };
  },
});

// Rank by improvement DESCENDING (biggest drop first). Insufficient-data
// swimmers always sink below everyone with a real figure; ties (and the
// insufficient group) break by name for a stable order.
function sortSeasonRows<T extends { name: string; insufficient: boolean }>(
  rows: T[],
  pct: (row: T) => number | null,
): void {
  rows.sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    const pa = pct(a);
    const pb = pct(b);
    if (pa !== null && pb !== null && pa !== pb) return pb - pa;
    return a.name.localeCompare(b.name);
  });
}
