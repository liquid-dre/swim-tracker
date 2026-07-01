// lib/swim.ts — Pure, framework-free swim-domain helpers (BRD §4, §7).
//
// No React, no Convex, no I/O. Everything here is a deterministic function so it
// can be unit-tested in isolation and reused by both the server (Convex) and the
// client. Times are integer **milliseconds** everywhere internally (BRD §4.4).

// ---------------------------------------------------------------------------
// Domain types (mirror the shared validators in convex/schema.ts, BRD §4.1–4.3)
// ---------------------------------------------------------------------------

export type Stroke = "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
export type Course = "SCM" | "LCM";
export type Distance = 50 | 100 | 200 | 400 | 800 | 1500;

/** The shape isValidEvent needs from an event-whitelist row (BRD §4.3, §7). */
export type EventDef = {
  distance: Distance | number;
  stroke: Stroke | string;
  allowedCourses: ReadonlyArray<Course | string>;
  active: boolean;
  label?: string;
};

// ---------------------------------------------------------------------------
// 1. parseTime — BULLETPROOF messy-time parser (BRD §4.4)
// ---------------------------------------------------------------------------

/**
 * Parse a messy human/CSV time string into integer milliseconds.
 *
 * Bulletproof by design: it must NEVER silently misread a valid time. Anything
 * it cannot interpret unambiguously and validate throws — a bad row fails loudly
 * rather than seeding a wrong time.
 *
 * Normalisation rules, applied in order (BRD §4.4):
 *   1. Normalise commas: a comma is a decimal/separator ("33,68" → "33.68").
 *   2. Split on both ":" and ".".
 *   3. The LAST numeric group is always hundredths; the group before it is
 *      seconds; the group before that (if present) is minutes.
 *   4. 2 groups → `ss:hh` (seconds.hundredths), NOT `mm:ss`.
 *      So "59:09" = 59.09 s, never 59 minutes.
 *   5. 3 groups → `mm:ss:hh`.
 *   6. Validate: seconds 0–59, hundredths 0–99, result > 0. Throw on anything
 *      that fails.
 *
 * Examples: "1:07:47" → 67470, "59:09" → 59090, "0:33:68" → 33680,
 * "33,68" → 33680, "5:48.28" → 348280.
 */
export function parseTime(input: string): number {
  if (typeof input !== "string") {
    throw new TypeError(`parseTime: expected a string, got ${typeof input}`);
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("parseTime: empty input");
  }

  // 1. Commas are decimal/separator markers in the source data.
  // 2. Split on both ":" and "." — the group positions carry the meaning.
  const normalised = trimmed.replace(/,/g, ".");
  const groups = normalised.split(/[:.]/);

  if (groups.length < 2 || groups.length > 3) {
    throw new Error(
      `parseTime: cannot interpret "${input}" — expected 2 (ss:hh) or 3 (mm:ss:hh) groups, got ${groups.length}`,
    );
  }

  // Every group must be a run of digits only. This rejects signs, spaces,
  // stray letters, empty groups ("1::2", "1.", ".5"), etc.
  for (const g of groups) {
    if (!/^\d+$/.test(g)) {
      throw new Error(`parseTime: non-numeric group "${g}" in "${input}"`);
    }
  }

  let minutes = 0;
  let seconds: number;
  let hundredths: number;

  if (groups.length === 2) {
    // 2 groups => ss:hh (sub-minute), NOT mm:ss.
    seconds = parseInt(groups[0], 10);
    hundredths = parseInt(groups[1], 10);
  } else {
    // 3 groups => mm:ss:hh.
    minutes = parseInt(groups[0], 10);
    seconds = parseInt(groups[1], 10);
    hundredths = parseInt(groups[2], 10);
  }

  if (seconds < 0 || seconds > 59) {
    throw new Error(`parseTime: seconds out of range (0–59): ${seconds} in "${input}"`);
  }
  if (hundredths < 0 || hundredths > 99) {
    throw new Error(
      `parseTime: hundredths out of range (0–99): ${hundredths} in "${input}"`,
    );
  }

  const ms = ((minutes * 60 + seconds) * 100 + hundredths) * 10;
  if (!(ms > 0)) {
    throw new Error(`parseTime: non-positive time in "${input}"`);
  }

  return ms;
}

// ---------------------------------------------------------------------------
// 2. formatTime — inverse of parseTime, canonical `m:ss:hh` (BRD §4.4)
// ---------------------------------------------------------------------------

