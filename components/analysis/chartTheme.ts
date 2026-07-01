// Shared chart tokens (Step 7). Recharts takes plain SVG paint strings, so we
// reference the DESIGN.md CSS variables directly — no ad-hoc hex, no new colours.
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
