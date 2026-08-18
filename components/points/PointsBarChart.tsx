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
} from "@/components/charts/swim";

import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import type { ScoredEvent } from "@/lib/points";
import {
  eventKey,
  eventLabels,
  eventsByKey,
  pointsBars,
  pointsDomain,
  strokesPresent,
} from "./pointsRows";

/*
  World Aquatics points per event, strongest first.

  This is the one chart in the app whose bars are comparable ACROSS events: a
  200 breast and a 50 free are the same length when they are equally good swims.
  So the axis is fixed 0–1000 rather than scaled to the swimmer — a shrink-to-fit
  axis would make a 400-point swimmer's chart identical to a 900-point
  swimmer's, destroying exactly the comparison the chart exists for.

  LONGER = BETTER here, which is the opposite of the comparison and gap charts,
  where a bar length is a TIME and shorter is faster. That inversion is safe
  because the quantity is different and named on the axis, and because every bar
  carries its own number — nothing is read off length alone.

  NO reference lines. An earlier revision drew dashed markers at 400/600/800 as
  "rulers" for short bars, with a caption insisting they were not qualifying
  cuts. Rendering it showed the value axis already prints 0/200/…/1000 with a
  gridline at each, so the markers reprinted numbers the axis was showing and
  the caption existed only to defend an ambiguous mark. The axis is the ruler.
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

export function PointsBarChart({ events }: { events: ScoredEvent[] }) {
  const reduced = usePrefersReducedMotion();
  const narrow = useMediaQuery("(max-width: 639px)");

  const rowHeight = 44;
  const height = Math.max(160, events.length * rowHeight + 48);

  const labels = eventLabels(events);
  const rows = eventsByKey(events);
  const longest = events.reduce((m, e) => Math.max(m, e.label.length), 0);
  const yWidth = narrow
    ? Math.min(92, Math.max(64, longest * 7.5))
    : Math.min(150, Math.max(72, longest * 7.5));

  const domain = pointsDomain(events.map((e) => e.points));
  const bars = pointsBars(events);

  // BarChart's band scale takes the data in order, so the bar order is the
  // order `scoreEventPbs` returned: strongest at the top. Rows key on the
  // event, never the label: scaleBand interns its domain, so two events sharing
  // a label would collapse into one band.
  const data = events.map((e) => ({ ...e, key: eventKey(e) }));

  return (
    <div className="flex flex-col gap-4">
      {/* Decorative: the breakdown table below carries the same numbers for
          assistive tech, so the SVG is hidden from the a11y tree. */}
      <div style={{ width: "100%", height }} aria-hidden="true">
        <MaybeStatic reduced={reduced}>
          <BarChart
            animationDuration={CHART_ANIM_MS}
            aspectRatio=""
            barGap={0.28}
            className="h-full"
            data={data}
            margin={{ top: 4, right: narrow ? 44 : 56, bottom: 24, left: yWidth }}
            orientation="horizontal"
            // Bars come from SwimBars, not <Bar>, so bklit finds no dataKey to
            // scan and would fall back to [0, 110]. Fixed 0–1000 is the point of
            // the chart; `pointsDomain` only raises the top for a swim past the
            // base time, which must not be clipped off its own chart.
            valueDomain={domain}
            xDataKey="key"
          >
            <Grid
              horizontal={false}
              stroke={CHART.grid}
              strokeDasharray="3 3"
              vertical
            />
            {/* On a horizontal bar chart bklit's BarYAxis is the CATEGORY axis,
                and the value axis carries no labels at all — hence ValueAxis. */}
            <BarYAxis
              labelFor={(key) => labels.get(key) ?? key}
              maxLabelWidth={yWidth - 8}
            />
            <ValueAxis format={(v) => String(Math.round(v))} label="Points" />
            <SwimBars bars={bars} labelColor={CHART.ink} maxBarSize={26} />
            <ChartTooltip
              panelStyle={SWIM_TOOLTIP_PANEL}
              showDots={false}
              content={({ point }) => {
                const row = point as unknown as { key?: string };
                const e = row?.key ? rows.get(row.key) : undefined;
                return e ? <PointsTooltip event={e} /> : null;
              }}
            />
          </BarChart>
        </MaybeStatic>
      </div>

      <StrokeLegend events={events} />
    </div>
  );
}

/** Colour key for the stroke fills. Colour is never the only channel — the
    event name sits on every bar's axis label — but the legend names it. */
function StrokeLegend({ events }: { events: ScoredEvent[] }) {
  const strokes = strokesPresent(events);
  if (strokes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="font-medium text-ink-muted">Stroke</span>
      {strokes.map((s) => (
        <span key={s.stroke} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-sm"
            style={{ background: s.color }}
          />
          <span className="font-medium text-ink">{s.label}</span>
        </span>
      ))}
    </div>
  );
}

/* bklit hands `content` the hovered data row; the card is bklit's TooltipBox
   and only the stack inside it is ours. */
function PointsTooltip({ event }: { event: ScoredEvent }) {
  return (
    <TooltipRows>
      <TooltipTitle>{event.label}</TooltipTitle>
      <TooltipValue>{event.points} pts</TooltipValue>
      <TooltipMeta>
        <span className="tabular-nums">{formatTime(event.timeMs)}</span>
      </TooltipMeta>
      <TooltipMeta>
        <span>
          {formatShortDate(event.swimDate)}
          {event.meetName ? ` · ${event.meetName}` : ""}
        </span>
      </TooltipMeta>
    </TooltipRows>
  );
}
