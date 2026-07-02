"use client";

import { Check } from "lucide-react";

import {
  computeMatrixCell,
  formatTime,
  STROKE_RADIUS_MAX,
  STROKE_RING_POS,
  type Tier,
} from "@/lib/swim";
import { formatSeconds } from "@/lib/format";
import { TierBadge } from "@/components/ui/TierBadge";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useGrowIn } from "@/hooks/use-grow-in";
import { cn } from "@/lib/utils";

/*
  Qualifying progress (Step R3, BRD §5.11) — the per-event readiness view that
  replaces the old "% of cut" chart. Two shapes driven by the target toggle:

    • SINGLE TIER (L2 / L3 / SANJ) — one horizontal bar per event filling toward
      that tier's cut. Qualified events read as a full green bar + a check; the
      rest fill part-way in the brand accent with the exact gap ("2.1s to go").
      Sorted most-complete first.

    • ALL — one bar per event with the L2/L3/SANJ cuts as fixed calibrated zones
      (easiest → hardest, headroom beyond SANJ). The fill runs to the swimmer's
      calibrated PB position and is coloured by the HIGHEST tier met (base grey
      if none). Only the markers an event actually has are drawn (§4.9 coverage).
      Positions are shared across events, so bars are comparable at a glance.

  Both: LCM only, headline MEET PBs, tabular figures. The bar tracks are decorative
  (aria-hidden) — every number is carried in the row's text for assistive tech.
*/

// Short target label matching the TierBadge vocabulary.
const NEXT_LABEL: Record<Tier, string> = {
  SANJ: "SANJ",
  LEVEL_3: "L3",
  LEVEL_2: "L2",
};

// The swimmer's PB, drawn ONTO the coloured fill. The inside/outside choice is
// made in PIXELS, not a percentage guess: if the fill is physically wide enough
// to hold the time it rides inside, left-aligned, in a high-contrast on-fill
// colour; otherwise it sits just past the fill's end in ink. Measuring the real
// fill width is what keeps the time legible on a narrow phone bar (where a 30%
// fill can be only ~35px) as well as on a wide desktop one. Tabular throughout;
// decorative (aria-hidden) — the number is always carried in accessible row text.
const TIME_MIN_PX = 58; // ~7 tabular chars ("m:ss:hh") + padding

