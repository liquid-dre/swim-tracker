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
  type SwimBar,
} from "@/components/charts/swim";

import { formatTime, type Course } from "@/lib/swim";
import { formatSeconds } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";

/*
  Gap to the cut (BRD §5.11) — how much time each event still has to drop, as a
  horizontal bar chart above the closest-first list.

  Unlike the season ranking, this scale IS absolute: the axis is a percentage
  over the cut, so a bar length means "3% off" rather than "third-closest". That
  matters here because the question the screen answers is how much work is left,
  and a squad-relative bar would say a swimmer 12% off is "the far end" without
  ever saying 12%.

  Shorter bar = closer, which is the same orientation as everything else in the
  app: less is better. Qualified events are in the SAME chart at zero rather
  than in a second one with inverted semantics — see the note in RoadScreen on
  why the old "Qualifying progress" chart was removed.
*/

export type GapBar = {
  key: string;
  label: string;
  course: Course;
  pbMs: number;
  cutMs: number;
  gapMs: number;
  gapPct: number;
  /** At or past the cut — plotted at zero, since there is no gap left. */
  qualified: boolean;
};

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

export function RoadGapChart({ bars }: { bars: GapBar[] }) {
  const reduced = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");

  if (bars.length === 0) return null;

  const rowHeight = 40;
  const height = Math.max(160, bars.length * rowHeight + 52);
  const longest = bars.reduce((m, b) => Math.max(m, b.label.length), 0);
  const yWidth = narrow
    ? Math.min(96, Math.max(64, longest * 7.5))
    : Math.min(140, Math.max(72, longest * 7.5));

  const maxGapPct = bars.reduce((m, b) => Math.max(m, b.gapPct), 0);

  const swimBars: SwimBar[] = bars.map((b) => ({
    key: b.key,
    category: b.label,
    value: b.gapPct,
    // Two states, and they are a real distinction: still chasing, or done.
    fill: b.qualified ? "var(--color-qualified)" : CHART.accent,
    // A qualified event draws no bar, because zero seconds remain — so the
    // label is what carries the row. Saying "+0.0s" would read as a rounding
    // artefact rather than as an achievement.
    label: b.qualified ? "Qualified" : `+${formatSeconds(b.gapMs)}s`,
  }));

  return (
    // Decorative: the list beneath carries every gap in seconds and percent,
    // plus the course each row was measured in.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <MaybeStatic reduced={reduced}>
        <BarChart
          animationDuration={CHART_ANIM_MS}
          aspectRatio=""
          barGap={0.28}
          data={bars}
          margin={{ top: 4, right: narrow ? 56 : 76, bottom: 24, left: yWidth }}
          className="h-full"
          orientation="horizontal"
          // Bars come from SwimBars, not <Bar>, so bklit finds no dataKey to
          // scan and would fall back to [0, 110]. Zero-based: a bar length IS
          // the gap, and zero is a real, meaningful point on this scale — it is
          // the cut.
          valueDomain={[0, Math.max(maxGapPct, 0.1) * 1.08]}
          xDataKey="label"
        >
          <Grid horizontal={false} stroke={CHART.grid} strokeDasharray="3 3" vertical />
          <BarYAxis maxLabelWidth={yWidth - 8} />
          <ValueAxis format={(v) => `${v.toFixed(1)}%`} label="Over the cut" />
          <SwimBars bars={swimBars} labelColor={CHART.ink} maxBarSize={22} />
          <ChartTooltip
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => <GapTooltip row={point as unknown as GapBar} />}
          />
        </BarChart>
      </MaybeStatic>
    </div>
  );
}

function GapTooltip({ row }: { row: GapBar }) {
  if (!row?.label) return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.label}</TooltipTitle>
      <TooltipValue>
        {row.qualified ? "Qualified" : `+${formatSeconds(row.gapMs)}s`}
      </TooltipValue>
      <TooltipMeta>
        <span>
          {formatTime(row.pbMs)} → {formatTime(row.cutMs)} ·{" "}
          {row.course === "LCM" ? "long course" : "short course"}
        </span>
      </TooltipMeta>
    </TooltipRows>
  );
}
