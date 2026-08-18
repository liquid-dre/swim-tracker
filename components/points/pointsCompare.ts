import { seriesColor } from "@/components/analysis/chartTheme";
import { scoreableEvents, type ScoredEvent } from "@/lib/points";
import {
  DISTANCE_ORDER,
  eventLabel,
  STROKE_LABEL,
  STROKE_ORDER,
  type Course,
  type Distance,
  type Stroke,
} from "@/lib/swim";

/*
  Pivoting several swimmers' scored boards into the grouped bar chart's shape.

  The comparison pins one half of an event and varies the other: pick 50m and
  read across the strokes, or pick Freestyle and read across the distances. So
  a "category" is a stroke in one mode and a distance in the other, and the
  chart is the same either way.

  Pure, so the parts that could be visibly wrong — which categories exist, what
  order swimmers sit in, and whether an unraced event reads as a gap or a zero —
  are testable on node, leaving the component to do scale lookups and rendering.
*/

/** Which half of the event is pinned. The other becomes the x-axis. */
export type CompareMode = "DISTANCE" | "STROKE";

export type CompareCategory = {
  /** Band key for the x-axis. */
  key: string;
  /** What the axis prints: "Free" in distance mode, "200m" in stroke mode. */
  label: string;
  distance: Distance;
  stroke: Stroke;
};

export type CompareSeries = {
  /**
   * Positional (`s0`, `s1`, …), never the swimmer's name: this becomes an
   * object key AND bklit's `dataKey` string, and a name can contain anything.
   * bklit also derives a bar's position within the band from the INDEX of its
   * dataKey among the chart's children, so two swimmers must never share one.
   */
  dataKey: string;
  swimmerId: string;
  name: string;
  color: string;
};

/** One x-axis band: the category, plus a key per swimmer who scored there. */
export type CompareRow = Record<string, unknown> & {
  category: string;
  label: string;
};

/** One swimmer's scored board, as `getPointsComparison` returns it. */
export type CompareSwimmer = {
  swimmerId: string;
  name: string;
  events: ScoredEvent[];
};

/**
 * The x-axis for one selection.
 *
 * Built from `scoreableEvents`, so a category only exists where World Aquatics
 * publishes a base time — no empty "100 IM" band on a long-course chart, and
 * nothing for 25m at all.
 *
 * Freestyle-only distances (800m, 1500m) legitimately return a single category.
 * That is still a real comparison — it is that event's leaderboard in points —
 * so it is drawn rather than suppressed.
 */
export function compareCategories(
  mode: CompareMode,
  key: Distance | Stroke,
  course: Course | string,
): CompareCategory[] {
  const events = scoreableEvents(course);

  const matching =
    mode === "DISTANCE"
      ? events.filter((e) => e.distance === key)
      : events.filter((e) => e.stroke === key);

  return matching.map((e) => ({
    key: `${e.distance}|${e.stroke}`,
    label: mode === "DISTANCE" ? STROKE_LABEL[e.stroke] : `${e.distance}m`,
    distance: e.distance,
    stroke: e.stroke,
  }));
}

/**
 * The selectable values for each mode, in canonical order.
 *
 * Every distance and every stroke that can be scored is offered, including the
 * ones that yield a single category — the app's convention is to disable what
 * the whitelist forbids, not to hide what happens to be thin.
 */
export function compareOptions(
  mode: CompareMode,
  course: Course | string,
): Array<{ value: string; label: string }> {
  const events = scoreableEvents(course);

  if (mode === "DISTANCE") {
    const present = new Set(events.map((e) => e.distance));
    return DISTANCE_ORDER.filter((d) => present.has(d)).map((d) => ({
      value: String(d),
      label: `${d}m`,
    }));
  }

  const present = new Set(events.map((e) => e.stroke));
  return STROKE_ORDER.filter((s) => present.has(s)).map((s) => ({
    value: s,
    label: STROKE_LABEL[s],
  }));
}

/**
 * One series per swimmer, in the order they were selected.
 *
 * The index drives BOTH the colour and the bar's slot inside every group, so
 * this order is what keeps a swimmer the same colour in the same position
 * across every category. It must never be re-sorted by score.
 */
export function compareSeries(
  swimmers: ReadonlyArray<CompareSwimmer>,
): CompareSeries[] {
  return swimmers.map((s, i) => ({
    dataKey: `s${i}`,
    swimmerId: s.swimmerId,
    name: s.name,
    color: seriesColor(i),
  }));
}

/**
 * Chart rows: one per category, carrying each swimmer's points for it.
 *
 * A swimmer with no meet PB for a category gets NO KEY on that row — never a
 * zero. bklit's `Bar` skips a non-numeric value and leaves the slot empty, so
 * the gap sits in that swimmer's own position and everyone else keeps theirs.
 * "Has not raced the 50 Fly" and "is very slow at the 50 Fly" are different
 * facts, and a bar at the baseline says the second when it means the first.
 */
export function compareRows(
  swimmers: ReadonlyArray<CompareSwimmer>,
  mode: CompareMode,
  key: Distance | Stroke,
  course: Course | string,
): CompareRow[] {
  const categories = compareCategories(mode, key, course);
  const series = compareSeries(swimmers);

  return categories.map((c) => {
    const row: CompareRow = { category: c.key, label: c.label };
    swimmers.forEach((s, i) => {
      const scored = s.events.find(
        (e) => e.distance === c.distance && e.stroke === c.stroke,
      );
      if (scored) row[series[i].dataKey] = scored.points;
    });
    return row;
  });
}

/** Row lookup for the tooltip and the accessible table, keyed like the rows. */
export function compareLookup(
  swimmers: ReadonlyArray<CompareSwimmer>,
  mode: CompareMode,
  key: Distance | Stroke,
  course: Course | string,
): Map<string, Map<string, ScoredEvent>> {
  const categories = compareCategories(mode, key, course);
  const series = compareSeries(swimmers);
  const out = new Map<string, Map<string, ScoredEvent>>();

  for (const c of categories) {
    const byKey = new Map<string, ScoredEvent>();
    swimmers.forEach((s, i) => {
      const scored = s.events.find(
        (e) => e.distance === c.distance && e.stroke === c.stroke,
      );
      if (scored) byKey.set(series[i].dataKey, scored);
    });
    out.set(c.key, byKey);
  }

  return out;
}

/**
 * Who is missing what, for the caption under the chart.
 *
 * A hole in a bar group only reads as "not raced" once something says so —
 * the same reason the stroke radar names its open spokes in words.
 */
export function compareGaps(
  swimmers: ReadonlyArray<CompareSwimmer>,
  mode: CompareMode,
  key: Distance | Stroke,
  course: Course | string,
): Array<{ name: string; missing: string[] }> {
  const categories = compareCategories(mode, key, course);

  return swimmers
    .map((s) => ({
      name: s.name,
      missing: categories
        .filter(
          (c) =>
            !s.events.some(
              (e) => e.distance === c.distance && e.stroke === c.stroke,
            ),
        )
        .map((c) => eventLabel(c.distance, c.stroke)),
    }))
    .filter((g) => g.missing.length > 0);
}

/** Every points value on the chart, for the axis domain. */
export function compareValues(rows: ReadonlyArray<CompareRow>): number[] {
  const out: number[] = [];
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "category" || k === "label") continue;
      if (typeof v === "number") out.push(v);
    }
  }
  return out;
}
