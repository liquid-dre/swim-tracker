// lib/swim.ts — Pure, framework-free swim-domain helpers (BRD §4, §7).
//
// No React, no Convex, no I/O. Everything here is a deterministic function so it
// can be unit-tested in isolation and reused by both the server (Convex) and the
// client. Times are integer **milliseconds** everywhere internally (BRD §4.4).

// Gala identity (codes, order, labels, coverage, eligibility) lives in
// ./galas — a type-only import there keeps the module graph one-directional.
import type {
  AgeScope,
  CoveredEvent,
  GalaCode,
  GalaCoverage,
  GalaEligibility,
} from "./galas";
import {
  GALA_FULL,
  GALA_MEDIUM,
  GALA_ORDER,
  GALA_SHORT,
  GALA_TOKEN,
  galaCoversEvent,
  isGalaAgeEligible,
  isGalaCode,
} from "./galas";

// ---------------------------------------------------------------------------
// Domain types (mirror the shared validators in convex/schema.ts, BRD §4.1–4.3)
// ---------------------------------------------------------------------------

export type Stroke = "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
export type Course = "SCM" | "LCM";
export type Distance = 25 | 50 | 100 | 200 | 400 | 800 | 1500;

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
// 2b. clockFromDigits — poolside calculator-style numeric time entry (Step 5)
// ---------------------------------------------------------------------------

/**
 * Right-fill a raw run of digits into the three fields of a `mm:ss:hh` clock,
 * calculator/stopwatch style: the LAST two digits are hundredths, the next two
 * are seconds, and everything before that is minutes. This is the one-thumb
 * poolside entry model — the coach types only digits and the colons fall into
 * place (e.g. "10747" → 1:07:47, "3368" → 0:33:68).
 *
 * Non-digits are stripped first, so a pasted "5:48.28" or "33,68" regroups to
 * the same result. Input is capped at 6 digits (max 99:59:99). This is a pure
 * FORMATTER: it always returns two-digit `ss`/`hh` strings and a minutes number;
 * range validity (ss ≤ 59, hh ≤ 99, non-zero) is `parseTime`'s job — build
 * `${mm}:${ss}:${hh}` from the result and hand it to `parseTime`.
 */