/**
 * Format integer milliseconds as canonical `m:ss:hh` — minutes always present
 * (even 0), seconds and hundredths zero-padded to two digits.
 * Example: 67470 → "1:07:47", 33680 → "0:33:68".
 */
export function formatTime(ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    throw new TypeError(`formatTime: expected a finite number, got ${ms}`);
  }
  if (ms < 0) {
    throw new Error(`formatTime: negative time ${ms}`);
  }

  // Work in hundredths; round to guard against tiny non-decimal ms values.
  const totalHundredths = Math.round(ms / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;

  const ss = String(seconds).padStart(2, "0");
  const hh = String(hundredths).padStart(2, "0");
  return `${minutes}:${ss}:${hh}`;
}

// ---------------------------------------------------------------------------
// 3. computeAge — whole years between DOB and a reference date (BRD §4.7)
// ---------------------------------------------------------------------------

function toUTCDate(value: string | Date, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label}: invalid date "${String(value)}"`);
  }
  return date;
}

/**
 * Whole years from `dob` to `asOfDate` (age last birthday). Accepts ISO date
 * strings or Date objects. Computed in UTC so a plain "YYYY-MM-DD" is stable
 * regardless of the host timezone.
 */
export function computeAge(dob: string | Date, asOfDate: string | Date): number {
  const birth = toUTCDate(dob, "computeAge(dob)");
  const asOf = toUTCDate(asOfDate, "computeAge(asOfDate)");

  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

// ---------------------------------------------------------------------------
// 4. computeAgeGroup — map an age to a display band (BRD §4.7, configurable)
// ---------------------------------------------------------------------------

/**
 * An age band. `min`/`max` are inclusive bounds in whole years; omit `min` for
 * an open-ended youngest band ("8&U") and `max` for an open-ended oldest band
 * ("17&O"). Bands are expected to be ordered youngest → oldest.
 */
export type AgeBand = { label: string; min?: number; max?: number };

/**
 * Default two-year bands (BRD §4.7) with an "8&U" catch-all. The "8&U" band is
 * removable — pass a custom `bands` array to `computeAgeGroup` without it.
 */
export const DEFAULT_AGE_BANDS: ReadonlyArray<AgeBand> = [
  { label: "8&U", max: 8 },
  { label: "9-10", min: 9, max: 10 },
  { label: "11-12", min: 11, max: 12 },
  { label: "13-14", min: 13, max: 14 },
  { label: "15-16", min: 15, max: 16 },
  { label: "17&O", min: 17 },
];

/**
 * The band label for the swimmer's age as of `asOfDate`. Uses DEFAULT_AGE_BANDS
 * unless a custom (ordered youngest→oldest) `bands` array is supplied. If the
 * age falls below the youngest band or above the oldest, it clamps to that end
 * band rather than throwing (e.g. with "8&U" removed, an age-7 swimmer clamps to
 * the youngest configured band).
 */
export function computeAgeGroup(
  dob: string | Date,
  asOfDate: string | Date,
  bands: ReadonlyArray<AgeBand> = DEFAULT_AGE_BANDS,
): string {
  if (bands.length === 0) {
    throw new Error("computeAgeGroup: bands must be non-empty");
  }

  const age = computeAge(dob, asOfDate);

  for (const band of bands) {
    const aboveMin = band.min === undefined || age >= band.min;
    const belowMax = band.max === undefined || age <= band.max;
    if (aboveMin && belowMax) {
      return band.label;
    }
  }

  // No band matched (a gap in a custom config, or age past both open ends):
  // clamp to the nearest end band so callers always get a label.
  const youngest = bands[0];
  if (youngest.min !== undefined && age < youngest.min) {
    return youngest.label;
  }
  return bands[bands.length - 1].label;
}

// ---------------------------------------------------------------------------
// 5. isValidEvent — whitelist + course-validity check (BRD §4.3)
// ---------------------------------------------------------------------------

/**
 * True only if `(distance, stroke)` exists in the `events` whitelist, that event
 * is `active`, and `course` is one of its `allowedCourses`. Everything off the
 * whitelist (e.g. "50 IM") or on the wrong course (e.g. "100 IM" LCM) is false.
 */
export function isValidEvent(
  distance: Distance | number,
  stroke: Stroke | string,
  course: Course | string,
  events: ReadonlyArray<EventDef>,
): boolean {
  const event = events.find(
    (e) => e.distance === distance && e.stroke === stroke && e.active,
  );
  if (!event) {
    return false;
  }
  return event.allowedCourses.includes(course as Course);
}
