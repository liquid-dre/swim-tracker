import {
  DISTANCE_ORDER,
  eventLabel,
  eventSortKey,
  STROKE_ORDER,
  type Course,
  type Distance,
  type EventPB,
  type ResultForPB,
  type Stroke,
} from "./swim";

/*
  World Aquatics points — the app's one cross-event yardstick.

  Seconds are incommensurable across events: a 200 breaststroke and a 50
  freestyle cannot be ranked against each other, so "what is this swimmer good
  at" has no answer in raw time. World Aquatics points fix that by scoring every
  swim against a published BASE TIME for its (course, sex, event):

      points = floor(1000 × (baseMs / timeMs)³)

  1000 points is the base time itself — the world-record standard. The cube is
  what makes the scale comparable: it is calibrated so that equally-difficult
  performances in different events land on the same number.

  ── The truncation rule ────────────────────────────────────────────────────
  The result is TRUNCATED, not rounded. That is World Aquatics' stated rule and
  what meet-management software implements, so a coach cross-checking a number
  against a published table or another system sees the same figure.

  Recomputing all 26,918 cells of the 2025 long-course tables from the base
  times below reproduces ~95% of them exactly. The rest differ by exactly 1
  point, never more, and always because the published table PRINTS its times
  rounded to 0.01s while computing them at full precision — every discrepancy
  sits within 0.07 points of the integer. So a table lookup can legitimately
  read one point off what this module returns; the module is not wrong.

  ── Why one current table, for every swim ──────────────────────────────────
  World Aquatics reissues base times annually. This module deliberately scores
  EVERY swim, however old, against the current table, so points are a pure
  function of (time, event, course, sex). Scoring each swim against its own
  year's table would mean that every January the whole squad's history is
  re-measured with a different ruler, and a swimmer's trend line would drop
  without them ever swimming slower. Comparability over time is worth more here
  than agreeing with what a 2019 meet programme printed.

  ── Course is never crossed ────────────────────────────────────────────────
  Base times are published per course and a swim is only ever scored against its
  OWN course's table, exactly as qualifying cuts are (§4.2). There is no
  interpolation and no borrowing: an event with no base time for its course
  returns null, never a guess and never a zero.
*/

/** The validity year of the base times below. World Aquatics reissues annually. */
export const POINTS_BASE_YEAR = 2025;

/**
 * The top of the points scale, and the fixed axis maximum for every points
 * chart. A swim faster than the base time scores above 1000; that is a world
 * record and not something the charts need to accommodate.
 */
export const POINTS_SCALE_MAX = 1000;

type EventTimes = Partial<Record<string, number>>;

/** Key for the base-time table: `${distance}:${stroke}`. */
function baseKey(distance: Distance | number, stroke: Stroke | string): string {
  return `${distance}:${stroke}`;
}

/*
  Base times = the 1000-point row of the published tables, in integer ms.

  Source: "World Aquatics Point Scoring 2025", Individual — Long Course (50m),
  Men's and Women's tables, validity 01/01/2025 – 31/12/2025.

  SCM IS DELIBERATELY ABSENT. World Aquatics publishes a separate short-course
  table and it has not been supplied yet. Scoring short-course swims against
  these long-course numbers would inflate every one of them (a 100 free is
  roughly two seconds quicker in a 25m pool) and would be exactly the
  cross-course merge the domain forbids. Until the short-course tables land,
  `baseTimeMs` returns null for SCM and every caller renders "no points"
  rather than a wrong number. Adding them is an edit to this object alone.
*/
const BASE_TIMES_MS: Partial<Record<Course, Record<"M" | "F", EventTimes>>> = {
  LCM: {
    M: {
      "50:FREE": 20910,
      "100:FREE": 46400,
      "200:FREE": 102000,
      "400:FREE": 220070,
      "800:FREE": 452120,
      "1500:FREE": 870670,
      "50:BACK": 23550,
      "100:BACK": 51600,
      "200:BACK": 111920,
      "50:BREAST": 25950,
      "100:BREAST": 56880,
      "200:BREAST": 125480,
      "50:FLY": 22270,
      "100:FLY": 49450,
      "200:FLY": 110340,
      "200:IM": 114000,
      "400:IM": 242500,
    },
    F: {
      "50:FREE": 23610,
      "100:FREE": 51710,
      "200:FREE": 112230,
      "400:FREE": 235380,
      "800:FREE": 484790,
      "1500:FREE": 920480,
      "50:BACK": 26860,
      "100:BACK": 57130,
      "200:BACK": 123140,
      "50:BREAST": 29160,
      "100:BREAST": 64130,
      "200:BREAST": 137550,
      "50:FLY": 24430,
      "100:FLY": 55180,
      "200:FLY": 121810,
      "200:IM": 126120,
      "400:IM": 264380,
    },
  },
  // SCM: awaiting the World Aquatics short-course tables.
};

