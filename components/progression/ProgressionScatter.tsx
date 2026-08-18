"use client";

import { Grid } from "@/components/charts/grid";
import { Scatter, ScatterChart } from "@/components/charts/scatter-chart";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import {
  GalaCutOverlay,
  SWIM_TOOLTIP_PANEL,
  SwimDots,
  TooltipMeta,
  TooltipRows,
  TooltipTitle,
  ValueAxis,
  type CutLine,
} from "@/components/charts/swim";

import {
  markFor,
  pivotSeries,
  progressionYDomain,
  type RowSeries,
} from "./progressionRows";
import { buildTierOverlay, type ProgressionSeries, type StandardRow } from "./ProgressionChart";

import {
  formatTime,
  worldRecordMs,
  type Course,
  type Distance,
  type Stroke,
  type TourDateByGala,
} from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHART, CHART_ANIM_MS, isoToMs, seriesColor } from "@/components/analysis/chartTheme";

/*
  GROUP progression — several swimmers on one timeline, as points rather than
  lines (BRD §5.6).

  Lines were actively misleading here. bklit takes ONE data array with a key per
  series, so the swimmers merge onto a shared date axis, and a swimmer with no
  swim on another swimmer's date simply has no key in that row. For a line that
  is the right behaviour — it bridges the gap rather than diving to the axis —
  but bridging means the segment spans dates that swimmer never raced, drawing a
  time they never swam. With six swimmers racing at different meets, most of
  what is on screen is interpolation.

  Points remove the claim entirely: every mark is a swim that happened, and the
  eye still reads the downward drift because the points fall. Hovering a swimmer
  dims the rest, which is the actual group question — "where is Jane against the
  others" — answered better than six crossing lines ever did.

  SINGLE-swimmer progression keeps the line chart, where a connecting segment
  between two of the SAME swimmer's races is a fair reading of trajectory, and
  where the projection and training-note overlays live.
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

export function ProgressionScatter({
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

  // Cut overlay, suppressed for a group unless every swimmer resolves to the
  // same exact-age cut — buildTierOverlay owns that rule (§4.9), and passing
  // `single: false` is what asks it to apply it.
  const overlay = buildTierOverlay(
    series,
    standards,
    false,
    tMin,
    tMax,
    course,
    tourDates ?? {},
  );
  const cutYs = overlay
    ? overlay.lines.flatMap((l) => (l.y2 === undefined ? [l.y] : [l.y, l.y2]))
    : [];

  // Mixed groups take the outright record, so no point can fall below the floor.
  const genders = Array.from(new Set(series.map((s) => s.gender)));
  const wr =
    genders.length === 1
      ? worldRecordMs(distance, stroke, course, genders[0])
      : worldRecordMs(distance, stroke, course);

  // Floored just under the record rather than at zero — a zero baseline would
  // squash a whole season into the top of the plot. Same helper, same
  // regression test, as the single-swimmer line chart.
  const [yFloor, yTop] = progressionYDomain([...allTimes, ...cutYs], wr);

  const cutLines: CutLine[] = overlay?.lines ?? [];
  const height = narrow ? 300 : 360;

  const summary = `Progression points for ${series
    .map((s) => s.name)
    .join(", ")}. ${allTimes.length} swims plotted; lower is faster.`;

  return (
    <div>
      <div
        aria-label={summary}
        role="img"
        style={{ width: "100%", height }}
      >
        <MaybeStatic reduced={reduced}>
          <ScatterChart
            animationDuration={CHART_ANIM_MS}
            aspectRatio=""
            className="h-full"
            data={rows}
            margin={{
              top: 12,
              right: narrow ? 20 : 28,
              bottom: 28,
              left: narrow ? 56 : 68,
            }}
            xDataKey="date"
            yDomain={[yFloor, yTop]}
          >
            <Grid
              horizontal
              stroke={CHART.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis numTicks={narrow ? 3 : 5} tickMode="domain" />
            <ValueAxis format={formatTime} label="Time" />
            {cutLines.length > 0 && (
              <GalaCutOverlay cuts={cutLines} strokeOpacity={0.9} />
            )}

            {/* Each Scatter registers its series — the y-scale, the tooltip rows
                and the hover-dim all come off it — but draws nothing, because
                SwimDots below paints the real marks. bklit's Scatter styles a
                whole series at once and could not tell a meet from a time trial
                or mark the PB (§5.6). This is the same split <Line> + <SwimDots>
                already uses on the single-swimmer chart. */}
            {keys.map((k) => (
              <Scatter
                dataKey={k.value}
                fill={k.color}
                key={k.value}
                radius={0}
                showActiveHighlight={false}
                strokeWidth={0}
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
                <ScatterTooltip
                  row={point as Record<string, unknown>}
                  keys={keys}
                />
              )}
            />
          </ScatterChart>
        </MaybeStatic>
      </div>
    </div>
  );
}

/* One row can hold a swim from several swimmers (they raced the same meet), so
   the tooltip lists every series that actually has a time on that date rather
   than guessing which one the pointer meant. */
function ScatterTooltip({
  row,
  keys,
}: {
  row: Record<string, unknown>;
  keys: Array<{ value: string; name: string; color: string }>;
}) {
  const date = row?.date;
  const present = keys.filter((k) => typeof row?.[k.value] === "number");
  if (present.length === 0) return null;

  return (
    <TooltipRows>
      <TooltipTitle>
        {date instanceof Date ? formatShortDate(date.toISOString().slice(0, 10)) : ""}
      </TooltipTitle>
      {present.map((k) => (
        <TooltipMeta key={k.value}>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-sm"
              style={{ background: k.color }}
            />
            {k.name}
            <span className="time tnum ml-1 font-medium text-ink">
              {formatTime(row[k.value] as number)}
            </span>
          </span>
        </TooltipMeta>
      ))}
    </TooltipRows>
  );
}
