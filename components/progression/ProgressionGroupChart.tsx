"use client";

import { curveLinear } from "@visx/curve";

import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { LineChart } from "@/components/charts/line-chart";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import {
  GalaCutOverlay,
  SWIM_TOOLTIP_PANEL,
  SwimDots,
  ValueAxis,
  type CutLine,
} from "@/components/charts/swim";

import {
  markFor,
  pivotSeries,
  progressionYDomain,
  type ChartRow,
  type RowSeries,
} from "./progressionRows";
import {
  buildTierOverlay,
  Legend,
  msToShort,
  ProgressionTooltip,
  type ProgressionSeries,
  type StandardRow,
} from "./ProgressionChart";

import {
  formatTime,
  worldRecordMs,
  type Course,
  type Distance,
  type Stroke,
  type TourDateByGala,
} from "@/lib/swim";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHART, CHART_ANIM_MS, isoToMs, seriesColor } from "@/components/analysis/chartTheme";

/*
  GROUP progression — several swimmers on one timeline (BRD §5.6).

  A LINE per swimmer, with the same point marks the single-swimmer chart uses.
  A segment joins two of the SAME swimmer's consecutive races, which is exactly
  what the single chart draws too; the swimmers merge onto a shared date axis
  (bklit takes one data array with a key per series), and a swimmer with no swim
  on another swimmer's date simply has no key in that row, so their line bridges
  it rather than diving to the axis.

  Kept separate from ProgressionChart because group mode has none of the
  single-swimmer overlays — no time-to-qualify projection, no training-note
  flags — and because the cut overlay is suppressed here unless every selected
  swimmer resolves to the same exact-age cut. Everything the two DO share is
  imported rather than copied: the pivot, the y-domain, the overlay builder,
  the tooltip and the legend all have one implementation.
*/

/** Renders children at rest (no enter animation) when motion is reduced. */
function MaybeStatic({
  reduced,
  children,
}: {
  reduced: boolean;
  children: React.ReactNode;
}) {
  return reduced ? (
    <StaticChartPreviewProvider>{children}</StaticChartPreviewProvider>
  ) : (
    <>{children}</>
  );
}

export function ProgressionGroupChart({
  series,
  distance,
  stroke,
  course,
  standards,
  tourDates,
}: {
  series: ProgressionSeries[];
  distance: Distance;
  stroke: Stroke;
  course: Course;
  standards: StandardRow[];
  tourDates?: TourDateByGala;
}) {
  const reduced = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");

  const data = series.map((s, i) => ({
    color: seriesColor(i),
    name: s.name,
    points: s.points.map((p) => ({ ...p, t: isoToMs(p.swimDate) })),
  }));

  const rowSeries: RowSeries[] = data.map((s) => ({
    name: s.name,
    color: s.color,
    points: s.points.map((p) => ({
      t: p.t,
      timeMs: p.timeMs,
      mark: markFor(p),
      swimType: p.swimType,
      isPB: p.isPB,
    })),
  }));
  const { rows, keys } = pivotSeries(rowSeries);

  const allTimes = data.flatMap((s) => s.points.map((p) => p.timeMs));
  const allT = data.flatMap((s) => s.points.map((p) => p.t));
  if (rows.length === 0 || allT.length === 0) return null;

  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);
  // A one-day pad keeps a single-date series off the axis edge.
  const tSpan = tMax - tMin;
  const tPad = tSpan === 0 ? 86_400_000 : Math.round(tSpan * 0.04);

  // `single: false` is what asks buildTierOverlay to apply the group rule —
  // no cut lines unless every swimmer resolves to the same exact-age cut (§4.9).
  const overlay = buildTierOverlay(
    series,
    standards,
    false,
    tMin,
    tMax,
    course,
    tourDates ?? {},
  );
  const cutLines: CutLine[] = overlay?.lines ?? [];
  const cutYs = cutLines.flatMap((l) => (l.y2 === undefined ? [l.y] : [l.y, l.y2]));

  // Mixed-gender groups take the outright record, so no line can fall below it.
  const genders = Array.from(new Set(series.map((s) => s.gender)));
  const wr =
    genders.length === 1
      ? worldRecordMs(distance, stroke, course, genders[0])
      : worldRecordMs(distance, stroke, course);

  // Floored just under the record, never at zero — a zero baseline squashes a
  // whole season into the top of the plot. Same helper (and regression test) as
  // the single-swimmer chart.
  const [yFloor, yTop] = progressionYDomain([...allTimes, ...cutYs], wr);

  const height = narrow ? 300 : 360;
  const summary = `Progression for ${series
    .map((s) => s.name)
    .join(", ")}. ${allTimes.length} swims plotted; lower is faster.`;

  return (
    <div className="flex flex-col gap-3">
      <div aria-label={summary} role="img" style={{ width: "100%", height }}>
        <MaybeStatic reduced={reduced}>
          <LineChart
            animationDuration={CHART_ANIM_MS}
            // Empty string opts out of bklit's default "2 / 1" box so the chart
            // fills the fixed-height parent instead of setting its own.
            aspectRatio=""
            data={rows}
            margin={{
              top: 8,
              right: 20,
              bottom: 26,
              left: narrow ? 54 : 64,
            }}
            style={{ height: "100%" }}
            xDataKey="date"
            xDomain={[new Date(tMin - tPad), new Date(tMax + tPad)]}
            xLabelFormat={(d) => msToShort(d.getTime())}
            yDomain={[yFloor, yTop]}
          >
            <Grid
              horizontal
              stroke={CHART.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis numTicks={narrow ? 3 : 5} tickMode="domain" />
            <ValueAxis
              format={formatTime}
              label="Time"
              width={narrow ? 54 : 64}
            />
            {cutLines.length > 0 && (
              <GalaCutOverlay cuts={cutLines} strokeOpacity={0.9} />
            )}
            {keys.map((k) => (
              <Line
                // curveLinear, not bklit's default curveNatural: a spline
                // through swim times bulges between points and so draws times
                // the swimmer never swam. Straight segments are the honest join.
                curve={curveLinear}
                dataKey={k.value}
                // fadeEdges defaults ON, which washes out the first and last
                // swims — and the latest is usually the PB.
                fadeEdges={false}
                key={k.value}
                stroke={k.color}
                strokeWidth={2}
              />
            ))}
            {keys.map((k) => (
              <SwimDots
                color={k.color}
                dataKey={k.value}
                key={`${k.value}-dots`}
                markKey={k.mark}
              />
            ))}
            <ChartTooltip
              indicatorColor={CHART.axis}
              indicatorDasharray="3 3"
              panelStyle={SWIM_TOOLTIP_PANEL}
              showDots={false}
              content={({ point }) => (
                <ProgressionTooltip
                  keys={keys}
                  row={point as ChartRow}
                  single={false}
                />
              )}
            />
          </LineChart>
        </MaybeStatic>
      </div>

      {/* Swimmer colours, then the four mark shapes — the legend the scatter
          never rendered at all. */}
      <Legend series={data} single={false} />
    </div>
  );
}
