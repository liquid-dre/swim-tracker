import type { SwimBar, Threshold } from "@/components/charts/swim";
import { STROKE_META } from "@/components/profile/strokeProfile";
import { POINTS_SCALE_MAX, type MeetPoint, type ScoredEvent } from "@/lib/points";
import { STROKE_ORDER, type Stroke } from "@/lib/swim";

/*
  Data shaping for the two points charts. Pure, so the parts that could be wrong
  in a visible way — bar order, the axis domain, which reference lines survive,
  how meets land on a date axis — are testable on node, and the components keep
  only scale lookups and rendering.
*/

/**
 * Reference lines across the points axis.
 *
 * Points have no natural landmarks the way a qualifying cut does, and without
 * them a young swimmer's page is a row of short bars against an empty field
 * with nothing to read them against. These three give the eye a ruler: roughly
 * a solid age-group swim, a strong provincial one, and a national-level one.
 * Deliberately unlabelled beyond the number — they are not standards and must
 * not be mistaken for cuts, which is why they use the neutral grid ink rather
 * than any tier colour.
 */
export const POINTS_REFERENCE_LINES: ReadonlyArray<number> = [400, 600, 800];

/**
 * The value axis for the points charts: fixed 0–1000 so the axis means the same
 * thing on every swimmer's page — which is the entire reason points exist.
 *
 * It only ever grows, never shrinks: a swim faster than the base time scores
 * above 1000 and must not be clipped off its own chart, so the top rounds up to
 * the next hundred in that (rare, wonderful) case.
 */
export function pointsDomain(
  values: ReadonlyArray<number>,
): [number, number] {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max <= POINTS_SCALE_MAX) return [0, POINTS_SCALE_MAX];
  return [0, Math.ceil(max / 100) * 100];
}

/** Reference lines that fall inside the drawn domain — the rest are dropped. */
export function referenceThresholds(
  domain: readonly [number, number],
  ink: string,
): Threshold[] {
  return POINTS_REFERENCE_LINES.filter(
    (value) => value > domain[0] && value < domain[1],
  ).map((value) => ({
    key: `ref-${value}`,
    value,
    color: ink,
    ink,
    dash: "3 3",
    label: String(value),
  }));
}

/**
 * One bar per scoreable event, in the order `scoreEventPbs` returned them
 * (strongest first). Coloured by STROKE — the app's existing stroke palette —
 * so the shape of a swimmer's strength reads at a glance without a second
 * encoding. Colour is never the only channel: every bar carries its own points
 * label and its event name on the category axis.
 */
export function pointsBars(events: ReadonlyArray<ScoredEvent>): SwimBar[] {
  return events.map((e) => ({
    key: eventKey(e),
    category: eventKey(e),
    value: e.points,
    fill: STROKE_META[e.stroke].color,
    label: String(e.points),
  }));
}

/** Stable band key for one event. Never the label, which can repeat. */
export function eventKey(e: {
  distance: number;
  stroke: string;
  course: string;
}): string {
  return `${e.distance}|${e.stroke}|${e.course}`;
}

/** Event label lookup for the category axis, keyed the same way as the bars. */
export function eventLabels(
  events: ReadonlyArray<ScoredEvent>,
): Map<string, string> {
  return new Map(events.map((e) => [eventKey(e), e.label]));
}

/** Row lookup for the tooltip, keyed the same way as the bars. */
export function eventsByKey(
  events: ReadonlyArray<ScoredEvent>,
): Map<string, ScoredEvent> {
  return new Map(events.map((e) => [eventKey(e), e]));
}

/**
 * The strokes actually on the chart, in the app's canonical stroke order, for
 * the legend. A stroke the swimmer has never raced is absent rather than shown
 * greyed — the legend describes this chart, not the sport.
 */
export function strokesPresent(
  events: ReadonlyArray<ScoredEvent>,
): Array<{ stroke: Stroke; label: string; color: string }> {
  const seen = new Set(events.map((e) => e.stroke));
  return STROKE_ORDER.filter((s) => seen.has(s)).map((stroke) => ({
    stroke,
    label: STROKE_META[stroke].label,
    color: STROKE_META[stroke].color,
  }));
}

/** One row of the trend chart — bklit's LineChart wants a real Date for x. */
export type TrendRow = Record<string, unknown> & {
  date: Date;
  t: number;
  /** The meet's own ISO date, carried so the tooltip never re-derives it. */
  swimDate: string;
  points: number;
  meetName: string | null;
  label: string;
  timeMs: number;
};

/**
 * Meets → chart rows, ascending by date.
 *
 * Two meets on the same day (a swimmer entered at two galas, or an unnamed
 * result alongside a named one) would collide on a time axis, so the later one
 * is nudged by a minute. That keeps both dots visible and keeps the x scale
 * strictly increasing, which bklit's line path assumes.
 */
export function trendRows(meets: ReadonlyArray<MeetPoint>): TrendRow[] {
  const rows: TrendRow[] = [];
  const used = new Set<number>();

  for (const m of [...meets].sort((a, b) => a.swimDate.localeCompare(b.swimDate))) {
    let t = Date.parse(`${m.swimDate}T00:00:00Z`);
    if (Number.isNaN(t)) continue;
    while (used.has(t)) t += 60_000;
    used.add(t);
    rows.push({
      date: new Date(t),
      t,
      swimDate: m.swimDate,
      points: m.points,
      meetName: m.meetName,
      label: m.label,
      timeMs: m.timeMs,
    });
  }

  return rows;
}