export function clockFromDigits(digits: string): {
  minutes: number;
  ss: string;
  hh: string;
} {
  const d = (digits.match(/\d/g)?.join("") ?? "").slice(-6).padStart(6, "0");
  return {
    minutes: parseInt(d.slice(0, 2), 10),
    ss: d.slice(2, 4),
    hh: d.slice(4, 6),
  };
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

/**
 * The swimmer's most recent birthday as an ISO date, when it falls within the
 * last `windowDays` days of `asOfDate` (inclusive) — else null. Standards
 * resolve to the exact single-year age (§4.9), so a birthday silently moves
 * every cut; callers use this to say so instead of leaving the swimmer to
 * wonder why the gaps changed. Never exposes the birth YEAR (callers already
 * know the age). A 29 Feb birthday reads as 1 Mar in non-leap years, matching
 * how `computeAge` ticks over.
 */
export function recentBirthday(
  dob: string | Date,
  asOfDate: string | Date,
  windowDays = 30,
): string | null {
  const birth = toUTCDate(dob, "recentBirthday(dob)");
  const asOf = toUTCDate(asOfDate, "recentBirthday(asOfDate)");

  // Candidate birthday in the asOf year; Date.UTC rolls 29 Feb → 1 Mar in
  // non-leap years, which is exactly when computeAge increments.
  let candidate = new Date(
    Date.UTC(asOf.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()),
  );
  if (candidate.getTime() > asOf.getTime()) {
    candidate = new Date(
      Date.UTC(asOf.getUTCFullYear() - 1, birth.getUTCMonth(), birth.getUTCDate()),
    );
  }
  // Their actual birth date isn't an age-up.
  if (candidate.getTime() <= birth.getTime()) return null;

  const days = (asOf.getTime() - candidate.getTime()) / 86_400_000;
  if (days > windowDays) return null;
  return candidate.toISOString().slice(0, 10);
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

// ---------------------------------------------------------------------------
// 6. Event labels + canonical ordering (BRD §4.3)
// ---------------------------------------------------------------------------

/** Human label for a stroke, per BRD §4.3: "Free", "Back", "Breast", "Fly", "IM". */
export const STROKE_LABEL: Record<Stroke, string> = {
  FREE: "Free",
  BACK: "Back",
  BREAST: "Breast",
  FLY: "Fly",
  IM: "IM",
};

/** Canonical stroke order for display, matching the BRD §4.3 listing. */
export const STROKE_ORDER: ReadonlyArray<Stroke> = [
  "FREE",
  "BACK",
  "BREAST",
  "FLY",
  "IM",
];

/** Canonical distance order (short → long). */
export const DISTANCE_ORDER: ReadonlyArray<Distance> = [
  25, 50, 100, 200, 400, 800, 1500,
];

/** Human event label, e.g. "100 IM" / "800 Free". */
export function eventLabel(
  distance: Distance | number,
  stroke: Stroke | string,
): string {
  const s = STROKE_LABEL[stroke as Stroke] ?? String(stroke);
  return `${distance} ${s}`;
}

/**
 * A single sortable number so events read 50→1500, and within a distance
 * Free→Back→Breast→Fly→IM. Unknown strokes sort last within their distance.
 */
export function eventSortKey(
  distance: Distance | number,
  stroke: Stroke | string,
): number {
  const si = STROKE_ORDER.indexOf(stroke as Stroke);
  return distance * 10 + (si < 0 ? STROKE_ORDER.length : si);
}

// ---------------------------------------------------------------------------
// 6b. World records — chart-axis reference only (NOT a domain invariant)
// ---------------------------------------------------------------------------
//
// These are the outright world-record times per (course, gender, event), used
// for ONE purpose: scaling the progression chart's y-axis. Anchoring the axis
// floor at (record − 1s) lets a swimmer's line fill the grid instead of being
// squashed against a zero baseline. They are approximate reference values — the
// only thing they affect is axis breathing room, and the floor logic clamps so
// a record that is (impossibly) slower than a plotted swim can never clip data.
// They are deliberately kept out of the qualifying-standard logic (§4.9), which
// is driven solely by the SANJ/Level cuts. Times are integer milliseconds.

type EventTimes = Partial<Record<string, number>>;

/** Key for the record table: `${distance}:${stroke}`. */
function wrKey(distance: Distance | number, stroke: Stroke | string): string {
  return `${distance}:${stroke}`;
}

const WORLD_RECORDS_MS: Record<Course, Record<"M" | "F", EventTimes>> = {
  LCM: {
    M: {
      "50:FREE": 20910,
      "100:FREE": 46400,
      "200:FREE": 102000,
      "400:FREE": 220070,
      "800:FREE": 452120,
      "1500:FREE": 870670,
      "50:BACK": 23550,
      "100:BACK": 51600,
      "200:BACK": 111920,
      "50:BREAST": 25950,
      "100:BREAST": 56880,
      "200:BREAST": 125480,
      "50:FLY": 22270,
      "100:FLY": 49450,
      "200:FLY": 110340,
      "200:IM": 114000,
      "400:IM": 242500,
    },
    F: {
      "50:FREE": 23610,
      "100:FREE": 51710,
      "200:FREE": 112230,
      "400:FREE": 235380,
      "800:FREE": 484790,
      "1500:FREE": 920480,
      "50:BACK": 26860,
      "100:BACK": 57130,
      "200:BACK": 123140,
      "50:BREAST": 29160,
      "100:BREAST": 64130,
      "200:BREAST": 137550,
      "50:FLY": 24430,
      "100:FLY": 55480,
      "200:FLY": 121810,
      "200:IM": 126120,
      "400:IM": 264380,
    },
  },
  SCM: {
    M: {
      "50:FREE": 20160,
      "100:FREE": 44840,
      "200:FREE": 98610,
      "400:FREE": 212250,
      "800:FREE": 440460,
      "1500:FREE": 846880,
      "50:BACK": 22110,
      "100:BACK": 48330,
      "200:BACK": 105630,
      "50:BREAST": 24950,
      "100:BREAST": 55280,
      "200:BREAST": 120160,
      "50:FLY": 21320,
      "100:FLY": 47710,
      "200:FLY": 105850,
      "100:IM": 49280,
      "200:IM": 108880,
      "400:IM": 234810,
    },
    F: {
      "50:FREE": 22830,
      "100:FREE": 50250,
      "200:FREE": 110310,
      "400:FREE": 230250,
      "800:FREE": 477420,
      "1500:FREE": 903050,
      "50:BACK": 25230,
      "100:BACK": 53980,
      "200:BACK": 118940,
      "50:BREAST": 28370,
      "100:BREAST": 62360,
      "200:BREAST": 132500,
      "50:FLY": 24380,
      "100:FLY": 52710,
      "200:FLY": 119320,
      "100:IM": 56510,
      "200:IM": 121630,
      "400:IM": 255480,
    },
  },
};

/**
 * World-record time (ms) for an event on a course, for one gender or — when
 * `gender` is omitted — the fastest (outright) record across both. Returns null
 * for anything without a listed record. Reference only; see the note above.
 */
export function worldRecordMs(
  distance: Distance | number,
  stroke: Stroke | string,
  course: Course | string,
  gender?: "M" | "F",
): number | null {
  const byGender = WORLD_RECORDS_MS[course as Course];
  if (!byGender) return null;
  const key = wrKey(distance, stroke);
  if (gender) {
    return byGender[gender][key] ?? null;
  }
  const m = byGender.M[key];
  const f = byGender.F[key];
  const vals = [m, f].filter((v): v is number => typeof v === "number");
  return vals.length > 0 ? Math.min(...vals) : null;
}

// ---------------------------------------------------------------------------
// 7. Personal bests — DERIVED, never stored (BRD §4.6, Step 6)
// ---------------------------------------------------------------------------
//
// The headline PB is the fastest MEET time for a (distance, stroke, course);
// time trials and practice NEVER count toward it. `overallBest` is the fastest
// across ALL swim types (secondary). `improvement` measures the earliest logged
// swim (any type) against the current headline PB. All pure so it can be unit-
// tested and run identically on the server (Convex) and, if needed, the client.

export type SwimType = "MEET" | "TIME_TRIAL" | "PRACTICE" | "SCHOOL_GALA";

/** The minimal result fields the PB derivation reads. */
export type ResultForPB = {
  distance: Distance | number;
  stroke: Stroke | string;
  course: Course | string;
  timeMs: number;
  swimType: SwimType | string;
  swimDate: string; // ISO "YYYY-MM-DD"
  meetName?: string;
  // The swimmer's exact age on the day of this swim (age at the gala), stored on
  // every result. Threaded through so qualifying cuts can be matched to the age
  // the swimmer actually held at the meet, not their age today (§4.9).
  ageAtSwim?: number;
};

/** Headline PB = the fastest MEET swim (with the date + meet it was set at). */
export type HeadlinePB = {
  timeMs: number;
  swimDate: string;
  meetName: string | null;
  // Age at the gala where this PB was swum — the age its qualifying cut is
  // resolved against (§4.9). null only when the source row omits it (tests).
  ageAtSwim: number | null;
};

/** Fastest swim across all types — secondary context, never the headline. */
export type OverallBest = {
  timeMs: number;
  swimDate: string;
  swimType: SwimType;
};

/** Earliest logged swim → current headline PB (BRD §5.4). */
export type Improvement = {
  fromMs: number; // the earliest swim's time
  fromDate: string;
  fromSwimType: SwimType;
  toMs: number; // the headline PB's time
  absMs: number; // signed: fromMs - toMs (positive = faster now)
  pct: number; // signed percent of the baseline, 2 dp
};

export type EventPB = {
  distance: Distance;
  stroke: Stroke;
  course: Course;
  label: string;
  headline: HeadlinePB | null; // null => no meet time logged yet
  overallBest: OverallBest; // always present (a group only exists with ≥1 swim)
  improvement: Improvement | null; // null when there is no headline PB
};

/**
 * The fastest swim in `rows` (min `timeMs`); ties break to the EARLIEST date, so
 * a PB reads as "first achieved on…". Returns null for an empty list.
 */
function fastest<T extends { timeMs: number; swimDate: string }>(
  rows: ReadonlyArray<T>,
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (
      best === null ||
      r.timeMs < best.timeMs ||
      (r.timeMs === best.timeMs && r.swimDate < best.swimDate)
    ) {
      best = r;
    }
  }
  return best;
}

/**
 * The earliest swim in `rows` (min `swimDate`); ties break to the FASTER time so
 * the improvement baseline is conservative (never overstates a gain). Returns
 * null for an empty list.
 */
function earliest<T extends { timeMs: number; swimDate: string }>(
  rows: ReadonlyArray<T>,
): T | null {
  let first: T | null = null;
  for (const r of rows) {
    if (
      first === null ||
      r.swimDate < first.swimDate ||
      (r.swimDate === first.swimDate && r.timeMs < first.timeMs)
    ) {
      first = r;
    }
  }
  return first;
}

/**
 * Derive every personal best for a swimmer from their raw results. Groups by
 * (distance, stroke, course) — SCM and LCM are kept strictly separate (BRD §4.2)
 * — and returns one `EventPB` per group, sorted 50→1500 then by stroke then
 * course. Only groups that actually have results appear; empty events are the
 * caller's concern.
 */
export function computePersonalBests(
  results: ReadonlyArray<ResultForPB>,
): EventPB[] {
  // School-gala times are UNOFFICIAL (parent-entered, §R15): they never set a
  // headline PB, never count as an overall best, never seed an improvement
  // baseline, and never appear on the PB board — they live only in progression
  // and history. Drop them before any grouping or best-time logic so nothing
  // downstream can mistake a gala time for a "best".
  const official = results.filter((r) => r.swimType !== "SCHOOL_GALA");

  const groups = new Map<string, ResultForPB[]>();
  for (const r of official) {
    const key = `${r.distance}|${r.stroke}|${r.course}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const out: EventPB[] = [];
  for (const rows of groups.values()) {
    const distance = rows[0].distance as Distance;
    const stroke = rows[0].stroke as Stroke;
    const course = rows[0].course as Course;

    // Headline: fastest MEET only. Time trials + practice are excluded here.
    const headlineRow = fastest(rows.filter((r) => r.swimType === "MEET"));
    const overallRow = fastest(rows)!; // group is non-empty by construction

    const headline: HeadlinePB | null = headlineRow
      ? {
          timeMs: headlineRow.timeMs,
          swimDate: headlineRow.swimDate,
          meetName: headlineRow.meetName ?? null,
          ageAtSwim: headlineRow.ageAtSwim ?? null,
        }
      : null;

    const overallBest: OverallBest = {
      timeMs: overallRow.timeMs,
      swimDate: overallRow.swimDate,
      swimType: overallRow.swimType as SwimType,
    };

    // Improvement only exists relative to a real (meet) PB.
    let improvement: Improvement | null = null;
    if (headline) {
      const firstRow = earliest(rows)!;
      const absMs = firstRow.timeMs - headline.timeMs;
      improvement = {
        fromMs: firstRow.timeMs,
        fromDate: firstRow.swimDate,
        fromSwimType: firstRow.swimType as SwimType,
        toMs: headline.timeMs,
        absMs,
        pct:
          firstRow.timeMs > 0
            ? Math.round((absMs / firstRow.timeMs) * 10000) / 100
            : 0,
      };
    }

    out.push({
      distance,
      stroke,
      course,
      label: eventLabel(distance, stroke),
      headline,
      overallBest,
      improvement,
    });
  }

  out.sort((a, b) => {
    const ka = eventSortKey(a.distance, a.stroke);
    const kb = eventSortKey(b.distance, b.stroke);
    if (ka !== kb) return ka - kb;
    return a.course.localeCompare(b.course); // LCM before SCM
  });

  return out;
}

// ---------------------------------------------------------------------------
// 8. Qualifying standards — galas, coverage, resolution (BRD §4.9, Step 8)
// ---------------------------------------------------------------------------
//
// Cuts exist SEPARATELY for each course: every gala publishes both a long-course
// and a short-course standard and both are valid for entry, so a cut is only
// ever compared against a PB of the SAME course (§4.2) — never borrowed across
// courses, never interpolated. Every function here is pure so the same rules run
// in the Convex importer/queries and in unit tests. Times are integer ms.
//
// Gala identity, ordering, labels and coverage live in `lib/galas.ts`; this
// section is the resolution logic that consumes them.

// Re-exported so the ~25 consumers keep importing swim-domain names from one
// place; the definitions themselves live in ./galas.
export type { AgeScope, CoveredEvent, GalaCode, GalaCoverage, GalaEligibility };
export {
  GALA_FULL,
  GALA_MEDIUM,
  GALA_ORDER,
  GALA_SHORT,
  GALA_TOKEN,
  galaCoversEvent,
  isGalaAgeEligible,
  isGalaCode,
};

/**
 * The gala fields resolution needs: its code, its age window, and its tour date
 * (which decides WHICH age the cut resolves at — the birthday rule).
 */
export type GalaRef = GalaEligibility & {
  code: GalaCode;
  tourDate?: string | null;
};

/**
 * The minimal cut fields the resolver reads. `age` is ABSENT on an open
 * standard (SANS/SANY publish one cut for every age); age-graded galas always
 * carry an exact age plus, for the youngest band, a catch-all flag.
 */
export type StandardCut = {
  age?: number | null;
  isCatchAllYoung: boolean; // applies to ages <= age (e.g. "10&U")
  isCatchAllOld: boolean; // applies to ages >= age (e.g. "17-19")
  timeMs: number;
};

/**
 * The cut (ms) that applies to a swimmer's EXACT single-year age, honouring
 * catch-alls (§4.9): `isCatchAllYoung` matches ages ≤ its bound, `isCatchAllOld`
 * matches ages ≥ its bound, otherwise the age must match exactly. An exact-age
 * row always wins over a catch-all, and a catch-all wins over an OPEN row (a
 * row with no age at all, which applies to every age). Returns null when no row
 * applies (sparse coverage → no line). Never interpolates.
 *
 * NOTE this ignores the gala's age WINDOW — eligibility is a separate gate, so
 * prefer `resolveGalaCut` unless you have already checked it.
 */
export function resolveStandardTime(
  cuts: ReadonlyArray<StandardCut>,
  exactAge: number,
): number | null {
  let exact: StandardCut | null = null;
  let young: StandardCut | null = null; // narrowest young catch-all that covers
  let old: StandardCut | null = null; // widest old catch-all that covers
  let open: StandardCut | null = null; // age-agnostic cut (SANS / SANY)

  for (const c of cuts) {
    if (c.age == null) {
      open = c;
    } else if (!c.isCatchAllYoung && !c.isCatchAllOld) {
      if (c.age === exactAge) exact = c;
    } else if (c.isCatchAllYoung && exactAge <= c.age) {
      if (young === null || (c.age as number) < (young.age as number)) young = c;
    } else if (c.isCatchAllOld && exactAge >= c.age) {
      if (old === null || (c.age as number) > (old.age as number)) old = c;
    }
  }

  const match = exact ?? young ?? old ?? open;
  return match ? match.timeMs : null;
}

/**
 * The cut a swimmer of this exact age must actually beat for one gala: null when
 * the age falls outside the gala's entry window (no cut to chase even though
 * rows exist), otherwise `resolveStandardTime` over that gala's rows.
 */
export function resolveGalaCut(
  gala: GalaRef,
  cuts: ReadonlyArray<StandardCut>,
  exactAge: number,
): number | null {
  if (!isGalaAgeEligible(gala, exactAge)) return null;
  return resolveStandardTime(cuts, exactAge);
}

/** The applicable cuts for one exact age, per gala; missing galas are omitted. */
export type CutsByGala = Partial<Record<GalaCode, number>>;

/** Cuts for one event resolved in BOTH courses — a cut is course-specific. */
export type CutsByCourse = Record<Course, CutsByGala>;

/** An empty both-course cut set (the "no standards at all" starting point). */
export function emptyCutsByCourse(): CutsByCourse {
  return { LCM: {}, SCM: {} };
}

/**
 * Resolve every gala's cut for one (gender, distance, stroke, course) at an
 * exact age from a flat list of that event's cut rows (§4.9). Galas with no
 * applicable cut — no coverage, no row for that age, or the swimmer outside the
 * entry window — are omitted entirely, and the caller renders no line for them.
 */
export function pickApplicableStandards(
  rows: ReadonlyArray<StandardCut & { gala: GalaCode }>,
  galas: ReadonlyArray<GalaRef>,
  exactAge: number,
): CutsByGala {
  const ages = {} as Record<GalaCode, number>;
  for (const gala of galas) ages[gala.code] = exactAge;
  return pickApplicableStandardsPerGala(rows, galas, ages);
}

/** Tour dates by gala (ISO YYYY-MM-DD). Absent gala = no tour date set. */
export type TourDateByGala = Partial<Record<GalaCode, string>>;

/**
 * The exact age each gala's cut resolves at for one swimmer (the birthday
 * rule, per tour): a gala WITH a tour date judges the swimmer at the age they
 * will be ON TOUR DAY; a gala without one keeps `fallbackAge` (the age the PB
 * was swum, or today's age — current behaviour, §4.9). With no tour dates at
 * all this is `fallbackAge` across the board, i.e. exactly today's rule.
 */
export function galaResolutionAges(
  dob: string,
  fallbackAge: number,
  galas: ReadonlyArray<GalaRef>,
): Record<GalaCode, number> {
  const out = {} as Record<GalaCode, number>;
  for (const gala of galas) {
    const tourDate = gala.tourDate;
    out[gala.code] =
      tourDate != null ? computeAge(dob, tourDate) : fallbackAge;
  }
  return out;
}

/**
 * `pickApplicableStandards`, but each gala resolves at ITS OWN exact age —
 * needed because different tours fall on different dates and the swimmer may
 * age up between them. Same output shape, so `computeMatrixCell` /
 * `highestGalaMet` work unchanged; coverage holes and ineligible ages are still
 * omitted, never interpolated.
 */
export function pickApplicableStandardsPerGala(
  rows: ReadonlyArray<StandardCut & { gala: GalaCode }>,
  galas: ReadonlyArray<GalaRef>,
  ages: Record<GalaCode, number>,
): CutsByGala {
  const out: CutsByGala = {};
  const byCode = new Map(galas.map((g) => [g.code, g]));
  for (const code of GALA_ORDER) {
    const gala = byCode.get(code);
    if (gala === undefined) continue; // gala not loaded → nothing to resolve
    const ms = resolveGalaCut(
      gala,
      rows.filter((r) => r.gala === code),
      ages[code],
    );
    if (ms !== null) out[code] = ms;
  }
  return out;
}

/**
 * Which courses a qualifying surface is judging on. "BEST" is the honest answer
 * to "is my swimmer in?" — both courses are valid for entry, so a swimmer
 * qualifies if EITHER their LCM or their SCM headline meet PB beats that
 * course's own cut. "LCM"/"SCM" isolate one course for a per-course read.
 */
export type CourseMode = "LCM" | "SCM" | "BEST";

/** The courses a mode actually looks at, in a stable order. */
export function coursesForMode(mode: CourseMode): ReadonlyArray<Course> {
  return mode === "BEST" ? (["LCM", "SCM"] as const) : ([mode] as const);
}

/** Headline MEET PBs for one event, per course (absent/null = never raced). */
export type PbByCourse = Partial<Record<Course, number | null>>;

/** A gala met, and the course the swimmer actually met it in. */
export type GalaMet = { gala: GalaCode; course: Course };

/**
 * The HARDEST gala a swimmer's headline PBs meet, walking `GALA_ORDER`
 * (SANS → SANY → SANJ → L3 → L2). "Met" = a PB is at or under the cut FOR THE
 * SAME COURSE (`pbMs <= cut`) — a long-course PB is never measured against a
 * short-course cut. Galas with no cut are skipped. Returns null when none is
 * met. When both courses meet the same gala, the one with the bigger margin is
 * reported, so the surfaced course is the swimmer's strongest.
 */
export function highestGalaMet(
  pb: PbByCourse,
  cuts: CutsByCourse,
  mode: CourseMode = "BEST",
): GalaMet | null {
  const courses = coursesForMode(mode);
  for (const gala of GALA_ORDER) {
    let best: GalaMet | null = null;
    let bestMargin = -1;
    for (const course of courses) {
      const cut = cuts[course]?.[gala];
      const pbMs = pb[course];
      if (cut == null || pbMs == null || pbMs > cut) continue;
      const margin = cut - pbMs;
      if (margin > bestMargin) {
        bestMargin = margin;
        best = { gala, course };
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * One cell of the qualification status matrix (BRD §5.7): the hardest gala a
 * headline PB meets, plus the gap to the NEXT gala up. Purely derived so it is
 * unit-testable and identical everywhere.
 *
 * `cuts` are this event's cuts resolved to the swimmer's EXACT single-year age
 * and gender (never the two-year display band, §4.9), separately per course; a
 * gala is absent when it has no coverage, no row for that age, or the swimmer is
 * outside its entry window. Only galas that actually have a cut are considered,
 * so "next up" always points at a real target.
 *
 *   - `hasCut`     false when NO gala has a cut here → the cell is blank/neutral.
 *   - `gala`       the hardest gala met, or null if none met / no PB.
 *   - `galaCourse` which course met it (the cell's L/S marker); null if none met.
 *   - `nextGala`   the next-harder gala that still has a cut to aim for; null
 *                  once the hardest available gala is met (nothing left to chase).
 *   - `gapMs`      PB − the next gala's cut (always ≥ 0: how much to drop),
 *                  measured in whichever active course the swimmer is CLOSEST in.
 *                  null at the top gala, with no PB, or when no cut exists.
 *   - `gapCourse`  the course `gapMs` was measured in.
 */
export type MatrixCell = {
  hasCut: boolean;
  gala: GalaCode | null;
  galaCourse: Course | null;
  nextGala: GalaCode | null;
  gapMs: number | null;
  gapCourse: Course | null;
};

const BLANK_CELL: MatrixCell = {
  hasCut: false,
  gala: null,
  galaCourse: null,
  nextGala: null,
  gapMs: null,
  gapCourse: null,
};

export function computeMatrixCell(
  pb: PbByCourse,
  cuts: CutsByCourse,
  mode: CourseMode = "BEST",
): MatrixCell {
  const courses = coursesForMode(mode);

  // Galas that actually have a cut here in an active course, hardest → easiest.
  const available = GALA_ORDER.filter((gala) =>
    courses.some((course) => cuts[course]?.[gala] != null),
  );

  // No cut at any gala for this exact age → nothing to show (blank/neutral).
  if (available.length === 0) return BLANK_CELL;

  // A cut exists but no headline (meet) time yet in any active course: the
  // target is the easiest gala, but there is no gap to measure without a PB.
  const hasPb = courses.some((course) => pb[course] != null);
  if (!hasPb) {
    return {
      ...BLANK_CELL,
      hasCut: true,
      nextGala: available[available.length - 1],
    };
  }

  const met = highestGalaMet(pb, cuts, mode);
  const metIdx = met === null ? -1 : available.indexOf(met.gala);

  // Next gala up: one step harder than the one met. If the hardest available
  // gala is already met there is nothing above it; if none is met the target is
  // the easiest available gala.
  let nextGala: GalaCode | null;
  if (metIdx === 0) nextGala = null;
  else if (metIdx === -1) nextGala = available[available.length - 1];
  else nextGala = available[metIdx - 1];

  // The gap is the swimmer's BEST chance at that gala: the smallest shortfall
  // across the active courses, since either course would qualify them.
  let gapMs: number | null = null;
  let gapCourse: Course | null = null;
  if (nextGala !== null) {
    for (const course of courses) {
      const cut = cuts[course]?.[nextGala];
      const pbMs = pb[course];
      if (cut == null || pbMs == null) continue;
      const gap = pbMs - cut;
      if (gapMs === null || gap < gapMs) {
        gapMs = gap;
        gapCourse = course;
      }
    }
  }

  return {
    hasCut: true,
    gala: met?.gala ?? null,
    galaCourse: met?.course ?? null,
    nextGala,
    gapMs,
    gapCourse,
  };
}

// ---------------------------------------------------------------------------
// 8e. Stroke profile — per-event CALIBRATED radial metric (Step 12.5, §4.9)
// ---------------------------------------------------------------------------
//
// The stroke-profile wheel draws one bar per event around a circle. Raw times
// CANNOT share a radial axis (a 30 s 50 and a 9:00 800 would be incomparable),
// so each event's PB is mapped onto a PER-EVENT calibrated scale anchored to
// that event's own L2/L3/SANJ cuts:
//
//     L2 cut  -> inner ring   (radius 1)
//     L3 cut  -> middle ring  (radius 2)
//     SANJ cut-> outer ring   (radius 3)
//     centre  -> radius 0
//
// OUTWARD = FASTER. The returned value is in RING UNITS (unitless), so the
// wheel can place fixed pixel ring radii and every swimmer shares one scale.
// It is piecewise-linear between the anchors that exist, extrapolating beyond
// the fastest/slowest anchor along the nearest segment. Faster than SANJ pushes
// past the outer ring; slower than L2 falls toward the centre (clamped there).
//
// CRUCIAL invariant (acceptance): at a tier's exact cut the radius equals that
// tier's ring position exactly, so "the bar crosses the SANJ ring" is TRUE iff
// the PB beats the SANJ cut — regardless of how the between-ring slope is drawn.

/**
 * The three galas the wheel draws rings for. SANS and SANY are deliberately NOT
 * included: five concentric rings do not read, so extending the wheel to the
 * open galas is its own design step (Step B) rather than a mechanical widening.
 */
export type RingGala = "LEVEL_2" | "LEVEL_3" | "SANJ";

/** Fixed ring positions (radius units) for the three age-graded galas. */
export const STROKE_RING_POS: Record<RingGala, number> = {
  LEVEL_2: 1,
  LEVEL_3: 2,
  SANJ: 3,
};

/** Centre of the wheel (a PB slower than every cut clamps here). */
export const STROKE_RADIUS_MIN = 0;
/** How far a PB faster than SANJ may extrapolate past the outer ring. */
export const STROKE_RADIUS_MAX = 3.5;

// When a spoke has only ONE tier cut there is no second anchor to define a
// slope, so the bar is placed with a synthetic unit: one ring-unit = this
// fraction of the cut time. This only affects magnitude AWAY from that single
// ring; the crossing AT the ring is still exact (radius === ring pos at the cut).
const SINGLE_ANCHOR_UNIT_FRACTION = 0.04;

/** The three (possibly absent) cuts for one event, already resolved to an age. */
export type ProfileCuts = {
  l2Ms: number | null;
  l3Ms: number | null;
  sanjMs: number | null;
};

/**
 * Map a headline PB onto its event's calibrated radial scale (ring units), or
 * null when there is no PB or no cut to anchor against. See the section header
 * for the full contract; the short version:
 *   - returns exactly the ring position when pb equals that tier's cut,
 *   - interpolates linearly between adjacent anchors,
 *   - extrapolates past the extremes (clamped to [0, STROKE_RADIUS_MAX]).
 */
export function computeCalibratedRadius(
  pbMs: number | null,
  cuts: ProfileCuts,
): number | null {
  if (pbMs === null) return null;

  // Anchors present, ordered inner -> outer (ring pos ascending => cut ms
  // descending, since a harder tier is a faster cut).
  const anchors: Array<{ r: number; t: number }> = [];
  if (cuts.l2Ms !== null) anchors.push({ r: STROKE_RING_POS.LEVEL_2, t: cuts.l2Ms });
  if (cuts.l3Ms !== null) anchors.push({ r: STROKE_RING_POS.LEVEL_3, t: cuts.l3Ms });
  if (cuts.sanjMs !== null) anchors.push({ r: STROKE_RING_POS.SANJ, t: cuts.sanjMs });
  if (anchors.length === 0) return null;

  // The bar reaches a ring IFF the swimmer has MET that tier's cut — so a time
  // short of a cut can never look like it reached that ring (a 100 Breast 0.57s
  // slower than SANJ must not appear to touch the SANJ ring). Cap the radius at
  // the ring of the HIGHEST tier met (pbMs ≤ cut, hardest first): SANJ met earns
  // headroom past its ring (a real achievement); L3/L2 met caps exactly on that
  // ring; nothing met keeps the sub-ring calibrated position (the PB is slower
  // than the easiest cut, so it already sits below the innermost ring). This
  // keeps the wheel and the road "all tiers" bars honest — bar length reads as
  // "tier achieved", never "tier nearly achieved".
  let maxRadius: number;
  if (cuts.sanjMs !== null && pbMs <= cuts.sanjMs) {
    maxRadius = STROKE_RADIUS_MAX;
  } else if (cuts.l3Ms !== null && pbMs <= cuts.l3Ms) {
    maxRadius = STROKE_RING_POS.LEVEL_3;
  } else if (cuts.l2Ms !== null && pbMs <= cuts.l2Ms) {
    maxRadius = STROKE_RING_POS.LEVEL_2;
  } else {
    // Nothing met — never reach the innermost (easiest) present ring.
    maxRadius = anchors[0].r;
  }
  const clamp = (r: number) =>
    Math.max(STROKE_RADIUS_MIN, Math.min(maxRadius, r));

  // Single anchor: synthetic slope so the bar still reads direction + rough
  // magnitude. Crossing at the ring stays exact.
  if (anchors.length === 1) {
    const a = anchors[0];
    const unit = a.t * SINGLE_ANCHOR_UNIT_FRACTION;
    if (unit <= 0) return clamp(a.r);
    return clamp(a.r + (a.t - pbMs) / unit);
  }

  // >= 2 anchors: piecewise-linear in (t -> r). `onSegment(i)` maps pb using the
  // line through anchors[i] and anchors[i+1]; it passes through both exactly.
  const n = anchors.length;
  const onSegment = (i: number): number => {
    const denom = anchors[i].t - anchors[i + 1].t;
    if (denom === 0) return anchors[i].r; // degenerate (equal cuts) — no slope
    const slope = (anchors[i + 1].r - anchors[i].r) / denom;
    return anchors[i].r + (anchors[i].t - pbMs) * slope;
  };

  if (pbMs >= anchors[0].t) return clamp(onSegment(0)); // slower than slowest cut
  if (pbMs <= anchors[n - 1].t) return clamp(onSegment(n - 2)); // faster than fastest
  for (let i = 0; i < n - 1; i++) {
    if (pbMs <= anchors[i].t && pbMs >= anchors[i + 1].t) return clamp(onSegment(i));
  }
  return clamp(onSegment(0)); // unreachable, keeps the type total
}

// ---------------------------------------------------------------------------
// 8b. importStandards — pure validation/parsing of the coach's cleaned CSV rows
// ---------------------------------------------------------------------------
//
// The Convex mutation is a thin wrapper: it loads the event whitelist, runs
// `prepareStandardImport`, then idempotently upserts the accepted rows. All the
// judgement — parse, whitelist, coverage — lives here so it is unit-testable and
// so a bad row is REPORTED with a reason, never silently dropped or guessed.

/**
 * One raw row as it arrives from the cleaned CSV (loosely typed on purpose).
 * `age` is EMPTY on an open-gala row — SANS/SANY publish one cut for all ages.
 */
export type RawStandardRow = {
  gala: string;
  course: string;
  gender: string;
  distance: number | string;
  stroke: string;
  age: number | string | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  time: string;
};

/** A validated, parsed row ready to persist to the `standards` table. */
export type PreparedStandard = {
  gala: GalaCode;
  course: Course;
  gender: "M" | "F";
  distance: Distance;
  stroke: Stroke;
  /** Absent on an open standard; an exact single-year age otherwise. */
  age?: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  timeMs: number;
};

/** A rejected row: kept with its original index + a human reason (never dropped). */
export type RejectedStandard = {
  index: number;
  reason: string;
  row: RawStandardRow;
};

const GENDER_SET = new Set(["M", "F"]);
const COURSE_SET = new Set<Course>(["LCM", "SCM"]);

/**
 * Validate + parse raw standard rows (§4.4, §4.9). Returns the accepted rows
 * (parsed to ms) and the rejected rows (with a reason each). A row is rejected
 * if any field is off-enum, the age is present but not a sane whole number, both
 * catch-all flags are set, the (distance, stroke) is not a valid event in that
 * course, the gala does not cover that event, the gala's age scope disagrees with
 * whether an age was supplied, or the time fails `parseTime`. Nothing is guessed.
 *
 * `galas` supplies coverage and age scope, so a new meet needs no code change.
 */
export function prepareStandardImport(
  rows: ReadonlyArray<RawStandardRow>,
  events: ReadonlyArray<EventDef>,
  galas: ReadonlyArray<GalaCoverage & { code: GalaCode; ageScope: AgeScope }>,
): { accepted: PreparedStandard[]; rejected: RejectedStandard[] } {
  const accepted: PreparedStandard[] = [];
  const rejected: RejectedStandard[] = [];
  const galaByCode = new Map(galas.map((g) => [g.code as string, g]));

  rows.forEach((row, index) => {
    const reject = (reason: string) => rejected.push({ index, reason, row });

    const gala = galaByCode.get(row.gala);
    if (gala === undefined) {
      return reject(`unknown gala "${row.gala}"`);
    }
    if (!COURSE_SET.has(row.course as Course)) {
      return reject(`unknown course "${row.course}" (expected LCM or SCM)`);
    }
    if (!GENDER_SET.has(row.gender)) {
      return reject(`unknown gender "${row.gender}" (expected M or F)`);
    }

    const distance = Number(row.distance);
    if (!DISTANCE_ORDER.includes(distance as Distance)) {
      return reject(`invalid distance "${row.distance}"`);
    }
    if (STROKE_ORDER.indexOf(row.stroke as Stroke) < 0) {
      return reject(`invalid stroke "${row.stroke}"`);
    }

    // An OPEN gala must have no age; an AGE_GRADED gala must have one. Getting
    // this wrong would make a cut resolve for every age, or for none.
    const ageBlank =
      row.age === null || row.age === undefined || String(row.age).trim() === "";
    if (gala.ageScope === "OPEN") {
      if (!ageBlank) {
        return reject(`${row.gala} is an open gala — its rows must have no age`);
      }
    } else if (ageBlank) {
      return reject(`${row.gala} is age-graded — every row needs an exact age`);
    }

    let age: number | undefined;
    if (!ageBlank) {
      age = Number(row.age);
      if (!Number.isInteger(age) || age <= 0 || age > 100) {
        return reject(`invalid age "${row.age}"`);
      }
    }

    if (typeof row.isCatchAllYoung !== "boolean" || typeof row.isCatchAllOld !== "boolean") {
      return reject("catch-all flags must be booleans");
    }
    if (row.isCatchAllYoung && row.isCatchAllOld) {
      return reject("row flagged as BOTH young and old catch-all");
    }
    if (ageBlank && (row.isCatchAllYoung || row.isCatchAllOld)) {
      return reject("an open standard cannot be a catch-all");
    }

    const course = row.course as Course;
    const stroke = row.stroke as Stroke;

    // The event must exist AND be swimmable in this cut's course (§4.3).
    if (!isValidEvent(distance, stroke, course, events)) {
      return reject(`not a valid ${course} event: ${eventLabel(distance, stroke)}`);
    }
    if (!galaCoversEvent(gala, distance, stroke)) {
      return reject(`${row.gala} has no coverage for ${eventLabel(distance, stroke)}`);
    }

    let timeMs: number;
    try {
      timeMs = parseTime(row.time);
    } catch (err) {
      return reject(
        `unparseable time "${row.time}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    accepted.push({
      gala: gala.code,
      course,
      gender: row.gender as "M" | "F",
      distance: distance as Distance,
      stroke,
      ...(age === undefined ? {} : { age }),
      isCatchAllYoung: row.isCatchAllYoung,
      isCatchAllOld: row.isCatchAllOld,
      timeMs,
    });
  });

  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// 8c. parseStandardsCsv — coerce the raw CSV text into typed rows (Step 9)
