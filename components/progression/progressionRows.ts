import type { SwimMark } from "@/components/charts/swim";

/*
  Pivot per-swimmer point lists into the one row-per-date shape bklit's LineChart
  wants.

  Recharts let each <Line> carry its own `data` array, so a group chart was N
  independent series. bklit takes ONE `data` array and each <Line> picks a
  `dataKey` out of it — the shape a shared crosshair and a single tooltip row
  need. So the series have to be merged onto a common date axis here.

  A swimmer with no swim on some other swimmer's date gets NO key for that row,
  not a zero: `SwimDots` and bklit's `Line` both skip non-numeric values, so the
  line bridges the gap instead of diving to the axis. That distinction is the
  whole reason this is a named, tested function rather than an inline map.

  Keys are positional (`s0`, `s0mark`) rather than swimmer names, because a name
  can contain anything and these become object keys and dataKey strings.
*/

/** One swim as the chart needs it, already resolved to epoch ms. */
export type RowPoint = {
  /** Epoch ms of the swim date. */
  t: number;
  timeMs: number;
  mark: SwimMark;
  /** Long-form swim type, for the tooltip. */
  swimType: "MEET" | "TIME_TRIAL" | "PRACTICE" | "SCHOOL_GALA";
  isPB: boolean;
};

/** One charted swimmer. */
export type RowSeries = {
  name: string;
  color: string;
  points: RowPoint[];
};

/** The dataKeys for one series, so callers never build these strings by hand. */
export type SeriesKeys = {
  /** Numeric value key — what `<Line dataKey>` and `<SwimDots dataKey>` read. */
  value: string;
  /** `SwimMark` key — what `<SwimDots markKey>` reads. */
  mark: string;
  name: string;
  color: string;
};

export function seriesKeys(index: number): SeriesKeys {
  return {
    value: `s${index}`,
    mark: `s${index}mark`,
    name: "",
    color: "",
  };
}

/** A chart row: the date, plus each series' value and mark where one exists. */
export type ChartRow = Record<string, unknown> & { date: Date; t: number };

export type PivotResult = {
  rows: ChartRow[];
  keys: SeriesKeys[];
};

/**
 * Merge every series onto one ascending date axis.
 *
 * `date` is a real Date because bklit's x accessor and `scaleTime` want one;
 * `t` is kept alongside it so our own overlays can stay in epoch ms.
 */
export function pivotSeries(series: ReadonlyArray<RowSeries>): PivotResult {
  const keys: SeriesKeys[] = series.map((s, i) => ({
    ...seriesKeys(i),
    name: s.name,
    color: s.color,
  }));

  const byT = new Map<number, ChartRow>();
  series.forEach((s, i) => {
    const key = keys[i];
    for (const p of s.points) {
      if (Number.isNaN(p.t)) continue;
      let row = byT.get(p.t);
      if (row === undefined) {
        row = { date: new Date(p.t), t: p.t };
        byT.set(p.t, row);
      }
      // Two swims on one date in one event: keep the FASTER, matching the PB
      // rule everywhere else in the app rather than letting insertion order
      // decide which one the chart draws.
      const existing = row[key.value];
      if (typeof existing === "number" && existing <= p.timeMs) continue;
      row[key.value] = p.timeMs;
      row[key.mark] = p.mark;
      row[`${key.value}type`] = p.swimType;
      row[`${key.value}pb`] = p.isPB;
    }
  });

  const rows = [...byT.values()].sort((a, b) => a.t - b.t);
  return { rows, keys };
}

/** Which mark a swim wears — the visual encoding, decided in one place. */
export function markFor(point: {
  swimType: RowPoint["swimType"];
  isMeet: boolean;
  isPB: boolean;
}): SwimMark {
  // School gala first: unofficial (§R15) outranks being a PB, because the mark
  // has to say "not an official time" above all else.
  if (point.swimType === "SCHOOL_GALA") return "schoolGala";
  if (point.isPB) return "pb";
  if (point.isMeet) return "meet";
  return "trial";
}

// ---------------------------------------------------------------------------
// Y-axis domain
// ---------------------------------------------------------------------------

/**
 * The y-domain for the progression chart: `[floor, top]` in ms.
 *
 * This exists as a named function, and is tested, because it is the one thing the
 * chart library actively fights. bklit's shell pins all-positive data to a zero
 * baseline (`resolveTimeSeriesYDomain`), and on a swim-time axis that squeezes a
 * whole season into the top few percent of the plot. The floor is instead pinned
 * one second faster than the world record: no club swim ever reaches the record,
 * so the line fills the grid while still never running off the bottom.
 *
 * `worldRecordMs` is null for an event with no listed record, and only then does
 * the axis fall back to zero — a known, visible compromise rather than a silent
 * one.
 *
 * @param values every value that must be visible: swim times, drawn cut values,
 *   and the projection's endpoints. A cut faster or slower than every swim still
 *   has to show, since the gap to it is the point of the view.
 * @param worldRecord the record for this event / course / gender, or null.
 */
export function progressionYDomain(
  values: ReadonlyArray<number>,
  worldRecord: number | null,
): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Clamp below the fastest plotted value too: belt and braces against a stale
  // record, so a swim faster than the listed WR cannot fall off the axis.
  const floor = worldRecord === null ? 0 : Math.min(worldRecord - 1_000, lo);
  const pad = Math.max(500, Math.round((hi - floor) * 0.08));
  return [floor, hi + pad];
}
