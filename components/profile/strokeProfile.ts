// Stroke-profile wheel — shared types + pure geometry (Step 12.5).
//
// The numeric METRIC (a PB → calibrated ring-unit radius) lives in lib/swim
// (`computeCalibratedRadius`) so it is unit-tested and identical on the server.
// This module is only PIXELS: it turns the query's ring-unit values and the
// event ordering into SVG coordinates. No colour beyond the five stroke hues +
// neutral chrome; the reference rings are neutral grey (DESIGN.md §3b).
//
// The RING COUNT is not fixed. It comes from the galas the swimmer can enter, so
// it is 2-4 (never 5): SANS opens at 15 and SANY at 17 while L2/L3/SANJ close at
// 16, so no swimmer is ever eligible for all five at once.

import { GALA_SHORT } from "@/lib/galas";
import {
  STROKE_LABEL,
  type GalaCode,
  type RingScale,
  type Stroke,
} from "@/lib/swim";

// One event as returned by api.analysis.getStrokeProfile.
export type ProfileEvent = {
  distance: number;
  stroke: Stroke;
  label: string;
  pbMs: number | null;
  /** This event's cuts, inner ring → outer ring. Sparse: a 50 has fewer. */
  cuts: Array<{ gala: GalaCode; timeMs: number }>;
  calibratedRadius: number | null;
  highestGala: GalaCode | null;
  fullCoverage: boolean;
};

/** Look up one event's cut for a gala, or null when it has none. */
export function cutFor(event: ProfileEvent, gala: GalaCode): number | null {
  return event.cuts.find((c) => c.gala === gala)?.timeMs ?? null;
}

// ---------------------------------------------------------------------------
// Stroke identity — the five categorical hues (DESIGN.md §3b)
// ---------------------------------------------------------------------------

export const STROKE_META: Record<Stroke, { label: string; color: string }> = {
  FREE: { label: STROKE_LABEL.FREE, color: "var(--color-stroke-free)" },
  BACK: { label: STROKE_LABEL.BACK, color: "var(--color-stroke-back)" },
  BREAST: { label: STROKE_LABEL.BREAST, color: "var(--color-stroke-breast)" },
  FLY: { label: STROKE_LABEL.FLY, color: "var(--color-stroke-fly)" },
  IM: { label: STROKE_LABEL.IM, color: "var(--color-stroke-im)" },
};

/** Stroke display order — matches lib/swim STROKE_ORDER (Free→…→IM). */
export const WHEEL_STROKE_ORDER: ReadonlyArray<Stroke> = [
  "FREE",
  "BACK",
  "BREAST",
  "FLY",
  "IM",
];

/**
 * The wheel's reference rings, OUTERMOST (hardest) first — the order legends and
 * cut lists read in. Derived from the scale the query returned, so it is however
 * many rings this swimmer actually has.
 */
export function ringTiers(
  scale: RingScale,
): ReadonlyArray<{ tier: GalaCode; label: string }> {
  return [...scale.order]
    .reverse()
    .map((tier) => ({ tier, label: GALA_SHORT[tier] }));
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Polar → cartesian with 0° at 12 o'clock, increasing CLOCKWISE. */
export function polar(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path (outer stroke, no fill) from startAngle to endAngle, clockwise. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export type WheelLayout = ReturnType<typeof buildWheelLayout>;

export type WheelBar = {
  event: ProfileEvent;
  index: number;
  angle: number; // slot centre, degrees (0 = top, clockwise)
  slotStart: number;
  slotEnd: number;
  hasCut: (tier: GalaCode) => boolean;
  /** Bar tip radius in px (null when there is no PB — an empty spoke). */
  tipR: number | null;
};

export type StrokeArc = {
  stroke: Stroke;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  color: string;
  label: string;
  count: number;
};

/**
 * Turn an ordered event list + a pixel size into everything the wheel draws:
 * the centre, the px radius of any ring-unit value, the per-event bars, and the
 * per-stroke outer arcs. Presentational only — feed it the query's events in
 * the order the server returned them (already grouped by stroke), plus the ring
 * scale it returned alongside them.
 */
export function buildWheelLayout(
  events: ProfileEvent[],
  size: number,
  scale: RingScale,
) {
  const cx = size / 2;
  const cy = size / 2;

  // Radial scale: norm 0 = hub (centre disc), norm = ring count is the outermost
  // ring. A bar faster than the hardest cut extrapolates to `scale.max`; keep it
  // inside the label band. `pad` reserves room for the stroke labels + distance
  // ticks outside. With fewer rings each ring-unit is simply wider.
  const pad = Math.max(38, size * 0.13);
  const hub = Math.max(20, size * 0.08);
  const outer = size / 2 - pad; // the outermost ring
  const rings = Math.max(1, scale.order.length);
  const gap = (outer - hub) / rings; // px per ring unit
  const ringR = (norm: number) => hub + norm * gap;
  const maxBarR = ringR(scale.max);

  const n = events.length;
  const anglePer = n > 0 ? 360 / n : 360;
  const MIN_STUB = Math.max(4, gap * 0.16); // a below-L2 PB still shows a nub

  const bars: WheelBar[] = events.map((event, index) => {
    const slotStart = index * anglePer;
    const slotEnd = (index + 1) * anglePer;
    const angle = slotStart + anglePer / 2;

    let tipR: number | null = null;
    if (event.calibratedRadius !== null) {
      const raw = ringR(event.calibratedRadius);
      // Floor to a visible stub so a real (but sub-L2) PB never vanishes.
      tipR = event.calibratedRadius <= 0 ? hub + MIN_STUB : Math.max(raw, hub + MIN_STUB);
    }

    // A ring is drawn on this spoke only where the event actually has that
    // gala's cut — a 50 Free has no Level 3 or SANJ cut, so those arcs are
    // simply absent rather than faked.
    const hasCut = (t: GalaCode) => cutFor(event, t) !== null;

    return { event, index, angle, slotStart, slotEnd, hasCut, tipR };
  });

  // Contiguous stroke runs → one arc each (the events arrive grouped already).
  const arcs: StrokeArc[] = [];
  let i = 0;
  while (i < n) {
    const stroke = events[i].stroke;
    let j = i;
    while (j < n && events[j].stroke === stroke) j++;
    const startAngle = i * anglePer;
    const endAngle = j * anglePer;
    arcs.push({
      stroke,
      startAngle,
      endAngle,
      midAngle: (startAngle + endAngle) / 2,
      color: STROKE_META[stroke].color,
      label: STROKE_META[stroke].label,
      count: j - i,
    });
    i = j;
  }

  return {
    cx,
    cy,
    size,
    hub,
    gap,
    outer,
    anglePer,
    ringR,
    maxBarR,
    ringPos: scale.pos,
    bars,
    arcs,
  };
}
