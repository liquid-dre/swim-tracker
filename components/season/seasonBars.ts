/*
  Pure data helpers for the season improvement chart, kept out of the chart
  component so they are testable without mounting Visx — the same split
  progressionRows.ts uses for the progression chart.
*/

export type SeasonBar = {
  swimmerId: string;
  name: string;
  /** Improvement percentage. `getSeasonImprovement` never returns a negative. */
  pct: number;
  /** Sub-label for the tooltip: "1:02.40 → 1:00.15" or "5 of 7 events". */
  sub: string;
};

/**
 * Middle value of the squad's improvements, used for the chart's one reference
 * line.
 *
 * MEDIAN, not mean: a single outlier improver drags a mean past most of the
 * squad, and a line nearly everyone sits below separates nobody. The median
 * always has half the squad on each side, which is the read the line is for.
 *
 * Null below two swimmers — "the middle of the squad" is not a thing that
 * exists for one person, and drawing it there would be noise.
 */
export function squadMedianPct(bars: ReadonlyArray<SeasonBar>): number | null {
  if (bars.length < 2) return null;
  const sorted = bars.map((b) => b.pct).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
