// Pure, framework-free helpers for session attendance (§R18). Isolated from the
// Convex ctx exactly like lib/swim.ts so the generation/aggregation logic is unit-
// tested without convex-test. All date maths is UTC-based so a plain "YYYY-MM-DD"
// is timezone-stable (matching rollingSeasonStart in lib/swim.ts).

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export const MIN_OF_DAY = 0;
export const MAX_OF_DAY = 1439; // 23:59, minutes-from-midnight

/** Today as an ISO "YYYY-MM-DD" (UTC), matching every other server date. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validate an ISO "YYYY-MM-DD" and confirm it's a real calendar day. Returns the
 * trimmed string; returns null on anything malformed (callers turn null into a
 * ConvexError with their own message).
 */
export function cleanIsoDate(input: string | undefined): string | null {
  if (input === undefined) return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return null;
  }
  return trimmed;
}

/** Parse "HH:MM" (24h) into minutes-from-midnight, or null when unreadable. */
export function parseHHMM(input: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Render minutes-from-midnight as "HH:MM" (24h, zero-padded). */
export function formatHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(MAX_OF_DAY, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when `min` is a whole minute-of-day in [0, 1439]. */
export function isValidMinuteOfDay(min: number): boolean {
  return Number.isInteger(min) && min >= MIN_OF_DAY && min <= MAX_OF_DAY;
}

/** True when every entry is a distinct integer weekday 0–6. */
export function isValidWeekdays(weekdays: number[]): boolean {
  if (weekdays.length === 0) return false;
  const seen = new Set<number>();
  for (const d of weekdays) {
    if (!Number.isInteger(d) || d < 0 || d > 6 || seen.has(d)) return false;
    seen.add(d);
  }
  return true;
}

/** UTC weekday (0=Sun … 6=Sat) of an ISO date — stable regardless of server TZ. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * Every ISO date in [seasonStart, seasonEnd] (inclusive) whose weekday is in
 * `weekdays`. The generation core: walking real days (not week arithmetic) keeps
 * it correct across month and year boundaries. Returns [] if the window is empty
 * or inverted. Capped defensively so a pathological window can't loop forever.
 */
export function datesForPattern(
  weekdays: number[],
  seasonStartIso: string,
  seasonEndIso: string,
): string[] {
  const start = cleanIsoDate(seasonStartIso);
  const end = cleanIsoDate(seasonEndIso);
  if (start === null || end === null || start > end) return [];
  const wanted = new Set(weekdays);

  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let guard = 0;
  const MAX_DAYS = 366 * 5; // 5 years of daily steps — far beyond any real season
  while (cursor.getTime() <= last.getTime() && guard < MAX_DAYS) {
    if (wanted.has(cursor.getUTCDay())) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/**
 * Cap an open-ended season: use the explicit end when set, else one year past the
 * effective start. Generation always needs a bounded window (§R18 default).
 */
export function resolveSeasonEnd(
  effectiveStartIso: string,
  seasonEndIso: string | null,
): string {
  if (seasonEndIso) {
    const cleaned = cleanIsoDate(seasonEndIso);
    if (cleaned) return cleaned;
  }
  const d = new Date(`${effectiveStartIso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Union of several id lists, de-duplicated, order-preserving (multi-squad roster). */
export function dedupeSwimmerIds<T extends string>(idLists: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const list of idLists) {
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export type AttendanceRates = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number; // total rows
  attended: number; // present + late (showed up)
  eligible: number; // present + late + absent (excused doesn't count against them)
  ratePct: number | null; // attended / eligible, 0-dp; null when no eligible sessions
};

/**
 * Aggregate a swimmer's marks into a fair attendance rate. EXCUSED is excluded
 * from the denominator (a notified absence is not held against them); LATE still
 * counts as attended. `ratePct` is null when there's nothing eligible to rate.
 */
export function computeRates(
  rows: ReadonlyArray<{ status: AttendanceStatus }>,
): AttendanceRates {
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;
  for (const r of rows) {
    if (r.status === "PRESENT") present++;
    else if (r.status === "ABSENT") absent++;
    else if (r.status === "LATE") late++;
    else if (r.status === "EXCUSED") excused++;
  }
  const attended = present + late;
  const eligible = present + late + absent;
  return {
    present,
    absent,
    late,
    excused,
    marked: present + absent + late + excused,
    attended,
    eligible,
    ratePct: eligible > 0 ? Math.round((attended / eligible) * 100) : null,
  };
}
