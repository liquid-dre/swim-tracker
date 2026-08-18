import { GALA_ORDER, GALA_TOKEN } from "@/lib/galas";
import type { GalaCode, RingScale } from "@/lib/swim";

/*
  Pure geometry for the road charts, split out of the components so it is
  testable without mounting Visx — the same split seasonBars.ts and
  progressionRows.ts use.
*/

/** Full-strength tier colour, for a bar's fill. */
export const TIER_FILL: Record<GalaCode, string> = GALA_ORDER.reduce(
  (acc, gala) => {
    acc[gala] = `var(--color-tier-${GALA_TOKEN[gala]})`;
    return acc;
  },
  {} as Record<GalaCode, string>,
);

/** Faint tier tint, for the zone band leading up to that gala's marker. */
export const TIER_TINT: Record<GalaCode, string> = GALA_ORDER.reduce(
  (acc, gala) => {
    acc[gala] = `var(--color-tier-${GALA_TOKEN[gala]}-bg)`;
    return acc;
  },
  {} as Record<GalaCode, string>,
);

export const NONE_FILL = "var(--color-tier-none)";
/** Neutral headroom past the hardest gala this event actually has a cut for. */
export const HEADROOM_FILL = "var(--color-gray-50)";

export type RingBand = {
  from: number;
  to: number;
  /** The gala whose range this is, or null for the neutral headroom past it. */
  gala: GalaCode | null;
};

/**
 * The tinted bands behind ONE event's bar, in ring units on the shared scale.
 *
 * Each gala this event has a cut for tints the range leading up to its marker;
 * everything past the hardest one it has is neutral headroom. Galas the event
 * has NO cut for are deliberately absent (§4.9 coverage) — their range stays
 * neutral track rather than borrowing a neighbour's tint, because tinting it
 * would draw a zone for a standard that does not exist at this event.
 *
 * `present` is filtered against the scale's own ring order, so a cut for a gala
 * this swimmer cannot enter never produces a band.
 */
export function ringZoneBands(
  present: ReadonlyArray<GalaCode>,
  scale: RingScale,
): RingBand[] {
  if (scale.max <= 0) return [];
  const onScale = scale.order.filter((g) => present.includes(g));

  const bands: RingBand[] = [];
  let prev = 0;
  for (const gala of onScale) {
    const to = scale.pos[gala];
    if (to === undefined || to <= prev) continue;
    bands.push({ from: prev, to, gala });
    prev = to;
  }
  if (prev < scale.max) bands.push({ from: prev, to: scale.max, gala: null });
  return bands;
}

// Fixed reading order for the road lists and charts: by distance ascending
// (50, 100, 200, …), then stroke IM → Free → Back → Breast → Fly. Every bar's
// `key` is `${distance}|${stroke}`, so both sort fields come straight off it.
const STROKE_RANK: Record<string, number> = {
  IM: 0,
  FREE: 1,
  BACK: 2,
  BREAST: 3,
  FLY: 4,
};

export function byEventOrder(a: { key: string }, b: { key: string }): number {
  const [da, sa] = a.key.split("|");
  const [db, sb] = b.key.split("|");
  return (
    Number(da) - Number(db) || (STROKE_RANK[sa] ?? 99) - (STROKE_RANK[sb] ?? 99)
  );
}
