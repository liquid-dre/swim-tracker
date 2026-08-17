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
