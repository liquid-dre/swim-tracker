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
  50, 100, 200, 400, 800, 1500,
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
// 7. Personal bests — DERIVED, never stored (BRD §4.6, Step 6)
// ---------------------------------------------------------------------------
//
// The headline PB is the fastest MEET time for a (distance, stroke, course);
// time trials and practice NEVER count toward it. `overallBest` is the fastest
// across ALL swim types (secondary). `improvement` measures the earliest logged
// swim (any type) against the current headline PB. All pure so it can be unit-
// tested and run identically on the server (Convex) and, if needed, the client.

export type SwimType = "MEET" | "TIME_TRIAL" | "PRACTICE";

/** The minimal result fields the PB derivation reads. */
export type ResultForPB = {
  distance: Distance | number;
  stroke: Stroke | string;
  course: Course | string;
  timeMs: number;
  swimType: SwimType | string;
  swimDate: string; // ISO "YYYY-MM-DD"
  meetName?: string;
};

/** Headline PB = the fastest MEET swim (with the date + meet it was set at). */
export type HeadlinePB = {
  timeMs: number;
  swimDate: string;
  meetName: string | null;
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
  const groups = new Map<string, ResultForPB[]>();
  for (const r of results) {
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
// 8. Qualifying standards — tiers, coverage, resolution (BRD §4.9, Step 8)
// ---------------------------------------------------------------------------
//
// All standards are LONG COURSE (LCM) only — never SCM (§4.2, §4.9). Every
// function here is pure so the same rules run in the Convex importer/queries
// and in unit tests. Times are integer milliseconds (via parseTime).

export type Tier = "LEVEL_2" | "LEVEL_3" | "SANJ";

/**
 * Tier order HARDEST → EASIEST (§4.9 — deliberately inverted from the names):
 * SANJ (fastest cut) > LEVEL_3 > LEVEL_2 (entry). Every "highest tier met" and
 * colour/rank decision must walk tiers in this order.
 */
export const TIER_ORDER: ReadonlyArray<Tier> = ["SANJ", "LEVEL_3", "LEVEL_2"];

/**
 * Coverage is a HARD rule (§4.9), not merely missing data: a tier only has cuts
 * for the events listed below (LCM implied). Anything else has no cut and must
 * never be imported, resolved, or drawn — never interpolate or borrow a tier.
 *
 *   - 50 m:     LEVEL_2 only (no 50 m L3/SANJ, ever).
 *   - LEVEL_2:  up to 200 m inclusive (+ 200 IM); nothing longer.
 *   - LEVEL_3:  100/200/400 + 200 IM; no 50s, no 800/1500, no 200 Fly, no 400 IM.
 *   - SANJ:     100→1500 Free, all strokes' 100/200, 400 Free/IM, 200 IM; no 50s.
 *
 * Note this is coverage only; whether the (distance, stroke) is a real LCM event
 * is a separate check (`isValidEvent(..., "LCM", …)`), e.g. 100 IM is SCM-only.
 */
export function tierCoversEvent(
  tier: Tier,
  distance: Distance | number,
  stroke: Stroke | string,
): boolean {
  const d = Number(distance);
  const s = stroke as Stroke;
  switch (tier) {
    case "LEVEL_2":
      // Everything up to 200 m (50 m is LEVEL_2-only; 200 IM included).
      return d <= 200;
    case "LEVEL_3":
      if (s === "IM") return d === 200; // 200 IM only (no 400 IM)
      if (s === "FLY") return d === 100; // no 200 Fly
      if (s === "FREE") return d === 100 || d === 200 || d === 400;
      return d === 100 || d === 200; // BACK / BREAST
    case "SANJ":
      if (s === "FREE") return d >= 100; // 100/200/400/800/1500
      if (s === "IM") return d === 200 || d === 400; // 200 IM + 400 IM
      return d === 100 || d === 200; // BACK / BREAST / FLY
    default:
      return false;
  }
}

/** The minimal cut fields the resolver reads (one per exact age / catch-all). */
export type StandardCut = {
  age: number;
  isCatchAllYoung: boolean; // applies to ages <= age (e.g. "10&U")
  isCatchAllOld: boolean; // applies to ages >= age (e.g. "17-19")
  timeMs: number;
};

/**
 * The cut (ms) that applies to a swimmer's EXACT single-year age, honouring
 * catch-alls (§4.9): `isCatchAllYoung` matches ages ≤ its bound, `isCatchAllOld`
 * matches ages ≥ its bound, otherwise the age must match exactly. An exact-age
 * row always wins over a catch-all. Returns null when no row applies (sparse
 * coverage → no line). Never interpolates.
 */
export function resolveStandardTime(
  cuts: ReadonlyArray<StandardCut>,
  exactAge: number,
): number | null {
  let exact: StandardCut | null = null;
  let young: StandardCut | null = null; // narrowest young catch-all that covers
  let old: StandardCut | null = null; // widest old catch-all that covers

  for (const c of cuts) {
    if (!c.isCatchAllYoung && !c.isCatchAllOld) {
      if (c.age === exactAge) exact = c;
    } else if (c.isCatchAllYoung && exactAge <= c.age) {
      if (young === null || c.age < young.age) young = c;
    } else if (c.isCatchAllOld && exactAge >= c.age) {
      if (old === null || c.age > old.age) old = c;
    }
  }

  const match = exact ?? young ?? old;
  return match ? match.timeMs : null;
}

/** The applicable cuts for one exact age, per tier; missing tiers are omitted. */
export type ApplicableStandards = {
  LEVEL_2?: number;
  LEVEL_3?: number;
  SANJ?: number;
};

/**
 * Resolve the L2/L3/SANJ cuts for one (gender, distance, stroke) at an exact
 * age from a flat list of that event's cut rows (§4.9). Tiers with no applicable
 * cut are omitted entirely — the caller renders no line for them. LCM only.
 */
export function pickApplicableStandards(
  rows: ReadonlyArray<StandardCut & { tier: Tier }>,
  exactAge: number,
): ApplicableStandards {
  const out: ApplicableStandards = {};
  for (const tier of TIER_ORDER) {
    const ms = resolveStandardTime(
      rows.filter((r) => r.tier === tier),
      exactAge,
    );
    if (ms !== null) out[tier] = ms;
  }
  return out;
}

/**
 * The HARDEST tier a personal best meets, walking SANJ → LEVEL_3 → LEVEL_2
 * (§4.9). "Met" = the PB is at or under the cut (`pbMs <= cut`). Tiers with no
 * cut (undefined/null) are skipped. Returns null when no tier is met.
 */
export function highestTierMet(
  pbMs: number,
  cutsByTier: {
    LEVEL_2?: number | null;
    LEVEL_3?: number | null;
    SANJ?: number | null;
  },
): Tier | null {
  for (const tier of TIER_ORDER) {
    const cut = cutsByTier[tier];
    if (cut != null && pbMs <= cut) return tier;
  }
  return null;
}

/** Cuts by tier for one swimmer × event, already resolved to an EXACT age. */
export type CutsByTier = {
  LEVEL_2?: number | null;
  LEVEL_3?: number | null;
  SANJ?: number | null;
};

/**
 * One cell of the qualification status matrix (BRD §5.7): the hardest tier a
 * headline PB meets, plus the gap to the NEXT tier up. Purely derived so it is
 * unit-testable and identical everywhere.
 *
 * `cutsByTier` are this event's cuts resolved to the swimmer's EXACT single-year
 * age and gender (never the two-year display band, §4.9); a tier is absent when
 * no cut covers that age. Only tiers that actually have a cut are considered, so
 * "next up" always points at a real target.
 *
 *   - `hasCut`   false when NO tier has a cut here → the cell is blank/neutral.
 *   - `tier`     the hardest tier met (SANJ > L3 > L2), or null if none met / no PB.
 *   - `nextTier` the next-harder tier that still has a cut to aim for; null once
 *                the hardest available tier is met (nothing left to chase).
 *   - `gapMs`    PB − the next tier's cut (always ≥ 0: how much to drop). null at
 *                the top tier, when no PB exists yet, or when no cut exists.
 */
export type MatrixCell = {
  hasCut: boolean;
  tier: Tier | null;
  nextTier: Tier | null;
  gapMs: number | null;
};

export function computeMatrixCell(
  pbMs: number | null,
  cutsByTier: CutsByTier,
): MatrixCell {
  // Tiers that actually have a cut here, hardest → easiest (§4.9 order).
  const available = TIER_ORDER.filter((t) => cutsByTier[t] != null);

  // No cut at any tier for this exact age → nothing to show (blank/neutral).
  if (available.length === 0) {
    return { hasCut: false, tier: null, nextTier: null, gapMs: null };
  }

  // A cut exists but no headline (meet) time yet: the target is the easiest
  // tier, but there is no gap to measure without a PB.
  if (pbMs === null) {
    return {
      hasCut: true,
      tier: null,
      nextTier: available[available.length - 1],
      gapMs: null,
    };
  }

  // Highest tier met = the first (hardest) available cut the PB is at or under.
  let metIdx = -1;
  for (let i = 0; i < available.length; i++) {
    if (pbMs <= (cutsByTier[available[i]] as number)) {
      metIdx = i;
      break;
    }
  }
  const tier = metIdx >= 0 ? available[metIdx] : null;

  // Next tier up: the tier one step harder than the one met. If the hardest
  // available tier is already met there is nothing above it; if none is met the
  // target is the easiest available tier.
  let nextTier: Tier | null;
  if (metIdx === 0) nextTier = null;
  else if (metIdx === -1) nextTier = available[available.length - 1];
  else nextTier = available[metIdx - 1];

  const gapMs =
    nextTier !== null ? pbMs - (cutsByTier[nextTier] as number) : null;

  return { hasCut: true, tier, nextTier, gapMs };
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

/** Fixed ring positions (radius units) for the three tiers. */
export const STROKE_RING_POS: Record<Tier, number> = {
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

  const clamp = (r: number) =>
    Math.max(STROKE_RADIUS_MIN, Math.min(STROKE_RADIUS_MAX, r));

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

/** One raw row as it arrives from the cleaned CSV (loosely typed on purpose). */
export type RawStandardRow = {
  tier: string;
  gender: string;
  distance: number | string;
  stroke: string;
  age: number | string;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  time: string;
};

/** A validated, parsed row ready to persist to the `standards` table. */
export type PreparedStandard = {
  tier: Tier;
  gender: "M" | "F";
  distance: Distance;
  stroke: Stroke;
  age: number;
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

const TIER_SET = new Set<Tier>(["LEVEL_2", "LEVEL_3", "SANJ"]);
const GENDER_SET = new Set(["M", "F"]);

/**
 * Validate + parse raw standard rows (§4.4, §4.9). Returns the accepted rows
 * (parsed to ms) and the rejected rows (with a reason each). A row is rejected
 * if any field is off-enum, the age is not a sane whole number, both catch-all
 * flags are set, the (distance, stroke) is not a valid LCM event, the tier does
 * not cover that event, or the time fails `parseTime`. Nothing is guessed.
 */
export function prepareStandardImport(
  rows: ReadonlyArray<RawStandardRow>,
  events: ReadonlyArray<EventDef>,
): { accepted: PreparedStandard[]; rejected: RejectedStandard[] } {
  const accepted: PreparedStandard[] = [];
  const rejected: RejectedStandard[] = [];

  rows.forEach((row, index) => {
    const reject = (reason: string) => rejected.push({ index, reason, row });

    if (!TIER_SET.has(row.tier as Tier)) {
      return reject(`unknown tier "${row.tier}"`);
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

    const age = Number(row.age);
    if (!Number.isInteger(age) || age <= 0 || age > 100) {
      return reject(`invalid age "${row.age}"`);
    }

    if (typeof row.isCatchAllYoung !== "boolean" || typeof row.isCatchAllOld !== "boolean") {
      return reject("catch-all flags must be booleans");
    }
    if (row.isCatchAllYoung && row.isCatchAllOld) {
      return reject("row flagged as BOTH young and old catch-all");
    }

    const tier = row.tier as Tier;
    const stroke = row.stroke as Stroke;

    // Standards are LCM only — the event must exist AND allow long course.
    if (!isValidEvent(distance, stroke, "LCM", events)) {
      return reject(`not a valid LCM event: ${eventLabel(distance, stroke)}`);
    }
    if (!tierCoversEvent(tier, distance, stroke)) {
      return reject(`${tier} has no coverage for ${eventLabel(distance, stroke)}`);
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
      tier,
      gender: row.gender as "M" | "F",
      distance: distance as Distance,
      stroke,
      age,
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

/** The 8 columns of the cleaned CSV, in order (§11a). */
export const STANDARDS_CSV_COLUMNS = [
  "tier",
  "gender",
  "distance",
  "stroke",
  "age",
  "isCatchAllYoung",
  "isCatchAllOld",
  "time",
] as const;

/**
 * A CSV row after coercion — distance/age are real numbers and the catch-all
 * flags real booleans, exactly the shape `importStandards` accepts (a stricter
 * `RawStandardRow`, which types those loosely for its own reporting).
 */
export type StandardImportRow = {
  tier: string;
  gender: string;
  distance: number;
  stroke: string;
  age: number;
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
 * `importStandards`, plus a rejected report. A leading `tier,gender,…` header
 * row is detected and skipped; blank lines are ignored. Each data line must
 * have exactly 8 comma-separated cells; distance/age must be whole numbers on
 * the whitelist, the two flags must be "true"/"false", and time must be
 * non-empty. Everything else (tier/gender/stroke enums, coverage, the time
 * format itself) is validated downstream and reported there.
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
      if (cells[0].toLowerCase() === "tier") return;
    }

    const reject = (reason: string) => rejected.push({ line, reason, raw });

    if (cells.length !== 8) {
      return reject(`expected 8 columns, got ${cells.length}`);
    }

    const [tier, gender, distanceStr, stroke, ageStr, youngStr, oldStr, time] =
      cells;

    const distance = Number(distanceStr);
    if (distanceStr === "" || !Number.isInteger(distance)) {
      return reject(`distance "${distanceStr}" is not a whole number`);
    }
    const age = Number(ageStr);
    if (ageStr === "" || !Number.isInteger(age)) {
      return reject(`age "${ageStr}" is not a whole number`);
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
      row: { tier, gender, distance, stroke, age, isCatchAllYoung, isCatchAllOld, time },
    });
  });

  return { rows, rejected };
}

// ---------------------------------------------------------------------------
// 8d. Monotonicity — surface (don't block) a younger cut faster than an older
// ---------------------------------------------------------------------------
//
// Within one (tier, gender, event) the cut should get FASTER (smaller ms) as
// age rises. A younger age whose cut is faster than an older age's is almost
// always a typo (§5.8, §11a) — but the one known real inversion (L2 F 200
// Breast, 15 faster than 16) means we WARN, never block.

/** The cut fields the monotonicity check reads (a single tier's column). */
export type AgeCut = {
  age: number;
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
  age: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): number {
  if (c.isCatchAllYoung) return c.age - 0.5;
  if (c.isCatchAllOld) return c.age + 0.5;
  return c.age;
}

/**
 * Adjacent-pair monotonicity check over ONE tier's cuts for a single event.
 * Orders by age, then reports each neighbouring pair where the younger cut is
 * strictly faster than the older (an inversion). Equal times are fine (a
 * plateau). Indices refer to the input array so callers can flag exact rows.
 */
export function findAgeInversions(
  cuts: ReadonlyArray<AgeCut>,
): AgeInversion[] {
  const ordered = cuts
    .map((c, idx) => ({ idx, key: cutAgeOrder(c), timeMs: c.timeMs }))
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
