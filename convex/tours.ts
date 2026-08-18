import { v } from "convex/values";
import { query } from "./_generated/server";
import { accessibleSwimmerIds } from "./authz";
import { galaCodeValidator, loadGalas, toGalaRefs } from "./galas";
import {
  computeAge,
  computePersonalBests,
  eventLabel,
  eventSortKey,
  galaCoversEvent,
  resolveGalaCut,
  GALA_ORDER,
  type Course,
  type GalaCode,
  type ResultForPB,
  type StandardCut,
} from "../lib/swim";

// ---------------------------------------------------------------------------
// getTourQualification — who is going to which gala (role-scoped)
// ---------------------------------------------------------------------------
//
// The forward-looking counterpart to the status matrix: for each gala (hardest
// first), the swimmers whose headline MEET PBs meet at least one of that gala's
// cuts, each listed ONLY under the highest gala they qualify for.
//
// EITHER COURSE QUALIFIES (§4.2): every gala publishes separate long- and
// short-course standards and both are valid for entry, so a swimmer is in if
// their LCM PB beats the LCM cut OR their SCM PB beats the SCM cut. A PB is
// never measured against the other course's cut.
//
// Cuts resolve per the tour rule: age ON TOUR DAY when the gala has a date, else
// the swimmer's age today (§4.9) — never the age the PB was swum, so a time that
// only beat an easier younger cut never lists them here. Meet times only.
// A gala's entry window is honoured, so a swimmer outside it is never listed.
//
// Role-scoped like the status matrix: staff see the active roster, a viewer sees
// ONLY their linked swimmer(s) — enforced server-side, never trusted to the client.

const QUAL_SWIMMERS_LIMIT = 500;
const QUAL_STANDARDS_LIMIT = 5000;
const QUAL_RESULTS_LIMIT = 2000;

const courseValidator = v.union(v.literal("SCM"), v.literal("LCM"));

const qualifyingEvent = v.object({
  label: v.string(),
  course: courseValidator, // the course this qualification was earned in
  pbMs: v.number(),
  cutMs: v.number(),
  marginMs: v.number(), // cut − PB, ≥ 0: how far inside the cut the PB sits
});

const qualifiedSwimmer = v.object({
  swimmerId: v.id("swimmers"),
  name: v.string(),
  // Age on tour day when this gala has a date; today's age otherwise.
  age: v.number(),
  events: v.array(qualifyingEvent),
});

export const getTourQualification = query({
  args: {},
  returns: v.object({
    hasStandards: v.boolean(),
    hasSwimmers: v.boolean(),
    galas: v.array(
      v.object({
        gala: galaCodeValidator,
        displayName: v.string(),
        tour: v.union(
          v.null(),
          v.object({ name: v.union(v.string(), v.null()), date: v.string() }),
        ),
        swimmers: v.array(qualifiedSwimmer),
      }),
    ),
  }),
  handler: async (ctx) => {
    // Staff → the active roster; a viewer → only their linked swimmer(s).
    const { swimmerIds } = await accessibleSwimmerIds(ctx);

    const galas = await loadGalas(ctx);
    const galaRefs = toGalaRefs(galas);
    const refByCode = new Map(galaRefs.map((g) => [g.code, g]));
    const galaByCode = new Map(galas.map((g) => [g.code as GalaCode, g]));
    const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));

    // Cuts grouped by event, each tagged with its gala and course so a PB is
    // only ever compared against a cut of the SAME course.
    const allStandards = await ctx.db
      .query("standards")
      .take(QUAL_STANDARDS_LIMIT);
    const cutsByEvent = new Map<
      string,
      Array<StandardCut & { gala: GalaCode; course: Course }>
    >();
    for (const s of allStandards) {
      if (s.galaId === undefined || s.course === undefined) continue; // pre-migration
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

    // Staff: the active roster — "who's going" is a question about current
    // swimmers. Viewer: their linked swimmer(s), matching the status matrix
    // (active or not — a parent should still see their own child).
    let swimmers;
    if (swimmerIds === "ALL") {
      swimmers = await ctx.db
        .query("swimmers")
        .withIndex("by_active", (q) => q.eq("active", true))
        .take(QUAL_SWIMMERS_LIMIT);
    } else {
      const loaded = await Promise.all(swimmerIds.map((id) => ctx.db.get(id)));
      swimmers = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
    }
    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    const today = new Date().toISOString().slice(0, 10);
    const byGala = new Map<
      GalaCode,
      Array<{
        swimmerId: typeof swimmers[number]["_id"];
        name: string;
        age: number;
        events: Array<{
          label: string;
          course: Course;
          pbMs: number;
          cutMs: number;
          marginMs: number;
        }>;
      }>
    >(GALA_ORDER.map((code) => [code, []]));

    for (const swimmer of swimmers) {
      const results = await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(QUAL_RESULTS_LIMIT);
      const pbs = computePersonalBests(results as ResultForPB[]);
      const headlinePbs = pbs.filter((pb) => pb.headline);
      if (headlinePbs.length === 0) continue;

      const ageToday = computeAge(swimmer.dob, today);

      // Highest gala only: walk hardest → easiest and stop at the first gala
      // with at least one qualifying event, in either course.
      for (const code of GALA_ORDER) {
        const ref = refByCode.get(code);
        const gala = galaByCode.get(code);
        if (ref === undefined || gala === undefined) continue;

        // The cut the swimmer must meet FOR THIS TOUR: tour-day age when a date
        // is set, else their age today — never the age the PB was swum.
        const cutAge =
          ref.tourDate != null ? computeAge(swimmer.dob, ref.tourDate) : ageToday;

        const qualifying: Array<{
          sortKey: number;
          label: string;
          course: Course;
          pbMs: number;
          cutMs: number;
          marginMs: number;
        }> = [];
        for (const pb of headlinePbs) {
          if (!galaCoversEvent(gala, pb.distance, pb.stroke)) continue;
          const headline = pb.headline!;
          const course = pb.course as Course;
          const cutMs = resolveGalaCut(
            ref,
            (cutsByEvent.get(`${swimmer.gender}|${pb.distance}|${pb.stroke}`) ?? [])
              .filter((r) => r.gala === code && r.course === course),
            cutAge,
          );
          if (cutMs === null || headline.timeMs > cutMs) continue;
          qualifying.push({
            sortKey: eventSortKey(pb.distance, pb.stroke),
            label: eventLabel(pb.distance, pb.stroke),
            course,
            pbMs: headline.timeMs,
            cutMs,
            marginMs: cutMs - headline.timeMs,
          });
        }

        if (qualifying.length > 0) {
          // Event order, then LCM before SCM when the same event qualifies twice.
          qualifying.sort(
            (a, b) => a.sortKey - b.sortKey || a.course.localeCompare(b.course),
          );
          byGala.get(code)!.push({
            swimmerId: swimmer._id,
            name: swimmer.name,
            age: cutAge,
            events: qualifying.map((e) => ({
              label: e.label,
              course: e.course,
              pbMs: e.pbMs,
              cutMs: e.cutMs,
              marginMs: e.marginMs,
            })),
          });
          break; // highest gala only
        }
      }
    }

    return {
      hasStandards: allStandards.length > 0,
      hasSwimmers: swimmers.length > 0,
      galas: GALA_ORDER.flatMap((code) => {
        const gala = galaByCode.get(code);
        if (gala === undefined) return [];
        return [
          {
            gala: code,
            displayName: gala.displayName,
            tour: gala.tourDate
              ? { name: gala.tourName ?? null, date: gala.tourDate }
              : null,
            swimmers: byGala.get(code) ?? [],
          },
        ];
      }),
    };
  },
});
