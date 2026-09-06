import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  computeAge,
  fastestMeetSwim,
  galaResolutionAges,
  highestGalaMet,
  isValidEvent,
  parseTime,
  pickApplicableStandardsPerGala,
  type Course,
  type GalaCode,
} from "../lib/swim";
import { loadGalas, toGalaRefs } from "./galas";

/*
  The rules every result write obeys, wherever it is written from.

  There are now two doors into `results`: the log form, and typing a time on a
  meet's sign-up sheet. They must not be two sets of rules. A time entered
  poolside on the meet sheet has to be parsed the same way, bounded the same
  way, dated the same way and judged a PB the same way as one typed on /log —
  otherwise the same swim means two different things depending on which screen
  the coach happened to be on.

  So the validation and the "what did this swim MEAN" derivation live here, and
  both callers go through them. Ctx-bound, no registered functions — the same
  shape as `attendanceShared.ts`.
*/

// A time above an hour is not a real pool swim (the slowest 1500 is well under
// half that). Bound defensively so a fat-fingered entry fails loudly.
const MAX_TIME_MS = 3_600_000;

/** How many of a swimmer's swims on one event are read to judge a PB. */
const EVENT_HISTORY_LIMIT = 1000;

/** parseTime + range guard. Throws a clear message the form surfaces inline. */
export function parseTimeBounded(input: string): number {
  const ms = parseTime(input); // throws on anything ambiguous / out of range
  if (ms > MAX_TIME_MS) {
    throw new ConvexError("That time looks too long — check the minutes.");
  }
  return ms;
}

/** A swim date must be a real ISO day, on or after the swimmer's DOB, not future. */
export function cleanSwimDate(input: string, dob: string): string {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ConvexError("Swim date must be YYYY-MM-DD.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new ConvexError("That is not a real date.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (trimmed > today) {
    throw new ConvexError("Swim date cannot be in the future.");
  }
  if (computeAge(dob, trimmed) < 0) {
    throw new ConvexError("Swim date is before the swimmer's date of birth.");
  }
  return trimmed;
}

/** Assert (distance, stroke, course) is on the active whitelist (§4.3). */
export async function assertValidEvent(
  ctx: QueryCtx | MutationCtx,
  d: number,
  s: string,
  c: string,
): Promise<void> {
  const events = await ctx.db.query("events").take(200);
  if (!isValidEvent(d, s, c, events)) {
    throw new ConvexError(`${d} ${s} is not a valid ${c} event.`);
  }
}

/** What a swim meant, once it is known to be valid. */
export type MeetSwimMeaning = {
  /** Beat every previous MEET swim on this event and course (§4.6). */
  newPb: boolean;
  /**
   * The hardest gala this time meets that the previous best did not — the one
   * moment worth naming over "time saved". Null when nothing changed.
   */
  newlyMetGala: GalaCode | null;
};

/**
 * Judge a MEET swim against the swimmer's history: is it a personal best, and
 * does it newly reach a qualifying cut?
 *
 * `excludeResultId` skips one row, so re-typing a time on an entry compares the
 * new time against everything EXCEPT the row it is replacing — otherwise a swim
 * would be measured against itself and could never be an improvement.
 *
 * Non-MEET swims are answered without a read: a trial or a practice never sets
 * a headline PB, so it can never newly meet a cut either.
 */
export async function describeMeetSwim(
  ctx: QueryCtx | MutationCtx,
  args: {
    swimmer: Doc<"swimmers">;
    distance: number;
    stroke: string;
    course: string;
    timeMs: number;
    swimType: string;
    excludeResultId?: Doc<"results">["_id"];
  },
): Promise<MeetSwimMeaning> {
  if (args.swimType !== "MEET") return { newPb: false, newlyMetGala: null };

  const siblings = (
    await ctx.db
      .query("results")
      .withIndex("by_event", (q) =>
        q
          .eq("swimmerId", args.swimmer._id)
          .eq("distance", args.distance as Doc<"results">["distance"])
          .eq("stroke", args.stroke as Doc<"results">["stroke"])
          .eq("course", args.course as Doc<"results">["course"]),
      )
      .take(EVENT_HISTORY_LIMIT)
  ).filter((r) => r._id !== args.excludeResultId);

  const prevBestMs = fastestMeetSwim(siblings)?.timeMs ?? null;
  const newPb = prevBestMs === null || args.timeMs < prevBestMs;
  if (!newPb) return { newPb: false, newlyMetGala: null };

  // A new PB in EITHER course may be the first time a qualifying cut is met.
  // Both courses are valid for entry (§4.2), so a short-course PB earns the
  // celebration too — but only against a short-course cut. Judged at the age
  // the swimmer is FOR THE COMPETITION (tour date, else current age), the same
  // rule the qualification screens use, so this never claims a cut those
  // screens won't show.
  const course = args.course as Course;
  const galas = await loadGalas(ctx);
  const galaRefs = toGalaRefs(galas);
  const codeById = new Map(galas.map((g) => [g._id, g.code as GalaCode]));
  const rows = await ctx.db
    .query("standards")
    .withIndex("by_event", (q) =>
      q
        .eq("gender", args.swimmer.gender)
        .eq("distance", args.distance as Doc<"standards">["distance"])
        .eq("stroke", args.stroke as Doc<"standards">["stroke"]),
    )
    .take(1000);

  const ageToday = computeAge(
    args.swimmer.dob,
    new Date().toISOString().slice(0, 10),
  );
  // Only THIS course's cuts — a long-course time never earns a celebration for
  // beating a short-course standard.
  const cuts = pickApplicableStandardsPerGala(
    rows.flatMap((r) => {
      if (r.galaId === undefined || r.course !== course) return [];
      const gala = codeById.get(r.galaId);
      return gala === undefined ? [] : [{ ...r, gala, age: r.age ?? null }];
    }),
    galaRefs,
    galaResolutionAges(args.swimmer.dob, ageToday, galaRefs),
  );
  const byCourse = course === "LCM" ? { LCM: cuts, SCM: {} } : { LCM: {}, SCM: cuts };

  const galaNow =
    highestGalaMet({ [course]: args.timeMs }, byCourse, course)?.gala ?? null;
  const galaBefore =
    prevBestMs === null
      ? null
      : highestGalaMet({ [course]: prevBestMs }, byCourse, course)?.gala ?? null;

  return {
    newPb: true,
    newlyMetGala: galaNow !== null && galaNow !== galaBefore ? galaNow : null,
  };
}
