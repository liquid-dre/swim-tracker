/*
  Where a bar chart's tooltip should sit vertically.

  This is OURS, imported by the vendored `tooltip/chart-tooltip.tsx` (a LOCAL
  EDIT there names it), so the logic is linted and tested and the vendored diff
  stays an import rather than an algorithm — the shape DESIGN.md §5b asks for.

  Why it exists: bklit anchors the tooltip panel to `lines[0]`'s y position and
  falls back to `0` when there are no line configs. That fallback fires on every
  one of our bar charts, because the bars are drawn by `SwimBars` (per-bar fill
  and value labels, neither of which bklit's `<Bar>` can do) rather than by
  `<Bar>` itself. With no `<Bar>` there is no line config, so the panel pinned to
  the top of the plot — hovering the 1500 Free put its tooltip up beside the 50
  Free.

  When there is no series to anchor to, anchor to the hovered BAR instead: the
  centre of its band, which is exactly where SwimBars draws it.
*/

/** The slice of the band scale this needs — `ScaleBand<string>` satisfies it. */
type BandScale = (category: string) => number | undefined;

export function barBandCenterY({
  hasLines,
  index,
  data,
  barScale,
  bandWidth,
  barXAccessor,
}: {
  /** True when real `<Bar>`/`<Line>` series exist — then upstream's path wins. */
  hasLines: boolean;
  /** Hovered row index, from the interaction hook. */
  index: number | undefined;
  data: ReadonlyArray<Record<string, unknown>>;
  barScale: BandScale | undefined;
  bandWidth: number | undefined;
  barXAccessor: ((d: Record<string, unknown>) => string) | undefined;
}): number | null {
  // Never override a chart that has real series — those anchor correctly
  // already, and taking this path would move a working tooltip.
  if (hasLines) return null;
  if (!barScale || !bandWidth || !barXAccessor) return null;
  if (index === undefined) return null;

  const row = data[index];
  if (!row) return null;

  const band = barScale(barXAccessor(row));
  // A category the scale does not know (stale hover mid-filter-change) must not
  // resolve to 0, which is the very bug this exists to fix.
  if (band === undefined) return null;

  return band + bandWidth / 2;
}
