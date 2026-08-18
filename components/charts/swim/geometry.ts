import type { CutLine } from "./GalaCutOverlay";

/*
  The arithmetic behind ValueAxis and GalaCutOverlay, pulled out of the
  components so it can be tested without a DOM. The components keep only the
  scale lookups and the SVG/portal rendering; every decision that could be wrong
  in a way a reader would notice lives here.
*/

// ---------------------------------------------------------------------------
// ValueAxis
// ---------------------------------------------------------------------------

export type ValueTick = { value: number; label: string };

/**
 * Label the scale's tick values, dropping any that read the same as one already
 * shown.
 *
 * Swim times make this necessary rather than tidy: `formatTime` renders
 * hundredths, so on a tight domain `d3` can hand back several tick values that
 * format to the same `m:ss:hh` string. Drawing all of them stacks identical
 * labels on top of each other and thickens the text. The FIRST value wins, so
 * the surviving label still sits on a real gridline.
 */
export function pickValueTicks(
  values: ReadonlyArray<number>,
  format: (value: number) => string,
): ValueTick[] {
  const seen = new Set<string>();
  const out: ValueTick[] = [];
  for (const value of values) {
    const label = format(value);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ value, label });
  }
  return out;
}

/** Rough px width of a tick label, plus the breathing room it needs. */
export function tickLabelWidth(label: string): number {
  return label.length * 7 + 10;
}

/**
 * Thin an ALREADY-POSITIONED tick list so no label overprints its neighbour.
 *
 * `numTicks` asks d3 for a count; d3 nices it and knows nothing about how wide
 * the labels turn out. A swim-time axis formats `0:20:00` — seven characters —
 * so five ticks on a narrow plot renders `0:00:0020:00:0040:01…`, which is what
 * /compare shipped. Dropping a tick is always better than printing two on top
 * of each other: the grid lines still mark the intervals.
 *
 * Thinning takes every Nth tick rather than dropping crowded ones one at a
 * time, because d3 hands back an evenly spaced list and a reader assumes the
 * survivors are evenly spaced too. Greedy dropping broke that: /season kept
 * 0% / 4% / 10%, three labels at two different intervals, which reads as a
 * non-linear axis. Counting back from the LAST tick keeps the axis maximum,
 * since an axis that stops short of its own top reads as truncated.
 */
export function thinTicks<T extends { label: string; pos: number }>(
  ticks: ReadonlyArray<T>,
): T[] {
  if (ticks.length <= 1) return [...ticks];

  const sorted = [...ticks].sort((a, b) => a.pos - b.pos);
  const clears = (a: T, b: T) =>
    b.pos - a.pos >= (tickLabelWidth(a.label) + tickLabelWidth(b.label)) / 2;

  for (let stride = 1; stride < sorted.length; stride++) {
    const kept: T[] = [];
    for (let i = sorted.length - 1; i >= 0; i -= stride) kept.unshift(sorted[i]);
    if (kept.every((tick, i) => i === 0 || clears(kept[i - 1], tick))) return kept;
  }

  // Even first-and-last collide: one label beats two on top of each other.
  return [sorted[sorted.length - 1]];
}

// ---------------------------------------------------------------------------
// GalaCutOverlay
// ---------------------------------------------------------------------------

/** One drawn line in plot pixels. */
export type Segment = { x1: number; x2: number; y1: number; y2: number };

/**
 * Place one cut in the plot.
 *
 * Three shapes, and which one you get is the whole point of the overlay:
 *   - `full`      an open gala (SANS / SANY) publishes one cut for every age, so
 *                 the line spans the plot regardless of the swimmer's birthday.
 *   - `y2` set    a birthday RISER: vertical at x1, joining the cut before the
 *                 birthday to the cut after it, so a stepped age-graded standard
 *                 reads as one continuous line instead of two floating rules.
 *   - otherwise   a dated segment at the cut that applied over that stretch.
 *
 * `atX` maps epoch ms to a pixel and `atY` maps a time in ms — both come from the
 * chart's own scales, so this function never needs to know the domains.
 */
export function cutSegment(
  cut: CutLine,
  atX: (epochMs: number) => number,
  atY: (timeMs: number) => number,
  innerWidth: number,
): Segment {
  if (cut.y2 !== undefined) {
    const x = atX(cut.x1);
    return { x1: x, x2: x, y1: atY(cut.y), y2: atY(cut.y2) };
  }
  const y = atY(cut.y);
  return {
    x1: cut.full ? 0 : atX(cut.x1),
    x2: cut.full ? innerWidth : atX(cut.x2),
    y1: y,
    y2: y,
  };
}