/**
 * The published base time for one (event, course, sex), or null when World
 * Aquatics publishes none — 25m distances, 100 IM long course, and (for now)
 * every short-course event.
 */
export function baseTimeMs(
  distance: Distance | number,
  stroke: Stroke | string,
  course: Course | string,
  gender: "M" | "F",
): number | null {
  const byGender = BASE_TIMES_MS[course as Course];
  if (byGender === undefined) return null;
  return byGender[gender][baseKey(distance, stroke)] ?? null;
}

/** Whether points can be scored at all in this course — drives the UI's copy. */
export function courseHasBaseTimes(course: Course | string): boolean {
  return BASE_TIMES_MS[course as Course] !== undefined;
}

/**
 * Score one swim.
 *
 * Returns NULL, never 0, when the event has no published base time. "Cannot be
 * scored" and "scored nothing" are different facts, and a zero on a chart says
 * the second when it means the first.
 */
export function aquaPoints(
  timeMs: number,
  distance: Distance | number,
  stroke: Stroke | string,
  course: Course | string,
  gender: "M" | "F",
): number | null {
  if (!(timeMs > 0)) return null;
  const base = baseTimeMs(distance, stroke, course, gender);
  if (base === null || !(base > 0)) return null;
  return Math.floor(1000 * (base / timeMs) ** 3);
}

/**
 * Every event this course can score, in canonical order (by distance, then by
 * the app's stroke order).
 *
 * Read off the base-time table rather than the event whitelist, because those
 * are different questions: the whitelist says what a swimmer may RACE, this says
 * what World Aquatics publishes a standard for. They diverge — no 25 m event is
 * scored at all, and 100 IM is short-course-only so it has no long-course base
 * time — and a chart that offers a category with no possible bar is a chart that
 * lies about its own axis.
 *
 * On long course this is 17 events, which gives:
 *   by distance —   50 → 4 strokes, 100 → 4, 200 → 5, 400 → 2, 800 → 1, 1500 → 1
 *   by stroke   —  Free → 6 distances, Back/Breast/Fly → 3 each, IM → 2
 *
 * Empty for a course whose base times are not loaded.
 */
export function scoreableEvents(
  course: Course | string,
): Array<{ distance: Distance; stroke: Stroke }> {
  const byGender = BASE_TIMES_MS[course as Course];
  if (byGender === undefined) return [];

  const out: Array<{ distance: Distance; stroke: Stroke }> = [];
  // Men's and women's tables cover the same events; either one is the grid.
  for (const key of Object.keys(byGender.M)) {
    const [d, stroke] = key.split(":");
    const distance = Number(d) as Distance;
    if (!DISTANCE_ORDER.includes(distance)) continue;
    if (STROKE_ORDER.indexOf(stroke as Stroke) < 0) continue;
    out.push({ distance, stroke: stroke as Stroke });
  }

  return out.sort(
    (a, b) =>
      eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke),
  );
}

/** One event's headline PB, scored. */
export type ScoredEvent = {
  distance: Distance;
  stroke: Stroke;
  course: Course;
  /** "100 Free" — from `eventLabel`, so it matches every other surface. */
  label: string;
  timeMs: number;
  points: number;
  swimDate: string;
  meetName: string | null;
};

/**
 * Score a swimmer's PB board, strongest event first.
 *
 * Only HEADLINE PBs count, so only MEET swims are ever scored — the same rule
 * as every other qualifying-facing surface. A blistering practice swim does not
 * raise a swimmer's points. Events with no base time are omitted rather than
 * scored against a guess, so the returned list is exactly what a chart can draw.
 *
 * Ties break to the shorter event, then alphabetically by label, so the bar
 * order is stable across renders rather than depending on input order.
 */
