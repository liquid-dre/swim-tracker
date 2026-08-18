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
  TierPatterns,
  useTierPatternIds,
  ValueAxis,
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
  fillFraction,
  ringZoneBands,
  HEADROOM_FILL,
  NONE_FILL,
  TIER_FILL,
  TIER_TINT,
} from "./roadBars";

/*
  Qualifying progress (Step R3, BRD §5.11) — the per-event readiness view. Two
  shapes driven by the target toggle, both now bklit bar charts over the same
  stack /compare uses, each with the figures listed beneath it:

    • SINGLE GALA — one bar per event filling toward that gala's cut, in the
      course the swimmer is nearest in. The cut is a threshold line at 100%, so
      a bar reaching it has qualified; those bars turn green and carry a check
      in the list. Ordered 50→ by distance, then IM, Free, Back, Breast, Fly.

    • ALL — one bar per event on the shared calibrated ring scale, with each
      gala's cut as a threshold line. Because `computeCalibratedRadius` puts
      every event on ONE scale in ring units, a single set of lines labels every
      bar — which is exactly what ValueThresholds is for. The fill runs to the
      swimmer's calibrated PB and is coloured by the HIGHEST gala met.

      The tinted ZONES are per event, not chart-wide (ValueZones): coverage is
      per event (§4.9), so an event with no L3 cut gets neutral track over that
      range rather than a borrowed tint. Drawing the band anyway would invent a
      standard the event does not have.

  Both: headline MEET PBs, tabular figures. The charts are decorative and hidden
  from assistive tech — every number in them is carried in the list below, which
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
// Single-tier progress
// ---------------------------------------------------------------------------

export type SingleBar = {
  key: string;
  label: string;
  pbMs: number;
  cutMs: number;
  gapMs: number; // pbMs − cutMs (≤ 0 when qualified)
  qualified: boolean;
};

/**
 * The value scale runs a little past the cut so the threshold line sits inside
 * the plot rather than on the right-hand edge, where it would read as the axis
 * instead of as the standard a bar has to reach.
 */
const SINGLE_DOMAIN_MAX = 112;

type SingleDatum = SingleBar & { pct: number };

export function SingleTierProgress({
  bars,
  gala,
}: {
  bars: SingleBar[];
  /** The target gala, so the threshold line can name the cut it marks. */
  gala: GalaCode;
}) {
  // Fixed event order: 50→ by distance, then IM, Free, Back, Breast, Fly. (Every
  // bar here has a time; no-time events are listed separately by the screen.)
  const ordered = [...bars].sort(byEventOrder);
  const data: SingleDatum[] = ordered.map((b) => ({
    ...b,
    pct: fillFraction(b) * 100,
  }));

  return (
    <div className="flex flex-col gap-4">
      <SingleTierChart data={data} gala={gala} />
      <ul className="flex flex-col divide-y divide-gray-100">
        {ordered.map((b) => (
          <SingleBarRow key={b.key} bar={b} gala={gala} />
        ))}
      </ul>
    </div>
  );
}

function SingleTierChart({
  data,
  gala,
}: {
  data: SingleDatum[];
  gala: GalaCode;
}) {
  const reduced = usePrefersReducedMotion();
  const { narrow, height, yWidth } = useChartBox(data.map((d) => d.label));

  if (data.length === 0) return null;

  const st = TIER_STYLE[gala];
  const swimBars: SwimBar[] = data.map((d) => ({
    key: d.key,
    category: d.label,
    value: d.pct,
    // Green once the cut is met, brand accent while still chasing — the same
    // two-state colouring the list's check mark carries in words.
    fill: d.qualified ? "var(--color-qualified)" : CHART.accent,
    label: formatTime(d.pbMs),
  }));

  const thresholds: Threshold[] = [
    {
      key: gala,
      value: 100,
      color: st.color,
      ink: st.ink,
      dash: st.dash,
      // Glyph + label: a gala is never colour-only (DESIGN.md §3).
      label: `${st.glyph} ${st.label} cut`,
    },
  ];

  return (
    // Decorative: the list beneath carries every time, gap and qualified state.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <MaybeStatic reduced={reduced}>
        <BarChart
          animationDuration={CHART_ANIM_MS}
          aspectRatio=""
          barGap={0.28}
          data={data}
          margin={{ top: 22, right: narrow ? 56 : 76, bottom: 24, left: yWidth }}
          className="h-full"
          orientation="horizontal"
          // Bars come from SwimBars, not <Bar>, so bklit finds no dataKey to
          // scan and would fall back to [0, 110].
          valueDomain={[0, SINGLE_DOMAIN_MAX]}
          xDataKey="label"
        >
          <Grid horizontal={false} stroke={CHART.grid} strokeDasharray="3 3" vertical />
          <BarYAxis maxLabelWidth={yWidth - 8} />
          <ValueAxis format={(v) => `${Math.round(v)}%`} label="Of the cut" />
          <ValueThresholds thresholds={thresholds} />
          <SwimBars bars={swimBars} labelColor={CHART.ink} maxBarSize={22} />
          <ChartTooltip
            panelStyle={SWIM_TOOLTIP_PANEL}
            showDots={false}
            content={({ point }) => (
              <SingleTooltip row={point as unknown as SingleDatum} gala={gala} />
            )}
          />
        </BarChart>
      </MaybeStatic>
    </div>
  );
}

