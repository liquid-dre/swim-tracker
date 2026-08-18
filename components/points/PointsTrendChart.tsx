"use client";

import { curveLinear } from "@visx/curve";

import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { LineChart } from "@/components/charts/line-chart";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import {
  SWIM_TOOLTIP_PANEL,
  TooltipMeta,
  TooltipRows,
  TooltipTitle,
  TooltipValue,
  ValueAxis,
  ValueThresholds,
} from "@/components/charts/swim";

import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import type { MeetPoint } from "@/lib/points";
import { pointsDomain, referenceThresholds, trendRows, type TrendRow } from "./pointsRows";

/*
  World Aquatics points over time — one dot per MEET, at that meet's
  best-scoring swim.

  A swimmer races several events over several days at one gala, so plotting
  every swim would be a scatter and plotting every date would show one gala as
  four dots. Reducing each meet to its best swim makes the series read as "how
  good was this swimmer at that meet".

  The line can FALL as well as rise, and that is deliberate. A running
  best-ever line would be monotone, so a bad season would look exactly like no
  season at all — this one shows form.

  Same fixed 0–1000 axis as the bar chart, for the same reason: the two charts
  on this page must agree, and a swimmer's trend must not be flattered by an
  axis that shrinks to fit them. HIGHER = BETTER, unlike the progression chart,
  where the quantity is a time; the axis names which it is.
*/

/** Padding on the time axis so the first and last dots aren't on the frame. */
const T_PAD_MS = 7 * 86_400_000;

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

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Below the minimum, a line chart is a lie: one dot draws no trend, and an axis
 * spanning a single day invites a reading that is not there. The screen shows a
 * sentence instead until there is something to join up.
 */
export const TREND_MIN_MEETS = 2;

export function PointsTrendChart({ meets }: { meets: MeetPoint[] }) {
  const reduced = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");

  const rows = trendRows(meets);
  const domain = pointsDomain(rows.map((r) => r.points));
  const thresholds = referenceThresholds(domain, CHART.grid);

  const tMin = rows.length > 0 ? rows[0].t : 0;
  const tMax = rows.length > 0 ? rows[rows.length - 1].t : 0;
  // A single meet has no span, so give it a symmetric window rather than a
  // degenerate domain the time scale cannot divide.
  const pad = tMax > tMin ? T_PAD_MS : 30 * 86_400_000;

  const best = rows.reduce((m, r) => Math.max(m, r.points), 0);
  const summary =
    rows.length === 0
      ? "No scored meets yet."
      : `${rows.length} meet${rows.length === 1 ? "" : "s"}, best ${best} points.`;

  return (
    <>
      {/* Only the SVG box is the image. The table below is a sibling, not a
          child — nested inside role="img" it would be hidden from the very
          assistive tech it exists for. */}
      <div
        style={{ width: "100%", height: narrow ? 260 : 300 }}
        role="img"
        aria-label={`World Aquatics points by meet, higher is better. ${summary}`}
      >
      <MaybeStatic reduced={reduced}>
        <LineChart
          animationDuration={CHART_ANIM_MS}
          // Empty string opts out of bklit's default "2 / 1" box so the chart
          // fills the fixed-height parent instead of setting its own.
          aspectRatio=""
          data={rows}
          margin={{ top: thresholds.length > 0 ? 30 : 8, right: 20, bottom: 26, left: narrow ? 46 : 54 }}
          style={{ height: "100%" }}
          xDataKey="date"
          xDomain={[new Date(tMin - pad), new Date(tMax + pad)]}
          // Without this the x labels lose the year, which a chart spanning
          // seasons cannot afford.
          xLabelFormat={(d) => shortDate(d.getTime())}
          // Without this bklit pins the domain to [0, max * 1.1], which would
          // rescale the chart to the swimmer and undo the whole point of a
          // comparable axis.
          yDomain={domain}
        >
          <Grid
            horizontal
            stroke={CHART.grid}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis numTicks={narrow ? 3 : 5} tickMode="domain" />
          <ValueAxis
            format={(v) => String(Math.round(v))}
            label="Points"
            width={narrow ? 46 : 54}
          />
          <ValueThresholds strokeOpacity={0.7} thresholds={thresholds} />
          <Line
            // curveLinear, not bklit's default curveNatural: a spline through
            // meet scores bulges between them and so draws form the swimmer
            // never had. Straight segments are the only honest join.
            curve={curveLinear}
            dataKey="points"
            // fadeEdges defaults ON, which washes out the first and last meets —
            // and the last meet is the current form, the most important dot.
            fadeEdges={false}
            showMarkers
            stroke={CHART.accent}
            strokeWidth={2}
          />
          <ChartTooltip
            indicatorColor={CHART.axis}
            indicatorDasharray="3 3"
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => <TrendTooltip row={point as TrendRow} />}
          />
        </LineChart>
      </MaybeStatic>
      </div>

      {/* The chart is decorative; this table is what assistive tech reads. */}
      <table className="sr-only">
        <caption>World Aquatics points at each meet, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Meet</th>
            <th scope="col">Date</th>
            <th scope="col">Points</th>
            <th scope="col">Best swim</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.swimDate}-${r.t}`}>
              <th scope="row">{r.meetName ?? "Unnamed meet"}</th>
              <td>{formatShortDate(r.swimDate)}</td>
              <td>{r.points}</td>
              <td>
                {r.label} in {formatTime(r.timeMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function TrendTooltip({ row }: { row: TrendRow }) {
  if (typeof row?.points !== "number") return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.meetName ?? "Meet"}</TooltipTitle>
      <TooltipValue>{row.points} pts</TooltipValue>
      <TooltipMeta>
        <span>
          {row.label} · <span className="tabular-nums">{formatTime(row.timeMs)}</span>
        </span>
      </TooltipMeta>
      <TooltipMeta>
        <span>{formatShortDate(row.swimDate)}</span>
      </TooltipMeta>
    </TooltipRows>
  );
}
