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
} from "@/components/charts/heatmap";
// Imported from the file rather than the barrel, which does not re-export it;
// reaching past the barrel is cheaper than editing the vendored index.
import { HeatmapLegendSwatch } from "@/components/charts/heatmap/heatmap-legend-swatch";
import { SWIM_TOOLTIP_PANEL } from "@/components/charts/swim";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import {
  buildHeatmapColumns,
  rateLevel,
  statusLevel,
  RATE_LEVEL_LABELS,
  RATE_LEVEL_STYLES,
  seasonSummary,
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

  A month-jump row beneath it moves the grid, so the strip is a navigation aid
  rather than a decoration. That used to be a click on a cell, which was a
  pointer-only affordance over an aria-hidden SVG — unreachable by keyboard and
  unannounced. Buttons carry the same shortcut and can be tabbed to.
*/

export type { HeatmapDay };

/**
 * Words per level, with the swatch drawn by the SAME code that paints the cells.
 *
 * This used to be a hand-rolled CSS approximation of the pattern, on the belief
 * that a legend swatch could not reuse an SVG pattern. It can:
 * `HeatmapLegendSwatch` calls the very `renderPatternPreset` the cells call, so
 * the key now matches the thing it describes by construction rather than by two
 * sets of hand-tuned numbers drifting apart.
 */
function Legend({ variant }: { variant: CalendarVariant }) {
  const styles = variant === "swimmer" ? STATUS_LEVEL_STYLES : RATE_LEVEL_STYLES;
  const labels = variant === "swimmer" ? STATUS_LEVEL_LABELS : RATE_LEVEL_LABELS;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {labels.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          {/* Ringed: the vendored swatch borders level 0 in its own colour,
              so "No session" (gray-100 on gray-100 on a white card) had no
              visible edge at all. */}
          <span className="flex rounded-sm ring-1 ring-black/10">
            <HeatmapLegendSwatch
              cellSize={10}
              cornerRadius={2}
              level={i}
              style={styles[i]}
            />
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Months spanned by the strip, for the jump row. Derived from the range rather
 * than the data so a quiet month is still reachable.
 */
function monthsBetween(from: string, to: string): Array<{ year: number; month: number; label: string }> {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: Array<{ year: number; month: number; label: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short" });
  while (cursor <= end && out.length < 24) {
    out.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      label: fmt.format(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
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
  /** Moves the month grid below. Rendered as buttons, not a cell click. */
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
  const summary = seasonSummary(days, perSwimmer);
  const months = onSelectMonth ? monthsBetween(from, to) : [];

  // ~10px cells plus the 2px gap. Below this the squares are smaller than the
  // gaps between them and the strip is texture, not data — so the card scrolls
  // rather than letting `layout="fluid"` shrink a 52-week season to noise.
  const minWidth = columns.length * 12;

  if (columns.length === 0) return null;

  return (
    /*
      Shown at every width. The `minWidth` below keeps cells at a readable ~10px
      and lets the card scroll instead, which is what stops a 52-week season
      collapsing to 4px on a phone — so hiding it there would only take the
      season view away from the audience PRODUCT.md says is "on phones as often
      as laptops", while the scroll already solved the legibility problem.
    */
    <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">
          {perSwimmer
            ? `${swimmerName ? `${swimmerName}'s ` : ""}season at a glance`
            : "Season at a glance"}
        </h2>
        <p className="text-xs text-ink-faint">
          {marked} day{marked === 1 ? "" : "s"} with attendance
        </p>
      </div>

      {/* The strip's text equivalent. The month grid below is NOT one: it shows
          a single month against this whole season, and below `lg` it is replaced
          by the agenda entirely. */}
      <p className="sr-only">{summary}</p>

      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="overflow-x-auto custom-scrollbar">
            <div aria-hidden="true" style={{ minWidth }}>
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
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>

      <Legend variant={variant} />

      {months.length > 0 && (
        <nav aria-label="Jump to month" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-ink-faint">Jump to</span>
          {months.map((m) => (
            <button
              className="rounded-md px-2 py-1 text-xs font-medium text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50 hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
              key={`${m.year}-${m.month}`}
              onClick={() => onSelectMonth?.(m.year, m.month)}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
