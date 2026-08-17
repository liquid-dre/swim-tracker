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

import { formatTime, type GalaCode } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  CHART,
  CHART_ANIM_MS,
  OVERLAY_TIER_ORDER,
  TIER_STYLE,
} from "@/components/analysis/chartTheme";

/*
  Horizontal bar chart of each swimmer's headline MEET PB (BRD §5.5). Fastest at
  the top (mirrors the leaderboard order). Shorter bar = faster; each bar is
  labelled with its exact time so the chart never asks the eye to estimate.

  Step 10 overlay (§4.9): when one exact age + gender is pinned, the applicable
  L2/L3/SANJ cuts are drawn as vertical threshold lines (a bar ending left of a
  line has met that tier). For "all ages" the lines are suppressed — each
  swimmer's cut differs by age — and every bar is instead coloured by the hardest
  tier its own PB meets. The long-course cut is the reference on both courses, so
  colouring applies on SCM too (an event with no cut leaves bars on-accent).
*/

export type CompareBar = {
  swimmerId: string;
  name: string;
  timeMs: number;
  swimDate: string;
  meetName: string | null;
  highestGala: GalaCode | null;
};

/** Vertical cut lines for one pinned (age, gender); empty suppresses them. */
export type ComparisonCut = { tier: GalaCode; timeMs: number };

// "No tier" must not read as a tier: on LCM the no-tier bar uses the gray
// --tier-none the system reserves for it, never the brand accent (which would
// read as an action, not a standard). SCM has no standards at all, so its bars
// keep the plain brand accent.
function barColor(tier: GalaCode | null, overlay: boolean): string {
  if (!overlay) return CHART.accent;
  return tier ? TIER_STYLE[tier].color : "var(--color-tier-none)";
}

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

export function ComparisonBarChart({
  rows,
  cuts,
  overlay,
}: {
  rows: CompareBar[];
  cuts: ComparisonCut[];
  overlay: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  // Phone-width: shrink the label gutters so the bars keep most of the plot.
  // Decorative-only trade-off — the leaderboard table carries the full names.
  const narrow = useMediaQuery("(max-width: 639px)");

  // Fastest first in the leaderboard = top of the chart. Recharts plots the
  // first category at the bottom by default, so reverse the axis to match.
  const data = rows;
  const rowHeight = 44;
  const height = Math.max(160, data.length * rowHeight + 48);

  // Longest name drives the label gutter so names never clip or over-reserve.
  const longestName = data.reduce((m, r) => Math.max(m, r.name.length), 0);
  const yWidth = narrow
    ? Math.min(92, Math.max(64, longestName * 7.5))
    : Math.min(180, Math.max(72, longestName * 7.5));

  // Keep the slowest cut on-scale so a bar can visibly sit left of it.
  const maxCut = cuts.reduce((m, c) => Math.max(m, c.timeMs), 0);
  const maxTime = data.reduce((m, r) => Math.max(m, r.timeMs), 0);

  const bars: SwimBar[] = data.map((r) => ({
    key: r.swimmerId,
    category: r.name,
    value: r.timeMs,
    fill: barColor(r.highestGala, overlay),
    // The exact time at the end of every bar, so the chart never asks the eye to
    // estimate a swim time off a bar length.
    label: formatTime(r.timeMs),
  }));

  const thresholds: Threshold[] = cuts.map((c) => {
    const st = TIER_STYLE[c.tier];
    return {
      key: c.tier,
      value: c.timeMs,
      color: st.color,
      dash: st.dash,
      // Glyph + label: a gala is never colour-only (DESIGN.md §3).
      label: `${st.glyph} ${st.label}`,
    };
  });

  return (
    // Decorative: the leaderboard table beneath carries the same data for
    // assistive tech, so the SVG itself is hidden from the a11y tree.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <MaybeStatic reduced={reduced}>
        <BarChart
          animationDuration={CHART_ANIM_MS}
          // Fill the fixed-height parent rather than bklit's default "2 / 1".
          aspectRatio=""
          barGap={0.28}
          data={data}
          // Reserve headroom for the threshold labels sitting above the plot.
          margin={{
            top: cuts.length > 0 ? 22 : 4,
            right: narrow ? 52 : 72,
            bottom: 24,
            left: yWidth,
          }}
          className="h-full"
          orientation="horizontal"
          // Bars are drawn by SwimBars, not <Bar>, so bklit finds no dataKey to
          // scan and would fall back to [0, 110]. The domain also has to reach
          // past the SLOWEST cut, or a swimmer short of it has nothing to be
          // short of. Zero-based is right here: a bar length IS the time.
          valueDomain={[0, Math.max(maxTime, maxCut) * 1.08]}
          xDataKey="name"
        >
          <Grid
            horizontal={false}
            stroke={CHART.grid}
            strokeDasharray="3 3"
            vertical
          />
          {/* Swimmer names down the side; times along the bottom. On a horizontal
              bar chart bklit's BarYAxis is the CATEGORY axis, and the value axis
              has no labels at all — hence ValueAxis. */}
          <BarYAxis maxLabelWidth={yWidth - 8} />
          <ValueAxis format={formatTime} label="Time" />
          {/* One vertical line per eligible gala at the pinned age, in this
              course. A bar ending left of a line has met that gala. */}
          <ValueThresholds thresholds={thresholds} />
          <SwimBars bars={bars} labelColor={CHART.ink} maxBarSize={26} />
          <ChartTooltip
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => (
              <CompareTooltip row={point as unknown as CompareBar} />
            )}
          />
        </BarChart>
      </MaybeStatic>
    </div>
  );
}

/** Colour + glyph key for the tier bars/lines; render only when standards show. */
export function ComparisonTierLegend({ tiers }: { tiers: GalaCode[] }) {
  const present = OVERLAY_TIER_ORDER.filter((t) => tiers.includes(t));
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="font-medium text-ink-muted">GalaCode met</span>
      {present.map((t) => {
        const st = TIER_STYLE[t];
        return (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ background: st.color }}
            />
            <span aria-hidden style={{ color: st.color }} className="text-2xs leading-none">
              {st.glyph}
            </span>
            <span className="font-medium text-ink">{st.label}</span>
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: "var(--color-tier-none)" }}
        />
        <span className="text-ink-muted">No tier</span>
      </span>
    </div>
  );
}

/* bklit hands `content` the hovered data ROW, which here is a CompareBar. The
   card is bklit's TooltipBox; only the stack inside it is ours. */
function CompareTooltip({ row }: { row: CompareBar }) {
  if (!row?.name) return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.name}</TooltipTitle>
      <TooltipValue>{formatTime(row.timeMs)}</TooltipValue>
      <TooltipMeta>
        <span>
          {formatShortDate(row.swimDate)}
          {row.meetName ? ` · ${row.meetName}` : ""}
        </span>
      </TooltipMeta>
    </TooltipRows>
  );
}
