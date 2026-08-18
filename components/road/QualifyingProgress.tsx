"use client";

import { Check } from "lucide-react";

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
  ValueThresholds,
  ValueZones,
  type CategoryZones,
  type SwimBar,
  type Threshold,
} from "@/components/charts/swim";

import {
  computeMatrixCell,
  formatTime,
  type GalaCode,
  type RingScale,
} from "@/lib/swim";
import { GALA_MEDIUM, GALA_SHORT } from "@/lib/galas";
import { formatSeconds } from "@/lib/format";
import { TierBadge } from "@/components/ui/TierBadge";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CHART, CHART_ANIM_MS, TIER_STYLE } from "@/components/analysis/chartTheme";
import {
  byEventOrder,
  ringZoneBands,
  HEADROOM_FILL,
  NONE_FILL,
  TIER_FILL,
  TIER_TINT,
} from "./roadBars";

/*
  All-gala qualifying progress (Step R3, BRD §5.11) — one bar per event on the
  shared calibrated ring scale, with each gala's cut as a threshold line.
  Because `computeCalibratedRadius` puts every event on ONE scale in ring units,
  a single set of lines labels every bar, which is exactly what ValueThresholds
  is for. The fill runs to the swimmer's calibrated PB and is coloured by the
  HIGHEST gala met.

  The tinted ZONES are per event, not chart-wide (ValueZones): coverage is per
  event (§4.9), so an event with no L3 cut gets neutral track over that range
  rather than a borrowed tint. Drawing the band anyway would invent a standard
  the event does not have.

  The single-gala view has no chart of its own. It used to, and it encoded the
  same events as RoadGapChart with the opposite length semantics; worse, its
  value (cut/pb, clamped) put every bar within a few percent of the same length,
  so it could not discriminate 0.2s-to-go from 4s-to-go. RoadGapChart answers
  that question, and qualified events fold into it at zero.

  Headline MEET PBs, tabular figures. The chart is decorative and hidden
  from assistive tech — every number in it is carried in the list below, which
  is also where the tier badges and the gap-to-next-gala text live.
*/

const NEXT_LABEL = GALA_SHORT;

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

/**
 * Plot box for a road chart: tall enough for one row per event, with a category
 * gutter sized to the longest event label. Event labels are short and bounded
 * ("1500 Free"), so unlike the swimmer-name charts this never needs to clamp
 * hard on a phone.
 */
function useChartBox(labels: ReadonlyArray<string>) {
  const narrow = useMediaQuery("(max-width: 639px)");
  const rowHeight = 40;
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  return {
    narrow,
    height: Math.max(160, labels.length * rowHeight + 52),
    yWidth: narrow
      ? Math.min(96, Math.max(64, longest * 7.5))
      : Math.min(140, Math.max(72, longest * 7.5)),
  };
}

// ---------------------------------------------------------------------------
// All-tier progress (zones)
// ---------------------------------------------------------------------------

export type AllBar = {
  key: string;
  label: string;
  pbMs: number | null;
  /** This event's cuts, inner ring → outer ring. Sparse: a 50 has fewer. */
  cuts: Array<{ gala: GalaCode; timeMs: number }>;
  calibratedRadius: number | null; // PB on the shared ring scale
};

type AllRow = AllBar & {
  cutsByTier: Partial<Record<GalaCode, number>>;
  present: GalaCode[]; // galas this event actually has a cut for (§4.9 coverage)
  gala: GalaCode | null; // highest gala met
  nextGala: GalaCode | null;
  gapMs: number | null;
};

/**
 * Resolve each event's coverage and its highest gala met, then order events
 * with a time above those without, each group in the fixed event order.
 */
function deriveAllRows(bars: AllBar[], scale: RingScale): AllRow[] {
  const rows: AllRow[] = bars.map((b) => {
    const cutsByTier: Partial<Record<GalaCode, number>> = {};
    for (const c of b.cuts) cutsByTier[c.gala] = c.timeMs;
    // The stroke-profile data is long course, so judge it as long course — a
    // borrowed cut would be exactly the bug this view exists to avoid.
    const cell = computeMatrixCell({ LCM: b.pbMs }, { LCM: cutsByTier, SCM: {} }, "LCM");
    return {
      ...b,
      cutsByTier,
      present: scale.order.filter((t) => cutsByTier[t] !== undefined),
      gala: cell.gala,
      nextGala: cell.nextGala,
      gapMs: cell.gapMs,
    };
  });

  rows.sort((a, b) => {
    const pa = a.pbMs !== null ? 0 : 1;
    const pb = b.pbMs !== null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return byEventOrder(a, b);
  });
  return rows;
}

export function AllTierProgress({
  bars,
  scale,
}: {
  bars: AllBar[];
  /** The ring layout from `getStrokeProfile` — how many zones this track has. */
  scale: RingScale;
}) {
  const rows = deriveAllRows(bars, scale);

  return (
    <div className="flex flex-col gap-4">
      <AllTierChart rows={rows} scale={scale} />
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((r) => (
          <AllRowView key={r.key} row={r} />
        ))}
      </ul>
    </div>
  );
}

