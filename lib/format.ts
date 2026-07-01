// Presentation-only formatters shared across the swimmer-profile screens.
// Kept framework-free and timezone-safe (ISO strings are parsed by their parts,
// never through `new Date("YYYY-MM-DD")` which drifts by locale).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-02-01" → "1 Feb 2026". Returns the input unchanged if it's not ISO. */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  return `${day} ${month} ${year}`;
}

/** "2026-03-14" → "Mar 2026". Returns the input unchanged if it's not ISO. */
export function formatMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${m[1]}`;
}

/**
 * A time DELTA in ms as signed seconds with hundredths, e.g. 7000 → "7.00",
 * -1000 → "-1.00". The unit ("s") and any faster/slower wording are the caller's
 * job so the number stays composable.
 */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}