// ---------------------------------------------------------------------------
//
// The CSV gives STRINGS. `importStandards` wants real types: distance/age as
// numbers and the two catch-all flags as real booleans (the literal string
// "false" is truthy in JS and would silently break catch-all resolution — the
// exact trap called out in §5.8). This parser does that coercion up front and
// sends any row it cannot coerce to a rejected report with a reason — it never
// guesses. Enum-, coverage- and time-parsing live server-side in
// `prepareStandardImport`; those rejects merge with these on the screen.

/** The 9 columns of the cleaned CSV, in order (§11a). */
export const STANDARDS_CSV_COLUMNS = [
  "gala",
  "course",
  "gender",
  "distance",
  "stroke",
  "age",
  "isCatchAllYoung",
  "isCatchAllOld",
  "time",
] as const;

/**
 * A CSV row after coercion — distance is a real number, `age` is a real number
 * or null (blank = an open standard), and the catch-all flags are real booleans:
 * exactly the shape `importStandards` accepts (a stricter `RawStandardRow`,
 * which types those loosely for its own reporting).
 */
export type StandardImportRow = {
  gala: string;
  course: string;
  gender: string;
  distance: number;
  stroke: string;
  age: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  time: string;
};

/** A row that survived coercion, tagged with its 1-based source line. */
export type ParsedCsvRow = { row: StandardImportRow; line: number };