function AllTierChart({ rows, scale }: { rows: AllRow[]; scale: RingScale }) {
  const reduced = usePrefersReducedMotion();
  /*
    Only events with a time are plotted. A no-time event used to get a category
    label and tinted zone bands with no bar and nothing saying why — a row that
    looks like a zero rather than an absence. The list beneath names them
    explicitly ("No time"), which is the honest place for it.
  */
  const plotted = rows.filter((r) => r.pbMs !== null && r.calibratedRadius !== null);
  const { narrow, height, yWidth } = useChartBox(plotted.map((r) => r.label));

  if (plotted.length === 0 || scale.max <= 0) return null;

  const swimBars: SwimBar[] = plotted.map((r) => ({
      key: r.key,
      category: r.label,
      value: r.calibratedRadius as number,
      fill: r.gala ? TIER_FILL[r.gala] : NONE_FILL,
      label: formatTime(r.pbMs as number),
    }));

  // Per-event zones: only the galas THIS event has a cut for tint their range.
  const zones: CategoryZones[] = plotted.map((r) => ({
    key: r.key,
    category: r.label,
    bands: ringZoneBands(r.present, scale).map((b) => ({
      from: b.from,
      to: b.to,
      color: b.gala ? TIER_TINT[b.gala] : HEADROOM_FILL,
    })),
  }));

  // One set of markers for every bar — the ring positions are a property of the
  // shared scale, which is what makes the bars comparable across events.
  const thresholds: Threshold[] = scale.order.map((t) => {
    const st = TIER_STYLE[t];
    return {
      key: t,
      value: scale.pos[t] ?? 0,
      color: st.color,
      ink: st.ink,
      dash: st.dash,
      glyph: st.glyph,
      label: `${st.glyph} ${st.label}`,
    };
  });

  return (
    // Decorative: the list beneath carries the PB, the tier badge and the gap.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <MaybeStatic reduced={reduced}>
        <BarChart
          animationDuration={CHART_ANIM_MS}
          aspectRatio=""
          barGap={0.28}
          data={plotted}
          // 34, not 22: ValueThresholds staggers its labels onto two rows.
          margin={{ top: 34, right: narrow ? 56 : 76, bottom: 12, left: yWidth }}
          className="h-full"
          orientation="horizontal"
          // Ring units on the shared calibrated scale, not milliseconds — raw
          // times across different events would not share an axis (§4.9).
          valueDomain={[0, scale.max]}
          xDataKey="label"
        >
          <Grid horizontal={false} stroke={CHART.grid} strokeDasharray="3 3" vertical />
          <BarYAxis maxLabelWidth={yWidth - 8} />
          {/* No ValueAxis: ring units are positions, not quantities — printing
              "2.5" under a bar would invite reading it as a time or a score. */}
          <ValueZones zones={zones} maxBarSize={22} />
          <ValueThresholds thresholds={thresholds} />
          <SwimBars bars={swimBars} labelColor={CHART.ink} maxBarSize={22} />
          <ChartTooltip
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => <AllTooltip row={point as unknown as AllRow} />}
          />
        </BarChart>
      </MaybeStatic>
    </div>
  );
}

function AllTooltip({ row }: { row: AllRow }) {
  if (!row?.label) return null;
  const nextCut =
    row.nextGala !== null ? (row.cutsByTier[row.nextGala] ?? null) : null;

  return (
    <TooltipRows>
      <TooltipTitle>{row.label}</TooltipTitle>
      <TooltipValue>
        {row.pbMs !== null ? formatTime(row.pbMs) : "No time yet"}
      </TooltipValue>
      <TooltipMeta>
        {row.nextGala !== null && nextCut !== null ? (
          <span>
            {GALA_MEDIUM[row.nextGala]} cut {formatTime(nextCut)}
            {row.gapMs !== null ? ` · ${formatSeconds(row.gapMs)}s to go` : ""}
          </span>
        ) : (
          <span>Fastest gala achieved</span>
        )}
      </TooltipMeta>
    </TooltipRows>
  );
}

function AllRowView({ row }: { row: AllRow }) {
  const hasPb = row.pbMs !== null;
  const nextCut =
    row.nextGala !== null ? (row.cutsByTier[row.nextGala] ?? null) : null;

  return (
    <li className="flex items-center gap-3 py-2.5 sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-ink">{row.label}</span>
        <TierBadge gala={row.gala ?? "NONE"} />
        {hasPb && (
          <span className="time tnum text-xs text-ink-faint">
            {formatTime(row.pbMs as number)}
          </span>
        )}
        {/* The target cut in words, so the figure the chart's tooltip shows on
            hover is also readable without a pointer. */}
        {row.nextGala !== null && nextCut !== null && (
          <span className="time tnum text-xs text-ink-faint">
            · {NEXT_LABEL[row.nextGala]} {formatTime(nextCut)}
          </span>
        )}
      </div>

      <div className="w-24 shrink-0 text-right text-xs sm:w-28">
        {!hasPb ? (
          <span className="text-ink-faint">No time</span>
        ) : row.nextGala && row.gapMs !== null ? (
          <span className="font-medium tabular-nums text-ink">
            {formatSeconds(row.gapMs)}s to {NEXT_LABEL[row.nextGala]}
          </span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1 text-success-ink">
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
            <span>Top gala</span>
          </span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Legends
// ---------------------------------------------------------------------------

export function AllTierLegend({ scale }: { scale: RingScale }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs text-ink-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium text-ink-muted">Highest gala met</span>
        {[...scale.order].reverse().map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ background: TIER_FILL[t] }}
            />
            {NEXT_LABEL[t]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-sm"
            style={{ background: NONE_FILL }}
          />
          None yet
        </span>
      </div>
      <p className="text-ink-faint">
        Faint bands are the zones an event actually has a cut for; the fill runs
        to the swimmer’s PB on one shared scale, so bars compare directly.
      </p>
    </div>
  );
}