export function scoreEventPbs(
  pbs: ReadonlyArray<EventPB>,
  course: Course,
  gender: "M" | "F",
): ScoredEvent[] {
  const scored: ScoredEvent[] = [];

  for (const pb of pbs) {
    if (pb.course !== course) continue;
    if (pb.headline === null) continue;
    const points = aquaPoints(
      pb.headline.timeMs,
      pb.distance,
      pb.stroke,
      course,
      gender,
    );
    if (points === null) continue;
    scored.push({
      distance: pb.distance,
      stroke: pb.stroke,
      course: pb.course,
      label: pb.label,
      timeMs: pb.headline.timeMs,
      points,
      swimDate: pb.headline.swimDate,
      meetName: pb.headline.meetName,
    });
  }

  return scored.sort(
    (a, b) =>
      b.points - a.points ||
      a.distance - b.distance ||
      a.label.localeCompare(b.label),
  );
}

/**
 * The swimmer's headline number: the single highest-scoring meet PB.
 *
 * Deliberately NOT a sum across events — a sum rewards racing twelve events
 * over racing four of them well, so a 900-point specialist would rank below a
 * 600-point generalist. "A swimmer's World Aquatics points" means their best
 * swim everywhere else in the sport, and it means that here.
 */
export function bestPointsSwim(
  pbs: ReadonlyArray<EventPB>,
  course: Course,
  gender: "M" | "F",
): ScoredEvent | null {
  return scoreEventPbs(pbs, course, gender)[0] ?? null;
}

/** One meet, reduced to its best-scoring swim. */
export type MeetPoint = {
  /** Stable identity for the chart's x-axis: name + first date. */
  key: string;
  meetName: string | null;
  /** The earliest date in the meet — where the dot is plotted. */
  swimDate: string;
  points: number;
  /** The event that scored it, for the tooltip. */
  label: string;
  timeMs: number;
};

/**
 * How many days a single meet may span before a swim is treated as a new meet.
 * Championship galas run four or five days; a week is comfortably clear of that
 * without merging two meets of the same name a month apart.
 */
const MEET_SPAN_DAYS = 7;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return (to - from) / 86_400_000;
}

/**
 * Reduce a swimmer's meet results to one point per MEET — that meet's
 * highest-scoring swim.
 *
 * A meet runs over several days and a swimmer races several events at it, so
 * plotting every swim would be a scatter and plotting every date would show one
 * gala as four dots. Swims are grouped when they share a meet name and fall
 * within `MEET_SPAN_DAYS` of the group's first day; results with no meet name
 * group by exact date, since there is nothing else to identify them by.
 *
 * The series can fall as well as rise — that is the point. It reads as "how
 * good was this swimmer at that meet", which a running best-ever line cannot
 * say, because a bad season would look identical to no season at all.
 */
export function perMeetBest(
  results: ReadonlyArray<ResultForPB>,
  course: Course,
  gender: "M" | "F",
): MeetPoint[] {
  const meets = results
    .filter((r) => r.swimType === "MEET" && r.course === course)
    .slice()
    .sort((a, b) => a.swimDate.localeCompare(b.swimDate));

  const out: MeetPoint[] = [];
  // Keyed by meet name (or "" for anonymous) → the group still open for it.
  const open = new Map<string, MeetPoint>();

  for (const r of meets) {
    const points = aquaPoints(
      r.timeMs,
      r.distance,
      r.stroke,
      course,
      gender,
    );
    if (points === null) continue;

    const name = r.meetName ?? null;
    const groupKey = name ?? "";
    const current = open.get(groupKey);
    const sameMeet =
      current !== undefined &&
      (name === null
        ? current.swimDate === r.swimDate
        : daysBetween(current.swimDate, r.swimDate) <= MEET_SPAN_DAYS);

    if (!sameMeet) {
      const started: MeetPoint = {
        key: `${groupKey}|${r.swimDate}`,
        meetName: name,
        swimDate: r.swimDate,
        points,
        label: eventLabel(r.distance, r.stroke),
        timeMs: r.timeMs,
      };
      open.set(groupKey, started);
      out.push(started);
      continue;
    }

    if (points > current.points) {
      current.points = points;
      current.label = eventLabel(r.distance, r.stroke);
      current.timeMs = r.timeMs;
    }
  }

  return out.sort((a, b) => a.swimDate.localeCompare(b.swimDate));
}
