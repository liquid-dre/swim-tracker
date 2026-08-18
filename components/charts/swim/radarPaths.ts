/*
  Null-aware path building for the stroke-profile radar.

  This is OURS, imported by the vendored `radar-area.tsx` (a LOCAL EDIT there
  names it). Keeping the logic here rather than inline in the vendored file
  means it is linted and tested like the rest of our chart code, and shrinks the
  diff that has to survive the next `shadcn add`.

  Why it exists: bklit coerces a missing metric to 0, which puts the point on the
  axis. For the stroke radar that renders "never raced Fly" identically to
  "slowest possible at Fly" — two very different facts about a swimmer. A metric
  with no data is `null` instead, and the polygon BREAKS there.

  A gap has to read differently in fill and in stroke, hence two builders:
    • the fill closes across the gap, so the series still reads as one area;
    • the stroke does not, so an eye following the outline sees it stop.
*/

export type RadarPos = { x: number; y: number };

/** Closed area over just the metrics that have data. */
export function positionsToFillPath(
  positions: ReadonlyArray<RadarPos | null>,
): string {
  const present = positions.filter((p): p is RadarPos => p !== null);
  // Two points enclose no area — drawing them as a "polygon" would render a
  // degenerate sliver that reads as a real shape.
  if (present.length < 3) return "";
  return `M ${present.map((p) => `${p.x},${p.y}`).join(" L ")} Z`;
}

/**
 * Outline, broken at every gap.
 *
 * The metrics form a CYCLE, so a run of data that wraps past the last spoke back
 * to the first is ONE run, not two. Rotating the list to start just after a gap
 * is what makes that fall out naturally instead of needing a special case.
 */
export function positionsToStrokePath(
  positions: ReadonlyArray<RadarPos | null>,
): string {
  if (positions.length === 0) return "";

  const firstGap = positions.findIndex((p) => p === null);
  if (firstGap === -1) {
    const all = positions as ReadonlyArray<RadarPos>;
    return `M ${all.map((p) => `${p.x},${p.y}`).join(" L ")} Z`;
  }

  const rotated = [
    ...positions.slice(firstGap + 1),
    ...positions.slice(0, firstGap + 1),
  ];

  const segments: string[] = [];
  let run: RadarPos[] = [];
  const flush = () => {
    // A single point is not a segment; the no-data tick marks those instead.
    if (run.length >= 2) {
      segments.push(`M ${run.map((p) => `${p.x},${p.y}`).join(" L ")}`);
    }
    run = [];
  };
  for (const p of rotated) {
    if (p === null) flush();
    else run.push(p);
  }
  flush();
  return segments.join(" ");
}