/** A row we could not coerce: kept with its source line + a human reason. */
export type CsvReject = { line: number; reason: string; raw: string };

/** Strict boolean coercion: only "true"/"false" (any case). Anything else → null. */
function coerceBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/**
 * Parse the coach's cleaned CSV text into typed rows ready for
 * `importStandards`, plus a rejected report. A leading `gala,course,…` header
 * row is detected and skipped; blank lines are ignored. Each data line must
 * have exactly 9 comma-separated cells; distance must be a whole number, `age`
 * must be a whole number OR blank (an open standard), the two flags must be
 * "true"/"false", and time must be non-empty. Everything else (gala/course/
 * gender/stroke enums, coverage, age scope, the time format itself) is validated
 * downstream and reported there.
 */
export function parseStandardsCsv(text: string): {
  rows: ParsedCsvRow[];
  rejected: CsvReject[];
} {
  const rows: ParsedCsvRow[] = [];
  const rejected: CsvReject[] = [];
  let sawFirstNonEmpty = false;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "") return; // ignore blank lines

    const cells = raw.split(",").map((c) => c.trim());

    // The first non-empty line may be the header — detect and skip it once.
    if (!sawFirstNonEmpty) {
      sawFirstNonEmpty = true;
      if (cells[0].toLowerCase() === "gala") return;
    }

    const reject = (reason: string) => rejected.push({ line, reason, raw });

    if (cells.length !== 9) {
      return reject(`expected 9 columns, got ${cells.length}`);
    }

    const [gala, course, gender, distanceStr, stroke, ageStr, youngStr, oldStr, time] =
      cells;

    const distance = Number(distanceStr);
    if (distanceStr === "" || !Number.isInteger(distance)) {
      return reject(`distance "${distanceStr}" is not a whole number`);
    }
    // A BLANK age is meaningful, not missing: it marks an open standard. Only a
    // non-blank, non-integer age is an error.
    let age: number | null = null;
    if (ageStr !== "") {
      const parsed = Number(ageStr);
      if (!Number.isInteger(parsed)) {
        return reject(`age "${ageStr}" is not a whole number`);
      }
      age = parsed;
    }

    const isCatchAllYoung = coerceBool(youngStr);
    if (isCatchAllYoung === null) {
      return reject(`isCatchAllYoung "${youngStr}" must be true or false`);
    }
    const isCatchAllOld = coerceBool(oldStr);
    if (isCatchAllOld === null) {
      return reject(`isCatchAllOld "${oldStr}" must be true or false`);
    }

    if (time === "") return reject("time is empty");

    rows.push({
      line,
      row: {
        gala,
        course,
        gender,
        distance,
        stroke,
        age,
        isCatchAllYoung,
        isCatchAllOld,
        time,
      },
    });
  });

  return { rows, rejected };
}

