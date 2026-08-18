"use client";

import { BarChart } from "@/components/charts/bar-chart";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Grid } from "@/components/charts/grid";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import {
  SWIM_TOOLTIP_PANEL,
  SwimBars,
  TooltipMeta,
  TooltipRows,
  TooltipTitle,
  TooltipValue,
  ValueAxis,
  ValueThresholds,
  type SwimBar,
  type Threshold,
} from "@/components/charts/swim";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import { squadMedianPct, type SeasonBar } from "./seasonBars";

/*
  Season improvement ranking as a horizontal bar chart (BRD §5.12), the hero
  above the ranked list — the same chart-then-table shape /compare uses, and for
  the same reason: the list carries the exact figures, so this SVG is decorative
  and hidden from assistive tech.

  The domain is zero-based and runs to the squad's best drop, so bar LENGTH is
  proportional to the improvement — the leader fills the track and everyone else
  reads against them. That is a real quantity, which is why the axis is drawn.
  It shipped without one for a while, and the effect was that a squad whose
  leader dropped 1.2% and one whose leader dropped 14% rendered identically: the
  shape was honest and completely unreadable, because nothing on screen said
  what the track was worth.

  The one threshold line is the squad's MEDIAN improvement. Median, not mean,
  because a single big improver drags a mean past most of the squad and the line
  stops separating anyone. It gives each bar a second read a coach acts on —
  above or below the middle of the squad — on top of the magnitude the axis now
  supplies.
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

export type { SeasonBar } from "./seasonBars";

export function SeasonBarChart({ bars }: { bars: SeasonBar[] }) {
  const reduced = usePrefersReducedMotion();
  // Phone-width: shrink the name gutter so the bars keep most of the plot. The
  // ranked list beneath carries the full names, so nothing is lost.
  const narrow = useMediaQuery("(max-width: 639px)");

  if (bars.length === 0) return null;

  const rowHeight = 40;
  const height = Math.max(160, bars.length * rowHeight + 48);

  const longestName = bars.reduce((m, b) => Math.max(m, b.name.length), 0);
  const yWidth = narrow
    ? Math.min(92, Math.max(64, longestName * 7.5))
    : Math.min(180, Math.max(72, longestName * 7.5));

  const maxPct = bars.reduce((m, b) => Math.max(m, b.pct), 0);
  const median = squadMedianPct(bars);

  // Key on the swimmer's ID, not the name — see ComparisonBarChart. /season
  // ranks the whole squad at once, so it is the likeliest place to hit a
  // duplicate name.
  const nameById = new Map(bars.map((b) => [b.swimmerId, b.name]));

  const swimBars: SwimBar[] = bars.map((b) => ({
    key: b.swimmerId,
    category: b.swimmerId,
    value: b.pct,
    // One accent: season improvement carries no tier meaning, so colour here
    // would be decoration inventing a category that does not exist.
    fill: CHART.accent,
    label: `−${b.pct.toFixed(1)}%`,
  }));

  // Neutral grey, never a gala hue — the median is a property of THIS squad in
  // THIS window, not a qualifying standard, and must not read as one.
  const thresholds: Threshold[] =
    median === null
      ? []
      : [
          {
            key: "median",
            value: median,
            color: "var(--color-gray-400)",
            ink: "var(--color-gray-600)",
            dash: "4 3",
            label: `Squad median −${median.toFixed(1)}%`,
          },
        ];

  return (
    // Decorative: the ranked list beneath carries the same data, with the exact
    // percentages and dropped seconds, so the SVG is hidden from the a11y tree.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <MaybeStatic reduced={reduced}>
        <BarChart
          animationDuration={CHART_ANIM_MS}
          // Fill the fixed-height parent rather than bklit's default "2 / 1".
          aspectRatio=""
          barGap={0.28}
          data={bars}
          // Headroom at the top for the median label sitting above the plot.
          margin={{
            top: thresholds.length > 0 ? 22 : 4,
            right: narrow ? 52 : 72,
            bottom: 24,
            left: yWidth,
          }}
          className="h-full"
          orientation="horizontal"
          // Bars come from SwimBars, not <Bar>, so bklit finds no dataKey to
          // scan and would fall back to [0, 110]. Zero-based with the leader
          // near the end of the track: this is the normalised scale, expressed
          // as a domain so the median line lands in the same coordinate space.
          valueDomain={[0, Math.max(maxPct, median ?? 0) * 1.08]}
          xDataKey="swimmerId"
        >
          <Grid
            horizontal={false}
            stroke={CHART.grid}
            strokeDasharray="3 3"
            vertical
          />
          {/* Names down the side, percent dropped along the bottom. */}
          <BarYAxis
            labelFor={(id) => nameById.get(id) ?? id}
            maxLabelWidth={yWidth - 8}
          />
          <ValueAxis format={(v) => `${v.toFixed(1)}%`} label="Time dropped" />
          <ValueThresholds thresholds={thresholds} />
          <SwimBars bars={swimBars} labelColor={CHART.ink} maxBarSize={22} />
          <ChartTooltip
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => (
              <SeasonTooltip row={point as unknown as SeasonBar} />
            )}
          />
        </BarChart>
      </MaybeStatic>
    </div>
  );
}

/* bklit hands `content` the hovered data ROW, which here is a SeasonBar. The
   card is bklit's TooltipBox; only the stack inside it is ours. */
function SeasonTooltip({ row }: { row: SeasonBar }) {
  if (!row?.name) return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.name}</TooltipTitle>
      <TooltipValue>−{row.pct.toFixed(1)}%</TooltipValue>
      <TooltipMeta>
        <span>{row.sub}</span>
      </TooltipMeta>
    </TooltipRows>
  );
}