function BarTime({
  ms,
  fillPct,
  trackWidth,
  insideClass,
}: {
  ms: number;
  fillPct: number;
  trackWidth: number; // measured px width of the bar track
  insideClass: string; // on-fill text colour when the label rides inside
}) {
  const label = formatTime(ms);
  const fillPx = (trackWidth * fillPct) / 100;

  if (fillPx >= TIME_MIN_PX) {
    // Clip the label to the fill's width so it never bleeds onto the empty track.
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden"
        style={{ maxWidth: `${fillPct}%` }}
      >
        <span className={cn("time truncate pl-2.5 pr-1.5 text-2xs", insideClass)}>
          {label}
        </span>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="time pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-2xs text-ink"
      style={{ left: `${fillPct}%` }}
    >
      {label}
    </span>
  );
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

/** Progress toward the cut: 1 at or past the cut, else how near the PB is. */
function fillFraction(bar: SingleBar): number {
  if (bar.qualified) return 1;
  return Math.max(0, Math.min(1, bar.cutMs / bar.pbMs));
}

export function SingleTierProgress({ bars }: { bars: SingleBar[] }) {
  // Most complete first; among equals, the smaller gap (closer to the cut).
  const ordered = [...bars].sort((a, b) => {
    const fa = fillFraction(a);
    const fb = fillFraction(b);
    if (fa !== fb) return fb - fa;
    return a.gapMs - b.gapMs;
  });

  return (
    <ul className="flex flex-col divide-y divide-gray-100">
      {ordered.map((b) => (
        <SingleBarRow key={b.key} bar={b} />
      ))}
    </ul>
  );
}

function SingleBarRow({ bar: b }: { bar: SingleBar }) {
  const pct = Math.round(fillFraction(b) * 100);
  const [trackRef, trackWidth] = useContainerWidth(320);
  const grown = useGrowIn();

  return (
    <li className="flex items-center gap-3 py-3 sm:gap-4">
      <div className="w-20 shrink-0 sm:w-28">
        <div className="font-medium text-ink">{b.label}</div>
        <div className="time tnum mt-0.5 text-xs text-ink-faint">
          {formatTime(b.pbMs)} → {formatTime(b.cutMs)}
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-7 min-w-16 flex-1 overflow-hidden rounded-md bg-gray-100"
        aria-hidden
      >
        <div
          className="h-full rounded-md transition-[width] [transition-duration:var(--dur-3)] [transition-timing-function:var(--ease-out)]"
          style={{
            width: `${grown ? Math.max(2, pct) : 0}%`,
            background: b.qualified
              ? "var(--color-qualified)"
              : "var(--color-brand-500)",
          }}
        />
        <BarTime
          ms={b.pbMs}
          fillPct={pct}
          trackWidth={trackWidth}
          insideClass="text-white"
        />
      </div>

      <div className="w-20 shrink-0 text-right sm:w-28">
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
  l2Ms: number | null;
  l3Ms: number | null;
  sanjMs: number | null;
  calibratedRadius: number | null; // PB on the shared L2→L3→SANJ ring scale
};

// Fixed positions on the shared scale (ring units → % of track). L2/L3/SANJ sit
// at ring 1/2/3; the track runs to STROKE_RADIUS_MAX so there is headroom past
// SANJ. Because these are FIXED, every event's bar is directly comparable.
const RING_POS: Record<Tier, number> = STROKE_RING_POS;
const posPct = (ringUnits: number) =>
  (Math.max(0, Math.min(STROKE_RADIUS_MAX, ringUnits)) / STROKE_RADIUS_MAX) * 100;

const TIER_FILL: Record<Tier, string> = {
  SANJ: "var(--color-tier-sanj)",
  LEVEL_3: "var(--color-tier-l3)",
  LEVEL_2: "var(--color-tier-l2)",
};
const TIER_TINT: Record<Tier, string> = {
  SANJ: "var(--color-tier-sanj-bg)",
  LEVEL_3: "var(--color-tier-l3-bg)",
  LEVEL_2: "var(--color-tier-l2-bg)",
};
const NONE_FILL = "var(--color-tier-none)";

// Easiest → hardest, matching left → right on the track.
const ASC_TIERS: ReadonlyArray<Tier> = ["LEVEL_2", "LEVEL_3", "SANJ"];

function tierRank(t: Tier | null): number {
  return t === "SANJ" ? 3 : t === "LEVEL_3" ? 2 : t === "LEVEL_2" ? 1 : 0;
}

type AllRow = AllBar & {
  cutsByTier: { LEVEL_2: number | null; LEVEL_3: number | null; SANJ: number | null };
  present: Tier[]; // tiers this event actually has a cut for (§4.9 coverage)
  tier: Tier | null; // highest tier met
  nextTier: Tier | null;
  gapMs: number | null;
};

export function AllTierProgress({ bars }: { bars: AllBar[] }) {
  const rows: AllRow[] = bars.map((b) => {
    const cutsByTier = { LEVEL_2: b.l2Ms, LEVEL_3: b.l3Ms, SANJ: b.sanjMs };
    const cell = computeMatrixCell(b.pbMs, cutsByTier);
    const present = ASC_TIERS.filter((t) => cutsByTier[t] !== null);
    return {
      ...b,
      cutsByTier,
      present,
      tier: cell.tier,
      nextTier: cell.nextTier,
      gapMs: cell.gapMs,
    };
  });

  // Highest tier met first (SANJ → none); within a tier, those who've met the
  // hardest available cut lead, then the rest by closeness to the next tier.
  // Events with no meet time trail.
  rows.sort((a, b) => {
    const pa = a.pbMs !== null ? 0 : 1;
    const pb = b.pbMs !== null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ra = tierRank(a.tier);
    const rb = tierRank(b.tier);
    if (ra !== rb) return rb - ra;
    const ta = a.nextTier === null ? 0 : 1;
    const tb = b.nextTier === null ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return (a.gapMs ?? 0) - (b.gapMs ?? 0);
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Shared scale header — the three tier positions are fixed, so one axis
          labels them for every bar below. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-20 shrink-0 sm:w-28" />
        <div className="relative h-4 min-w-16 flex-1" aria-hidden>
          {ASC_TIERS.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-2xs font-medium text-ink-faint"
              style={{ left: `${posPct(RING_POS[t])}%` }}
            >
              {NEXT_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="w-20 shrink-0 sm:w-28" />
      </div>

      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((r) => (
          <AllRowView key={r.key} row={r} />
        ))}
      </ul>
    </div>
  );
}

function AllRowView({ row }: { row: AllRow }) {
  const hasPb = row.pbMs !== null;
  const fillPct = hasPb ? posPct(row.calibratedRadius ?? 0) : 0;
  const fillColor = row.tier ? TIER_FILL[row.tier] : NONE_FILL;
  const [trackRef, trackWidth] = useContainerWidth(320);
  const grown = useGrowIn();
  // On-fill text colour tuned per fill for contrast: white on the deep L3/L2
  // fills, near-black on the light gold (SANJ) and grey (no-tier) fills.
  const insideClass =
    row.tier === "LEVEL_3" || row.tier === "LEVEL_2"
      ? "text-white"
      : "text-gray-900";

  // Faint zone tints: each present tier tints the band leading up to its marker;
  // the region past the hardest present tier is neutral headroom.
  const bands: { from: number; to: number; color: string }[] = [];
  let prev = 0;
  for (const t of row.present) {
    const p = posPct(RING_POS[t]);
    bands.push({ from: prev, to: p, color: TIER_TINT[t] });
    prev = p;
  }
  bands.push({ from: prev, to: 100, color: "var(--color-gray-50)" });

  return (
    <li className="flex items-center gap-3 py-3 sm:gap-4">
      <div className="flex w-20 shrink-0 flex-col gap-1 sm:w-28">
        <span className="font-medium text-ink">{row.label}</span>
        <TierBadge tier={row.tier ?? "NONE"} />
        {hasPb && (
          <span className="sr-only">PB {formatTime(row.pbMs as number)}</span>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative h-7 min-w-16 flex-1 overflow-hidden rounded-md bg-gray-100"
        aria-hidden
      >
        {/* zone tints */}
        {bands.map((band, i) => (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{
              left: `${band.from}%`,
              width: `${band.to - band.from}%`,
              background: band.color,
            }}
          />
        ))}
        {/* PB fill */}
        {hasPb && (
          <div
            className="absolute inset-y-0 left-0 rounded-r-md transition-[width] [transition-duration:var(--dur-3)] [transition-timing-function:var(--ease-out)]"
            style={{ width: `${grown ? Math.max(2, fillPct) : 0}%`, background: fillColor }}
          />
        )}
        {/* PB time, drawn on (or just past) the fill */}
        {hasPb && (
          <BarTime
            ms={row.pbMs as number}
            fillPct={fillPct}
            trackWidth={trackWidth}
            insideClass={insideClass}
          />
        )}
        {/* tier markers (only where a cut exists) */}
        {row.present.map((t) => (
          <div
            key={t}
            className="absolute inset-y-0 w-px bg-ink/25"
            style={{ left: `${posPct(RING_POS[t])}%` }}
          />
        ))}
      </div>

      <div className="w-20 shrink-0 text-right text-xs sm:w-28">
        {!hasPb ? (
          <span className="text-ink-faint">No time</span>
        ) : row.nextTier && row.gapMs !== null ? (
          <span className="font-medium tabular-nums text-ink">
            {formatSeconds(row.gapMs)}s to {NEXT_LABEL[row.nextTier]}
          </span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1 text-success-ink">
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
            <span>Top tier</span>
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

export function AllTierLegend() {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs text-ink-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium text-ink-muted">Highest tier met</span>
        {ASC_TIERS.slice()
          .reverse()
          .map((t) => (
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
        Faint bands are the L2 / L3 / SANJ zones (only those an event has); the
        fill runs to the swimmer’s PB on one shared scale, so bars compare
        directly.
      </p>
    </div>
  );
}