// ---------------------------------------------------------------------------
// 8d. Monotonicity — surface (don't block) a younger cut faster than an older
// ---------------------------------------------------------------------------
//
// Within one (gala, course, gender, event) the cut should get FASTER (smaller
// ms) as age rises. A younger age whose cut is faster than an older age's is
// usually a typo (§5.8, §11a) — but the 2027 SSA tables contain a real one
// (SANJ women 100 Back: 12&U 1:12.98, 13 1:14.83, in BOTH courses), so we WARN,
// never block. Open galas have a single cut and cannot be inverted.

/** The cut fields the monotonicity check reads (a single gala's column). */
export type AgeCut = {
  age?: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  timeMs: number;
};

/** A younger cut found faster than the next older one, by index into the input. */
export type AgeInversion = { youngerIdx: number; olderIdx: number };

/**
 * Position of a cut on the age axis. A youngest catch-all ("10&U") sits just
 * below its bound and an oldest catch-all ("17-19") just above its bound, so a
 * catch-all orders correctly against the exact ages around it.
 */
export function cutAgeOrder(c: {
  age?: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): number {
  if (c.age == null) return 0; // open standard — no position on the age axis
  if (c.isCatchAllYoung) return c.age - 0.5;
  if (c.isCatchAllOld) return c.age + 0.5;
  return c.age;
}

/**
 * Adjacent-pair monotonicity check over ONE gala's cuts for a single event and
 * course. Orders by age, then reports each neighbouring pair where the younger
 * cut is strictly faster than the older (an inversion). Equal times are fine (a
 * plateau). Indices refer to the input array so callers can flag exact rows.
 *
 * Callers MUST pass one (gala, course, gender, event) column at a time — mixing
 * courses would compare a 25 m cut against a 50 m one and invent inversions.
 * Open standards (no age) are skipped: a single cut cannot be inverted.
 */
export function findAgeInversions(
  cuts: ReadonlyArray<AgeCut>,
): AgeInversion[] {
  const ordered = cuts
    .map((c, idx) => ({ idx, key: cutAgeOrder(c), timeMs: c.timeMs, age: c.age }))
    .filter((c) => c.age != null)
    .sort((a, b) => a.key - b.key);

  const out: AgeInversion[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const younger = ordered[i - 1];
    const older = ordered[i];
    if (younger.timeMs < older.timeMs) {
      out.push({ youngerIdx: younger.idx, olderIdx: older.idx });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 9. Season improvement — time dropped over the season (BRD §5.12, Step 13)
// ---------------------------------------------------------------------------
//
// "Who is responding to training." For each event a swimmer has raced this
// season, measure the drop between their FIRST in-season MEET time (the
// baseline) and their fastest in-season MEET time (their current best this
// season). MEET times only — trials/practice never count (§4.6). Course is kept
// STRICTLY separate (§4.2): each (distance, stroke, course) is its own event, so
// an SCM and an LCM 100 Free are never averaged or compared together. A swimmer
// with a single in-season MEET point can't have a drop measured → "insufficient
// data" (never reported as 0%). All pure so the same rules run in the Convex
// query and in unit tests. Times are integer ms; dates are ISO "YYYY-MM-DD" and
// compared lexicographically (safe for that format).

/**
 * The season start for the DEFAULT rolling 12-month window: exactly one year
 * before `todayIso`. UTC-based so a plain "YYYY-MM-DD" is timezone-stable; a
 * Feb-29 today normalises to Mar-1 of the prior year (harmless for a window
 * boundary). Used whenever the coach has not set an explicit season start.
 */
export function rollingSeasonStart(todayIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso.trim());
  if (!m) {
    throw new Error(`rollingSeasonStart: invalid date "${todayIso}"`);
  }
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCFullYear(dt.getUTCFullYear() - 1);
  return dt.toISOString().slice(0, 10);
}

/** True when an ISO swim date falls on or after the season start (inclusive). */
export function isInSeason(swimDateIso: string, seasonStartIso: string): boolean {
  return swimDateIso >= seasonStartIso;
}

/** The minimal result fields the season-improvement derivation reads. */
export type SeasonSwim = {
  distance: Distance | number;
  stroke: Stroke | string;
  course: Course | string;
  timeMs: number;
  swimType: SwimType | string;
  swimDate: string; // ISO "YYYY-MM-DD"
};

/** One event×course's in-season improvement for a swimmer (§5.12). */
export type SeasonEventImprovement = {
  distance: Distance;
  stroke: Stroke;
  course: Course;
  label: string;
  count: number; // number of in-season MEET times for this event×course
  firstMs: number; // baseline — the earliest in-season MEET time
  firstDate: string;
  currentMs: number; // the fastest in-season MEET time (this season's best)
  currentDate: string;
  improvedMs: number | null; // firstMs − currentMs (≥ 0); null when insufficient
  improvedPct: number | null; // improvedMs as % of the baseline, 2dp; null when insufficient
  insufficient: boolean; // true when count < 2 — a drop can't be measured
};

/**
 * Every event×course a swimmer has an in-season MEET time in, with its drop
 * (§5.12). Groups the swimmer's swims by (distance, stroke, course) after
 * keeping only in-season MEET swims, then for each group takes the baseline
 * (earliest date; ties → the faster time, so a gain is never overstated) and
 * the current best (fastest time; ties → the earlier date). A single-point group
 * is returned flagged `insufficient` with null deltas, never 0%. Sorted 50→1500,
 * then stroke, then course (LCM before SCM).
 */
export function computeSeasonImprovements(
  swims: ReadonlyArray<SeasonSwim>,
  seasonStartIso: string,
): SeasonEventImprovement[] {
  const groups = new Map<string, { timeMs: number; swimDate: string }[]>();
  for (const s of swims) {
    if (s.swimType !== "MEET") continue;
    if (!isInSeason(s.swimDate, seasonStartIso)) continue;
    const key = `${s.distance}|${s.stroke}|${s.course}`;
    const pt = { timeMs: s.timeMs, swimDate: s.swimDate };
    const arr = groups.get(key);
    if (arr) arr.push(pt);
    else groups.set(key, [pt]);
  }

  const out: SeasonEventImprovement[] = [];
  for (const [key, pts] of groups) {
    const [dStr, stroke, course] = key.split("|");
    const distance = Number(dStr) as Distance;

    // Baseline = earliest date (tie → faster time). Current = fastest time
    // (tie → earlier date). Both walked in one pass over the group's points.
    let first = pts[0];
    let fastest = pts[0];
    for (const p of pts) {
      if (
        p.swimDate < first.swimDate ||
        (p.swimDate === first.swimDate && p.timeMs < first.timeMs)
      ) {
        first = p;
      }
      if (
        p.timeMs < fastest.timeMs ||
        (p.timeMs === fastest.timeMs && p.swimDate < fastest.swimDate)
      ) {
        fastest = p;
      }
    }

    const insufficient = pts.length < 2;
    const improvedMs = insufficient ? null : first.timeMs - fastest.timeMs;
    const improvedPct =
      improvedMs === null || first.timeMs <= 0
        ? insufficient
          ? null
          : 0
        : Math.round((improvedMs / first.timeMs) * 10000) / 100;

    out.push({
      distance,
      stroke: stroke as Stroke,
      course: course as Course,
      label: eventLabel(distance, stroke),
      count: pts.length,
      firstMs: first.timeMs,
      firstDate: first.swimDate,
      currentMs: fastest.timeMs,
      currentDate: fastest.swimDate,
      improvedMs,
      improvedPct,
      insufficient,
    });
  }

  out.sort((a, b) => {
    const ka = eventSortKey(a.distance, a.stroke);
    const kb = eventSortKey(b.distance, b.stroke);
    if (ka !== kb) return ka - kb;
    return a.course.localeCompare(b.course); // LCM before SCM
  });

  return out;
}

/** A swimmer's OVERALL season improvement, averaged across their events (§5.12). */
export type OverallImprovement = {
  eventsInSeason: number; // events with ≥ 1 in-season MEET time
  eventsMeasured: number; // events with ≥ 2 (a drop could be measured)
  avgImprovedPct: number | null; // mean of measured events' %, 2dp; null when none
  totalImprovedMs: number | null; // sum of measured events' drops; null when none
  best: SeasonEventImprovement | null; // the biggest-drop measured event, for context
  insufficient: boolean; // true when no event had ≥ 2 in-season MEET times
};

/**
 * Collapse a swimmer's per-event improvements (from `computeSeasonImprovements`)
 * into one overall figure: the average % improvement across only the events that
 * could actually be measured (≥ 2 in-season MEET times). A swimmer whose every
 * event is a single point is `insufficient` with a null average — never 0%. The
 * biggest-drop event is carried through as `best` for a one-line UI detail.
 */
export function computeOverallImprovement(
  perEvent: ReadonlyArray<SeasonEventImprovement>,
): OverallImprovement {
  const measured = perEvent.filter((e) => !e.insufficient);
  if (measured.length === 0) {
    return {
      eventsInSeason: perEvent.length,
      eventsMeasured: 0,
      avgImprovedPct: null,
      totalImprovedMs: null,
      best: null,
      insufficient: true,
    };
  }

  const sumPct = measured.reduce((s, e) => s + (e.improvedPct as number), 0);
  const totalImprovedMs = measured.reduce(
    (s, e) => s + (e.improvedMs as number),
    0,
  );
  const best = measured.reduce((b, e) =>
    (e.improvedPct as number) > (b.improvedPct as number) ? e : b,
  );

  return {
    eventsInSeason: perEvent.length,
    eventsMeasured: measured.length,
    avgImprovedPct: Math.round((sumPct / measured.length) * 100) / 100,
    totalImprovedMs,
    best,
    insufficient: false,
  };
}

// ---------------------------------------------------------------------------
// Time-to-qualify projection (BRD §5.6, §5.12 — Step 14)
// ---------------------------------------------------------------------------
//
// The single most abuse-prone view in the app, so the guard rails are hard, not
// advisory. We fit a straight line to a swimmer's RECENT meet times and read off
// where — if that exact rate held — it would cross a chosen tier's cut. It is an
// ESTIMATE, never a promise: the pieces below refuse to draw anything unless
// there is a real, downward trend to extend, and cap how far out we'll guess.
//
//   • linearFit       least-squares line, or null when the input can't support a
//                     genuine downward trend (< 4 points, no date spread, flat or
//                     rising). y is time in ms, x is a day number, so a NEGATIVE
//                     slope means the swimmer is getting faster.
//   • projectCrossing where a downward line meets a target time, as a Date; null
//                     for any line that isn't improving (it never crosses down).
//   • computeQualifyProjection ties the two together with the §5.6 guard rails:
//                     ≥ 4 meet times, a real downward trend, a ~12-month horizon,
//                     and the already-qualified / no-coverage short-circuits.

const MS_PER_DAY = 86_400_000;

/** How many recent MEET times the trend is fit to — "recent rate", not lifetime. */
export const PROJECTION_RECENT_MEETS = 8;
/** The minimum meet times required before any trend is drawn (§5.6). */
export const PROJECTION_MIN_MEETS = 4;
/** The horizon cap: crossings past this many months read as "beyond horizon". */
export const PROJECTION_HORIZON_MONTHS = 12;

/** ISO "YYYY-MM-DD" → whole-day number since the epoch (UTC midnight, exact). */
function isoToEpochDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) throw new Error(`isoToEpochDay: invalid date "${iso}"`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

/** ISO date + N calendar months → the resulting day number (UTC). */
function addMonthsToEpochDay(iso: string, months: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) throw new Error(`addMonthsToEpochDay: invalid date "${iso}"`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime() / MS_PER_DAY;
}

/** A single (x, y) sample for the fit — x a day number, y a time in ms. */
export type ProjectionPoint = { x: number; y: number };

/** A fitted line `y = slope·x + intercept`; slope is ms of time per day. */
export type LinearFit = { slope: number; intercept: number };

/**
 * Least-squares line through the points, or **null** when the data can't carry a
 * genuine downward (improving) trend (§5.6). Returns null when:
 *   - there are fewer than `PROJECTION_MIN_MEETS` points (too little to trust),
 *   - every point shares one x (no date spread → slope undefined), or
 *   - the slope is not strictly negative (flat or getting slower is "no trend").
 * y is time in ms and x is a day number, so slope < 0 == getting faster.
 */
export function linearFit(
  points: ReadonlyArray<ProjectionPoint>,
): LinearFit | null {
  const n = points.length;
  if (n < PROJECTION_MIN_MEETS) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    sxx += dx * dx;
    sxy += dx * (p.y - meanY);
  }
  if (sxx === 0) return null; // all on one date — no trend to draw

  const slope = sxy / sxx;
  if (!(slope < 0)) return null; // flat or rising is "no clear trend" (§5.6)

  return { slope, intercept: meanY - slope * meanX };
}

/**
 * The date at which a downward line reaches `targetMs`, or **null** for any line
 * that isn't improving (a flat or rising line never crosses a faster target). The
 * returned Date is derived purely from the fit's x-as-day-number convention, so
 * it is a real calendar date the caller can horizon-check and label.
 */
export function projectCrossing(
  fit: LinearFit,
  targetMs: number,
): Date | null {
  if (!(fit.slope < 0)) return null; // only an improving line crosses downward
  const xCross = (targetMs - fit.intercept) / fit.slope;
  if (!Number.isFinite(xCross)) return null;
  return new Date(Math.round(xCross * MS_PER_DAY));
}

/** The minimal meet-time shape the projection reads. */
export type ProjectionMeet = { swimDate: string; timeMs: number };

/**
 * The outcome of a projection attempt — a discriminated union so the UI renders
 * exactly one honest state and never a bare date. Every non-`projected` case
 * carries enough to explain itself in plain words.
 */
export type QualifyProjection =
  | { status: "no_cut" } // the tier has no cut for this event/age (§4.9)
  | { status: "not_enough_data"; meetCount: number } // < 4 meet times
  | { status: "no_trend"; meetCount: number } // flat or getting slower
  | { status: "already_qualified"; cutMs: number; bestMs: number }
  | { status: "beyond_horizon"; cutMs: number; slopeMsPerDay: number; meetCount: number }
  | {
      status: "projected";
      cutMs: number;
      slopeMsPerDay: number; // negative — ms dropped per day at the recent rate
      etaIso: string; // ISO date the trend meets the cut (clamped to ≥ today)
      fromT: number; // dashed-segment start, epoch ms (on the fitted line)
      fromMs: number;
      toT: number; // dashed-segment end, epoch ms (the crossing)
      toMs: number; // == cutMs
      meetCount: number;
    };

/**
 * Fit the recent meet trend and, guard rails permitting (§5.6), project when it
 * would reach `cutMs`. The order of the short-circuits is deliberate:
 *   1. no cut for this tier/age → nothing to chase.
 *   2. already met the cut (fastest meet ever ≤ cut, §4.6) → celebrate, don't guess.
 *   3. fewer than 4 meet times → not enough data.
 *   4. no genuine downward trend in the recent window → no clear trend.
 *   5. crossing past the ~12-month horizon → "beyond horizon at current rate".
 * A crossing that lands in the past (the recent line already sits at the cut) is
 * clamped to today so the dashed segment never points backwards. The returned
 * segment endpoints ride the fitted line, so the estimate reads as a clean
 * continuation of the trend rather than a connector to the last raw dot.
 */
export function computeQualifyProjection(
  meets: ReadonlyArray<ProjectionMeet>,
  cutMs: number | null,
  todayIso: string,
  opts?: { recentMeets?: number; horizonMonths?: number },
): QualifyProjection {
  const recentN = opts?.recentMeets ?? PROJECTION_RECENT_MEETS;
  const horizonMonths = opts?.horizonMonths ?? PROJECTION_HORIZON_MONTHS;

  if (cutMs === null) return { status: "no_cut" };

  const sorted = [...meets].sort((a, b) =>
    a.swimDate < b.swimDate ? -1 : a.swimDate > b.swimDate ? 1 : 0,
  );
  const meetCount = sorted.length;
  if (meetCount === 0) return { status: "not_enough_data", meetCount: 0 };

  // Headline PB = fastest meet ever (§4.6). If it already beats the cut, there is
  // nothing to project — the swimmer has qualified.
  let bestMs = Infinity;
  for (const m of sorted) if (m.timeMs < bestMs) bestMs = m.timeMs;
  if (bestMs <= cutMs) return { status: "already_qualified", cutMs, bestMs };

  if (meetCount < PROJECTION_MIN_MEETS) {
    return { status: "not_enough_data", meetCount };
  }

  // Fit only the recent window — "assumes recent rate continues", not lifetime.
  const recent = sorted.slice(Math.max(0, meetCount - recentN));
  const points: ProjectionPoint[] = recent.map((m) => ({
    x: isoToEpochDay(m.swimDate),
    y: m.timeMs,
  }));

  const fit = linearFit(points);
  if (fit === null) return { status: "no_trend", meetCount };

  // Anchor the dashed estimate to the swimmer's actual recent BEST — the fastest
  // meet in the window (ties → the most recent) — rather than the fitted line's
  // value at the last date. A single slow outlier (a bad swim, a mis-entry) pulls
  // the least-squares line UP, so the fitted value can sit well above the real
  // recent times; drawing from there makes the projection look detached, starting
  // above where the swimmer plainly is. Starting from a real personal-best point
  // keeps the estimate honest and the line visibly continuous with the data. The
  // recent best is always slower than the cut here (already-qualified short-
  // circuited above), so the segment always descends toward the cut.
  let anchor = points[0];
  for (const p of points) {
    if (p.y < anchor.y || (p.y === anchor.y && p.x > anchor.x)) anchor = p;
  }
  const anchorDay = anchor.x;
  const anchorMs = anchor.y;

  // Where the recent slope, carried on from that anchor, meets the cut. slope < 0
  // and anchorMs > cutMs, so the crossing is strictly after the anchor.
  const crossDay = anchorDay + (cutMs - anchorMs) / fit.slope;

  const todayDay = isoToEpochDay(todayIso);
  const horizonEndDay = addMonthsToEpochDay(todayIso, horizonMonths);
  if (crossDay > horizonEndDay) {
    return {
      status: "beyond_horizon",
      cutMs,
      slopeMsPerDay: fit.slope,
      meetCount,
    };
  }

  // A crossing already in the past means the recent rate has the swimmer at the
  // cut now; clamp to today so the estimate reads "about now", never backwards.
  const etaDay = Math.max(crossDay, todayDay);
  const toT = Math.round(etaDay * MS_PER_DAY);

  return {
    status: "projected",
    cutMs,
    slopeMsPerDay: fit.slope,
    etaIso: new Date(toT).toISOString().slice(0, 10),
    fromT: Math.round(anchorDay * MS_PER_DAY),
    fromMs: anchorMs,
    toT,
    toMs: cutMs,
    meetCount,
  };
}

// ---------------------------------------------------------------------------
// 10. Result-write authorization — the ONE viewer write (BRD §R15)
// ---------------------------------------------------------------------------
//
// Coaches (and the super-user) edit; viewers are read-only EVERYWHERE except
// one narrow path: logging/editing/deleting a SCHOOL_GALA time for a swimmer
// they are linked to. This pure predicate encodes that rule so the exact same
// judgement runs in the Convex mutations (server-enforced) and in unit tests.
// The convex wrapper (`assertMayWriteResult`) loads the link/club facts and
// hands them here; here we only decide.

export type WriteRole = "SUPER_USER" | "COACH" | "VIEWER";

/**
 * The facts a result write is judged on:
 *   - `managesSwimmer`  the caller is staff who may EDIT this swimmer (a coach in
 *                       the swimmer's club, or the super-user).
 *   - `linkedToSwimmer` the caller is a viewer linked to this swimmer.
 *   - `targetSwimType`  the swim type the write RESULTS in (an edit's new type,
 *                       or the row's own type for a create/delete).
 *   - `existingSwimType` the row's current type — set for edit/delete, so a
 *                       viewer can never touch (or retype) a non-gala row.
 */
export type ResultWriteRequest = {
  role: WriteRole;
  managesSwimmer: boolean;
  linkedToSwimmer: boolean;
  targetSwimType: SwimType;
  existingSwimType?: SwimType;
};

/**
 * Decide whether a result write is allowed. Returns `null` when allowed, or a
 * human-readable reason string when rejected (the caller throws it).
 *
 *   - Staff (COACH / SUPER_USER): allowed only when they manage the swimmer;
 *     any swim type, including SCHOOL_GALA.
 *   - VIEWER: allowed ONLY when linked to the swimmer AND the write both lands
 *     on SCHOOL_GALA and (for an edit/delete) touches a row that is already
 *     SCHOOL_GALA. Every other viewer write — a meet time, retyping a gala to a
 *     meet, editing someone else's row — is rejected.
 */
export function authorizeResultWrite(req: ResultWriteRequest): string | null {
  if (req.role === "SUPER_USER" || req.role === "COACH") {
    return req.managesSwimmer
      ? null
      : "You can only edit swimmers in your own club.";
  }

  // VIEWER — the single allowed write.
  if (!req.linkedToSwimmer) {
    return "You can only log times for your own swimmer.";
  }
  if (req.targetSwimType !== "SCHOOL_GALA") {
    return "Parents can only log school gala times.";
  }
  if (req.existingSwimType !== undefined && req.existingSwimType !== "SCHOOL_GALA") {
    return "Parents can only change school gala times.";
  }
  return null;
}
