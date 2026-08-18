import { GALA_ORDER, type GalaCode } from "@/lib/galas";

// Shared chart tokens (Step 7). The chart layer takes plain SVG paint strings,
// so these reference the DESIGN.md CSS variables directly — no ad-hoc hex, no
// new colours.
// One accent (brand) + neutral gridlines is the house style; the series palette
// below is only drawn on for GROUP progression, where one line per swimmer needs
// to be told apart. All values resolve to tokens already defined in globals.css.

/** Neutral chart furniture — gridlines, axes, tick labels. */
export const CHART = {
  grid: "var(--color-gray-200)",
  axis: "var(--color-gray-300)",
  tick: "var(--color-gray-500)",
  accent: "var(--color-brand-500)",
  accentSoft: "var(--color-brand-100)",
  surface: "var(--color-gray-25)",
  cursor: "var(--color-gray-100)",
  ink: "var(--color-gray-700)",
} as const;

/** One-time load animation, off under `prefers-reduced-motion`. */
export const CHART_ANIM_MS = 420;

// Qualifying-gala overlay tokens (Step 10, DESIGN.md §3). Galas are NEVER
// colour-only: every line/bar carries the short label + glyph below, matching
// the TierBadge vocabulary (SANS ★ > SANY ✦ > SANJ ◆ > L3 ● > L2 ○) so the chart
// reads in greyscale and under colour-blindness. No new colours — these resolve
// to the --color-tier-* CSS variables already defined in globals.css.
export type OverlayTier = GalaCode;

export const TIER_STYLE: Record<
  OverlayTier,
  { color: string; ink: string; label: string; glyph: string; dash: string }
> = {
  // `color` paints STROKES and swatches; `ink` is the darker variant for TEXT.
  // They are not interchangeable: the gala hues are picked to be legible as 1.5px
  // lines against the grid, and at that lightness a small label fails contrast on
  // white — --color-tier-sanj is about 2.4:1, its -ink about 5.5:1. Any label
  // drawn in a gala's colour must use `ink` (DESIGN.md §3).
  //
  // Dash patterns give the lines a second, greyscale-legible signal beyond
  // colour, getting longer as the gala gets harder.
  SANS: {
    color: "var(--color-tier-sans)",
    ink: "var(--color-tier-sans-ink)",
    label: "SANS",
    glyph: "★",
    dash: "11 4",
  },
  SANY: {
    color: "var(--color-tier-sany)",
    ink: "var(--color-tier-sany-ink)",
    label: "SANY",
    glyph: "✦",
    dash: "9 4",
  },
  SANJ: {
    color: "var(--color-tier-sanj)",
    ink: "var(--color-tier-sanj-ink)",
    label: "SANJ",
    glyph: "◆",
    dash: "7 4",
  },
  LEVEL_3: {
    color: "var(--color-tier-l3)",
    ink: "var(--color-tier-l3-ink)",
    label: "L3",
    glyph: "●",
    dash: "4 3",
  },
  LEVEL_2: {
    color: "var(--color-tier-l2)",
    ink: "var(--color-tier-l2-ink)",
    label: "L2",
    glyph: "○",
    dash: "1 3",
  },
};

/** Hardest → easiest — the one gala order from lib/galas (§4.9). */
export const OVERLAY_TIER_ORDER: ReadonlyArray<OverlayTier> = GALA_ORDER;

// Qualitative palette for multi-swimmer progression, drawn only from existing
// tokens. The first entry is the brand accent, so a single swimmer is fully
// on-system; extra hues are added only as more swimmers are selected.
export const SERIES_COLORS = [
  "var(--color-brand-500)",
  "var(--color-blue-light-500)",
  "var(--color-success-500)",
  "var(--color-warning-500)",
  "var(--color-brand-700)",
  "var(--color-error-500)",
  "var(--color-brand-400)",
  "var(--color-gray-600)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Parse an ISO "YYYY-MM-DD" to a UTC epoch-ms number for a numeric time axis. */
export function isoToMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