function SingleTooltip({ row, gala }: { row: SingleDatum; gala: GalaCode }) {
  if (!row?.label) return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.label}</TooltipTitle>
      <TooltipValue>{formatTime(row.pbMs)}</TooltipValue>
      <TooltipMeta>
        <span>
          {GALA_MEDIUM[gala]} cut {formatTime(row.cutMs)}
          {row.qualified
            ? " · qualified"
            : ` · ${formatSeconds(row.gapMs)}s to go`}
        </span>
      </TooltipMeta>
    </TooltipRows>
  );
}

function SingleBarRow({ bar: b, gala }: { bar: SingleBar; gala: GalaCode }) {
  return (
    <li className="flex items-center gap-3 py-2.5 sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{b.label}</div>
        <div className="time tnum mt-0.5 text-xs text-ink-faint">
          {formatTime(b.pbMs)} → {formatTime(b.cutMs)}
          <span className="sr-only"> ({GALA_MEDIUM[gala]} cut)</span>
        </div>
      </div>

      <div className="w-24 shrink-0 text-right sm:w-28">
        {b.qualified ? (
          <span className="inline-flex items-center justify-end gap-1 font-medium text-success-ink">
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
            Qualified
          </span>
        ) : (
          <div className="font-medium tabular-nums text-ink">
            {formatSeconds(b.gapMs)}s to go
          </div>
        )}
      </div>
    </li>
  );
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
  const { narrow, height, yWidth } = useChartBox(rows.map((r) => r.label));
  const idFor = useTierPatternIds();

  if (rows.length === 0 || scale.max <= 0) return null;

  const swimBars: SwimBar[] = rows
    .filter((r) => r.pbMs !== null && r.calibratedRadius !== null)
    .map((r) => ({
      key: r.key,
      category: r.label,
      value: r.calibratedRadius as number,
      // Textured fill so the gala is not carried by hue alone (TierPatterns).
      // "No gala met" stays flat grey — it is an absence, not a tier.
      fill: r.gala ? `url(#${idFor(r.gala)})` : NONE_FILL,
      label: formatTime(r.pbMs as number),
    }));

  // Per-event zones: only the galas THIS event has a cut for tint their range.
  const zones: CategoryZones[] = rows.map((r) => ({
    key: r.key,
    category: r.label,
    bands: ringZoneBands(r.present, scale).map((b) => ({
      from: b.from,
      to: b.to,
      color: b.gala ? TIER_TINT[b.gala] : HEADROOM_FILL,
    })),
  }));

  // Only define patterns for galas actually painted on a bar.
  const patternTiers = Array.from(
    new Set(rows.map((r) => r.gala).filter((g): g is GalaCode => g !== null)),
  );

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
          data={rows}
          margin={{ top: 22, right: narrow ? 56 : 76, bottom: 12, left: yWidth }}
          className="h-full"
          orientation="horizontal"
          // Ring units on the shared calibrated scale, not milliseconds — raw
          // times across different events would not share an axis (§4.9).
          valueDomain={[0, scale.max]}
          xDataKey="label"
        >
          <TierPatterns idFor={idFor} tiers={patternTiers} />
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

export function SingleTierLegend({ tierLabel }: { tierLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: "var(--color-qualified)" }}
        />
        Qualified (PB ≤ cut)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: "var(--color-brand-500)" }}
        />
        Still chasing {tierLabel}
      </span>
      <span className="text-ink-faint">
        Bar fills toward the cut · the gap is the time left to drop.
      </span>
    </div>
  );
}

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
