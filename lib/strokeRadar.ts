import { worldRecordMs, type Course, type EventPB, type Stroke } from "./swim";

/*
  The stroke-profile RADAR's metric — a swimmer's strength distribution across
  the five strokes, as a percentage of the world record.

  This is a different question from the wheel's, and deliberately a different
  scale. The wheel asks "what can this swimmer ENTER" and measures everything
  against the gala cuts they are eligible for, which is age-fair but only
  comparable between swimmers who share an entry window — ring 2 means Level 3
  for a 14-year-old and SANY for an 18-year-old. The radar asks "what is this
  swimmer GOOD at", and for that the scale has to be universal so any two
  swimmers can be laid over each other.

  Percentage of world record is that universal scale. It is age-blind, which is
  the honest trade: a 12-year-old's polygon is small everywhere, so the useful
  read is its SHAPE — where it bulges and where it dents — not its size. Own
  GENDER's record is used, so a female swimmer is measured against the female
  record and the comparison is not systematically skewed.

  Never mix courses on one radar: an SCM percentage and an LCM percentage are
  measured against different records, and averaging them onto one spoke would be
  exactly the cross-course merge the domain forbids. The course is chosen for
  the whole chart and every spoke uses it.
*/

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
   * Mean percentage of the world record across this stroke's events, or NULL
   * when the swimmer has never raced the stroke in this course.
   *
   * Null is not zero, and the chart must not draw it as zero: "never swum Fly"
   * and "very slow at Fly" are different facts, and a polygon collapsing to the
   * hub says the second when it means the first.
   */
  pct: number | null;
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
 * Aggregate a swimmer's PB board into one score per stroke, in spoke order.
 *
 * Only HEADLINE (meet) PBs count, matching every other qualifying-facing
 * surface — a practice swim never sets a rating. Events with no published world
 * record are skipped rather than scored against a guess.
 */
export function strokeRadarScores(
  pbs: ReadonlyArray<EventPB>,
  course: Course,
  gender: "M" | "F",
): RadarStrokeScore[] {
  return RADAR_STROKES.map((stroke) => {
    let sum = 0;
    let events = 0;
    let bestPct = -1;
    let bestEvent: string | null = null;

    for (const pb of pbs) {
      if (pb.stroke !== stroke || pb.course !== course) continue;
      if (pb.headline === null) continue;
      const pct = wrPercent(
        pb.headline.timeMs,
        pb.distance,
        stroke,
        course,
        gender,
      );
      if (pct === null) continue;
      sum += pct;
      events += 1;
      if (pct > bestPct) {
        bestPct = pct;
        bestEvent = pb.label;
      }
    }

    return {
      stroke,
      pct: events === 0 ? null : sum / events,
      events,
      bestEvent,
    };
  });
}
