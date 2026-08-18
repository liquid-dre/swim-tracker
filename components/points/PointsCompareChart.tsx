"use client";

import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import {
  SWIM_TOOLTIP_PANEL,
  TooltipMeta,
  TooltipRows,
  TooltipTitle,
  ValueAxis,
} from "@/components/charts/swim";

import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { formatTime, type Course, type Distance, type Stroke } from "@/lib/swim";
import type { ScoredEvent } from "@/lib/points";
import { pointsDomain } from "./pointsRows";
import {
  compareGaps,
  compareLookup,
  compareRows,
  compareSeries,
  compareValues,
  type CompareMode,
  type CompareRow,
  type CompareSwimmer,
} from "./pointsCompare";

/*
  Several swimmers' World Aquatics points across one half of an event: pin 50m
  and read across the strokes, or pin Freestyle and read across the distances.

  This is the app's FIRST grouped bar chart. bklit supports it, but the
  mechanism is implicit and worth stating: each `<Bar>` finds its own index
  among the chart's dataKey-bearing children and offsets itself inside the band
  by that index. Three consequences the code below depends on:

    • Every swimmer needs a DISTINCT dataKey. Two Bars sharing one collapse to
      the same slot and draw on top of each other.
    • `groupGap` is left at its default 4. The chart's tooltip-anchor maths
      hard-codes 4 independently of the prop, so changing it here would slide
      every tooltip off its bar.
    • A row with no key for a swimmer renders NO BAR (bar.tsx returns null for
      a non-numeric value) and the empty slot stays put, so everyone keeps
      their position and colour in every group.

  The axis is fixed 0-1000 like the single-swimmer chart, which is the entire
  reason points exist: a squad of 400-point swimmers must not look like a squad
  of 900-point ones. That needed a local edit — `valueDomain` used to be inert
  in vertical orientation.

  NO reference lines here, unlike the single-swimmer chart. There they are
  rulers: that chart's value axis runs along the BOTTOM, so short bars have
  nothing to read against without them. Vertical, the value axis is up the side
  and the horizontal gridlines already land on every tick — dashed markers at
  400/600/800 would just reprint numbers the axis is already showing, and would
  need a caption explaining they are not qualifying cuts. Less ink says more.
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

export function PointsCompareChart({
  swimmers,
  mode,
  pinned,
  course,
}: {
  swimmers: CompareSwimmer[];
  mode: CompareMode;
  pinned: Distance | Stroke;
  course: Course;
}) {
  const reduced = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");

  const rows = compareRows(swimmers, mode, pinned, course);
  const series = compareSeries(swimmers);
  const lookup = compareLookup(swimmers, mode, pinned, course);
  const gaps = compareGaps(swimmers, mode, pinned, course);
  const domain = pointsDomain(compareValues(rows));

  if (rows.length === 0) return null;

  const yWidth = narrow ? 46 : 54;
  const scored = compareValues(rows).length;

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{ width: "100%", height: narrow ? 280 : 340 }}
        role="img"
        aria-label={`World Aquatics points by ${
          mode === "DISTANCE" ? "stroke" : "distance"
        }, higher is better. ${series.length} swimmers, ${scored} scored swims.`}
      >
        <MaybeStatic reduced={reduced}>
          <BarChart
            animationDuration={CHART_ANIM_MS}
            // Empty string opts out of bklit's default "2 / 1" box so the chart
            // fills the fixed-height parent instead of setting its own.
            aspectRatio=""
            className="h-full"
            data={rows}
            margin={{ top: 8, right: 8, bottom: 26, left: yWidth }}
            // Vertical: categories along the bottom, points up the side — the
            // opposite of every other bar chart here, which plots a TIME.
            orientation="vertical"
            // Fixed 0-1000. Only honoured in this orientation because of the
            // widened `valueDomain` local edit in bar-chart.tsx; without it the
            // scale would silently refit to the selected swimmers.
            valueDomain={domain}
            // The LABEL, not the band key: BarXAxis prints the accessor's
            // value straight out and has no `labelFor` hook the way BarYAxis
            // does, so keying on "50|FREE" would put that on the axis. Labels
            // are unique within one chart by construction — four distinct
            // strokes, or six distinct distances — which a test locks.
            xDataKey="label"
          >
            <Grid horizontal stroke={CHART.grid} vertical={false} />
            <BarXAxis />
            <ValueAxis
              format={(v) => String(Math.round(v))}
              label="Points"
              width={yWidth}
            />
            {series.map((s) => (
              // groupGap deliberately left at its default — see the note above.
              <Bar dataKey={s.dataKey} fill={s.color} key={s.dataKey} />
            ))}
            <ChartTooltip
              panelStyle={SWIM_TOOLTIP_PANEL}
              showDots={false}
              content={({ point }) => (
                <CompareTooltip
                  lookup={lookup}
                  row={point as CompareRow}
                  series={series}
                />
              )}
            />
          </BarChart>
        </MaybeStatic>
      </div>

      <div className="flex flex-col gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {series.map((s) => (
            <li key={s.dataKey} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="font-medium text-ink">{s.name}</span>
            </li>
          ))}
        </ul>

        {gaps.length > 0 && (
          <p className="text-xs text-ink-faint">
            {gaps
              .map((g) => `${g.name} has not raced ${g.missing.join(", ")}`)
              .join(" · ")}
            {" — those bars are left out, not scored zero."}
          </p>
        )}
      </div>

      {/* The chart is decorative; this table is what assistive tech reads. */}
      <table className="sr-only">
        <caption>
          World Aquatics points per swimmer, by{" "}
          {mode === "DISTANCE" ? "stroke" : "distance"}
        </caption>
        <thead>
          <tr>
            <th scope="col">{mode === "DISTANCE" ? "Stroke" : "Distance"}</th>
            {series.map((s) => (
              <th key={s.dataKey} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category}>
              <th scope="row">{row.label}</th>
              {series.map((s) => {
                const e = lookup.get(row.category)?.get(s.dataKey);
                return (
                  <td key={s.dataKey}>
                    {e ? `${e.points} points, ${formatTime(e.timeMs)}` : "Not raced"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* bklit hands `content` the hovered ROW, which is one category band. Every
   swimmer who scored there is listed, so the tooltip answers the question the
   group asks: who is strongest at this one. */
function CompareTooltip({
  lookup,
  row,
  series,
}: {
  lookup: Map<string, Map<string, ScoredEvent>>;
  row: CompareRow;
  series: Array<{ dataKey: string; name: string; color: string }>;
}) {
  const byKey = lookup.get(row?.category);
  if (!byKey) return null;

  // Strongest first, so the tooltip ranks rather than just listing.
  const present = series
    .map((s) => ({ s, e: byKey.get(s.dataKey) }))
    .filter((x): x is { s: (typeof series)[number]; e: ScoredEvent } => Boolean(x.e))
    .sort((a, b) => b.e.points - a.e.points);

  if (present.length === 0) return null;

  return (
    <TooltipRows>
      <TooltipTitle>{present[0].e.label}</TooltipTitle>
      {present.map(({ s, e }) => (
        <TooltipMeta key={s.dataKey}>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-sm"
              style={{ background: s.color }}
            />
            {s.name}
            <span className="tabular-nums text-ink">{e.points} pts</span>
            <span className="tabular-nums">{formatTime(e.timeMs)}</span>
          </span>
        </TooltipMeta>
      ))}
    </TooltipRows>
  );
}
