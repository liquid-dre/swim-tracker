"use client";

import { useMemo } from "react";

import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  useHeatmapInteractionOptional,
} from "@/components/charts/heatmap";
import { SWIM_TOOLTIP_PANEL } from "@/components/charts/swim";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import {
  buildHeatmapColumns,
  rateLevel,
  statusLevel,
  RATE_LEVEL_LABELS,
  RATE_LEVEL_STYLES,
  STATUS_LEVEL_LABELS,
  STATUS_LEVEL_STYLES,
  type HeatmapDay,
} from "./attendanceHeatmap";
import type { CalendarVariant } from "./types";

/*
  The season attendance strip that sits ABOVE the month grid (§R18).

  It deliberately does not replace the grid: the grid is the working surface a
  coach marks from — tappable session chips, several sessions a day, the agenda.
  A heatmap cell is one square per day and can carry none of that. What it adds
  is the thing the grid cannot show at all, a whole season at once, so patterns
  that span months (a bad January, a squad that fades before a gala) become
  visible without paging through twelve screens.

  Clicking a cell jumps the grid below to that month, which is what makes the
  strip a navigation aid rather than a decoration.
*/

export type { HeatmapDay };

/** Words per level, so the legend never depends on the swatch alone. */
function Legend({ variant }: { variant: CalendarVariant }) {
  const styles = variant === "swimmer" ? STATUS_LEVEL_STYLES : RATE_LEVEL_STYLES;
  const labels = variant === "swimmer" ? STATUS_LEVEL_LABELS : RATE_LEVEL_LABELS;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {labels.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span
            aria-hidden
            className="size-2.5 rounded-sm border border-black/5"
            style={swatchStyle(styles[i])}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

/*
  A CSS echo of the cell's pattern fill. The cells themselves are painted with
  @visx/pattern inside the SVG, which a legend swatch cannot reuse — so the
  swatch approximates the same texture in CSS. It only has to be recognisable:
  the words beside it carry the actual meaning.
*/
function swatchStyle(style: {
  color: string;
  fillMode?: string;
  pattern?: string;
  patternColor?: string;
}): React.CSSProperties {
  if (style.fillMode !== "pattern") return { background: style.color };
  const line = style.patternColor ?? style.color;

  switch (style.pattern) {
    case "diagonal":
      return {
        background: `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px 3px)`,
      };
    case "cross":
      return {
        background: `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, ${line} 0 1px, transparent 1px 3px)`,
      };
    case "dots":
      return {
        background: `radial-gradient(${line} 0.8px, transparent 0.9px) 0 0 / 3px 3px`,
      };
    default:
      return { background: style.color };
  }
}

/**
 * Turns a click anywhere on the grid into "show me that month", using whichever
 * cell the pointer is over. The heatmap exposes hover state but no per-cell
 * click, so this reads the hovered cell out of the interaction context.
 */
function MonthJump({
  onSelectMonth,
  children,
}: {
  onSelectMonth?: (year: number, month: number) => void;
  children: React.ReactNode;
}) {
  const interaction = useHeatmapInteractionOptional();

  if (!onSelectMonth) return <>{children}</>;

  return (
    <div
      onClick={() => {
        const d = interaction?.tooltipData?.date;
        if (d) onSelectMonth(d.getFullYear(), d.getMonth());
      }}
    >
      {children}
    </div>
  );
}

export function AttendanceHeatmap({
  days,
  from,
  to,
  variant,
  swimmerName,
  onSelectMonth,
}: {
  days: HeatmapDay[];
  from: string;
  to: string;
  variant: CalendarVariant;
  /** Named when the strip is showing one swimmer, for the caption and summary. */
  swimmerName?: string;
  onSelectMonth?: (year: number, month: number) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const perSwimmer = variant === "swimmer";

  const columns = useMemo(
    () => buildHeatmapColumns(days, from, to, perSwimmer ? statusLevel : rateLevel),
    [days, from, to, perSwimmer],
  );

  const labels = perSwimmer ? STATUS_LEVEL_LABELS : RATE_LEVEL_LABELS;
  const marked = days.filter((d) => d.marked > 0).length;

  if (columns.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">
          {perSwimmer
            ? `${swimmerName ? `${swimmerName}'s ` : ""}season at a glance`
            : "Season at a glance"}
        </h2>
        <p className="text-xs text-ink-faint">
          {marked} day{marked === 1 ? "" : "s"} with attendance
          {onSelectMonth ? " · select a day to open its month" : ""}
        </p>
      </div>

      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <MonthJump onSelectMonth={onSelectMonth}>
            {/* Decorative: the summary sentence and the month grid below carry
                the same information for assistive tech. */}
            <div aria-hidden="true">
              <HeatmapChart
                animate={!reduced}
                animationDuration={CHART_ANIM_MS}
                data={columns}
                gap={2}
                layout="fluid"
                levelStyles={perSwimmer ? STATUS_LEVEL_STYLES : RATE_LEVEL_STYLES}
                // Monday-first: the training week starts Monday, and a grid that
                // splits the weekend across two columns reads badly for a sport
                // whose galas land on Saturdays.
                weekStartDay={1}
              >
                <HeatmapCells />
                <HeatmapXAxis />
                <HeatmapYAxis />
                <HeatmapTooltip
                  panelStyle={SWIM_TOOLTIP_PANEL}
                  formatLabel={(count) => labels[count] ?? labels[0]}
                />
              </HeatmapChart>
            </div>
          </MonthJump>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>

      <Legend variant={variant} />
    </section>
  );
}
