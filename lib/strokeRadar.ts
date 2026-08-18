import { aquaPoints, courseHasBaseTimes, POINTS_SCALE_MAX } from "./points";
import { worldRecordMs, type Course, type EventPB, type Stroke } from "./swim";

/*
  The stroke-profile RADAR's metric — a swimmer's strength distribution across
  the five strokes, on a scale that is universal rather than age-relative.

  This is a different question from the wheel's, and deliberately a different
  scale. The wheel asks "what can this swimmer ENTER" and measures everything
  against the gala cuts they are eligible for, which is age-fair but only
  comparable between swimmers who share an entry window — ring 2 means Level 3
  for a 14-year-old and SANY for an 18-year-old. The radar asks "what is this
  swimmer GOOD at", and for that the scale has to be universal so any two
  swimmers can be laid over each other.

  TWO metrics can serve that, and which one is in play depends on the COURSE:

    POINTS  — World Aquatics points (0-1000), used wherever base times are
              loaded. The published, dated standard, and the same number the
              /points screen shows, so the app has one answer.
    WR_PCT  — percent of world record (0-100), the fallback for a course whose
              base times are not loaded yet (short course, today). Measured off
              the approximate table in lib/swim.ts.

  Both are per-sex and monotone in speed, but they are NOT the same scale and a
  polygon on one cannot be compared with a polygon on the other. `radarMetric`
  therefore returns the metric AND its maximum, and every caller must render
  what it is told rather than assuming a percentage — the chart's ring labels,
  its caption and its tooltip all name the active metric, so a coach switching
  course is never left guessing which yardstick is on screen.

  Both are age-blind, which is the honest trade: a 12-year-old's polygon is
  small everywhere, so the useful read is its SHAPE — where it bulges and where
  it dents — not its size.

  Never mix courses on one radar: the two courses are scored against different
  references (and, right now, by different metrics), so averaging them onto one
  spoke would be exactly the cross-course merge the domain forbids. The course
  is chosen for the whole chart and every spoke uses it.
*/

/** Which scale a radar is drawn on. Decided by the course, never assumed. */
export type RadarMetricKind = "POINTS" | "WR_PCT";

export type RadarScale = {
  metric: RadarMetricKind;
  /** Top of the scale — 1000 for points, 100 for percent of world record. */
  max: number;
};

/**
 * The metric this course is scored on.
 *
 * Points wherever World Aquatics base times are loaded; percent of world record
 * for any course still waiting on them. Deliberately a lookup rather than a
 * constant, so loading the short-course base times switches that course over
 * with no other change.
 */
export function radarMetric(course: Course | string): RadarScale {
  return courseHasBaseTimes(course)
    ? { metric: "POINTS", max: POINTS_SCALE_MAX }
    : { metric: "WR_PCT", max: 100 };
}

/** Spoke order, clockwise from the top. Fixed so polygons are comparable. */
export const RADAR_STROKES: readonly Stroke[] = [
  "FREE",
  "BACK",
  "BREAST",
  "FLY",
  "IM",
] as const;

export const STROKE_LABEL: Record<Stroke, string> = {
  FREE: "Free",
  BACK: "Back",
  BREAST: "Breast",
  FLY: "Fly",
  IM: "IM",
};

export type RadarStrokeScore = {
  stroke: Stroke;
  /**
   * Mean score across this stroke's events on the COURSE's metric (see
   * `radarMetric`), or NULL when the swimmer has never raced the stroke in this
   * course.
   *
   * Null is not zero, and the chart must not draw it as zero: "never swum Fly"
   * and "very slow at Fly" are different facts, and a polygon collapsing to the
   * hub says the second when it means the first.
   */
  value: number | null;
  /** How many events fed the mean — shown so a 1-event spoke reads as thin. */
  events: number;
  /** The event this swimmer rates highest in, for the tooltip. */
  bestEvent: string | null;
};

/**
 * Score one event: how close this time is to the world record, as a percentage.
 *
 * A SLOWER time is a BIGGER number, so the record goes on top — a swimmer level
 * with the record scores 100 and a swimmer twice as slow scores 50. Clamped at
 * 100 because the radar's rings stop there; a time faster than the listed record
 * is a data problem, not a spoke that should escape the chart.
 */
export function wrPercent(
  pbMs: number,
  distance: number,
  stroke: Stroke,
  course: Course,
  gender: "M" | "F",
): number | null {
  if (!(pbMs > 0)) return null;
  const wr = worldRecordMs(distance, stroke, course, gender);
  if (wr === null || !(wr > 0)) return null;
  return Math.min(100, (wr / pbMs) * 100);
}

/**
 * Score one event on whichever metric this course uses. Null when the event
 * cannot be scored at all, never a guess and never a zero.
 */
export function eventScore(
  pbMs: number,
  distance: number,
  stroke: Stroke,
  course: Course,
  gender: "M" | "F",
): number | null {
  return radarMetric(course).metric === "POINTS"
    ? aquaPoints(pbMs, distance, stroke, course, gender)
    : wrPercent(pbMs, distance, stroke, course, gender);
}

/**
 * Aggregate a swimmer's PB board into one score per stroke, in spoke order.
 *
 * Only HEADLINE (meet) PBs count, matching every other qualifying-facing
 * surface — a practice swim never sets a rating. Events the active metric
 * cannot score — no base time, no published world record — are skipped rather
 * than scored against a guess.
 */
export function strokeRadarScores(
  pbs: ReadonlyArray<EventPB>,
  course: Course,
  gender: "M" | "F",
): RadarStrokeScore[] {
  return RADAR_STROKES.map((stroke) => {
    let sum = 0;
    let events = 0;
    let bestScore = -1;
    let bestEvent: string | null = null;

    for (const pb of pbs) {
      if (pb.stroke !== stroke || pb.course !== course) continue;
      if (pb.headline === null) continue;
      const score = eventScore(
        pb.headline.timeMs,
        pb.distance,
        stroke,
        course,
        gender,
      );
      if (score === null) continue;
      sum += score;
      events += 1;
      if (score > bestScore) {
        bestScore = score;
        bestEvent = pb.label;
      }
    }

    return {
      stroke,
      value: events === 0 ? null : sum / events,
      events,
      bestEvent,
    };
  });
}
