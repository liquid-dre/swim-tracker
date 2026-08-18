// ---------------------------------------------------------------------------
// Galas — the meets a swimmer can qualify for (BRD §4.9, 2027 SSA standards)
// ---------------------------------------------------------------------------
//
// A "gala" is one championship meet with its own set of qualifying cuts. There
// are five, and they are NOT all the same shape:
//
//   AGE_GRADED — one cut per exact single-year age (with a youngest "&U"
//                catch-all): LEVEL_2, LEVEL_3, SANJ. Their published tables
//                stop at 16.
//   OPEN       — a single cut per (gender, event, course) with no age columns
//                at all: SANS, SANY. Eligibility is a separate age WINDOW, not
//                an age-graded cut.
//
// Every gala publishes SEPARATE long-course and short-course cuts (both are
// valid for entry), so `course` is part of a cut's identity — never borrowed
// across courses, never interpolated.
//
// This module owns gala IDENTITY: the code, its labels, its rank, and the seed
// values for its policy fields. The POLICY fields themselves (age window, event
// coverage, tour date) live on the `galas` table so a super-user can correct
// them without a deploy — see `convex/galas.ts`.

import type { Distance, Stroke } from "./swim";

/** The five galas. Codes are stable identifiers — they appear in the CSV and DB. */
export type GalaCode = "SANS" | "SANY" | "SANJ" | "LEVEL_3" | "LEVEL_2";

/**
 * Gala order HARDEST → EASIEST. Every "highest gala met", "next gala up" and
 * colour/rank decision walks this order — it is the single source of truth
 * (there used to be a second, divergent rank map in `convex/dashboard.ts`).
 *
 * This is a prestige order, and on the 2027 tables it also happens to be the
 * exact cut order at every age where two or more galas are simultaneously
 * eligible. `lib/qualifyingTimes.test.ts` locks that property, so if SSA ever
 * publishes numbers that contradict this constant, CI fails rather than a
 * swimmer being shown the wrong badge.
 */
export const GALA_ORDER: ReadonlyArray<GalaCode> = [
  "SANS",
  "SANY",
  "SANJ",
  "LEVEL_3",
  "LEVEL_2",
];

/** Age-graded galas have per-age cuts; open galas have one cut for all ages. */
export type AgeScope = "AGE_GRADED" | "OPEN";

/** Full names — the one copy every screen shares. */
export const GALA_FULL: Record<GalaCode, string> = {
  SANS: "SA Senior National Aquatic Championships",
  SANY: "SA National Youth Championships",
  SANJ: "SA National Junior Championships",
  LEVEL_3: "Level 3",
  LEVEL_2: "Level 2",
};

/** Compact labels for badges, matrix cells and tight toolbars. */
export const GALA_SHORT: Record<GalaCode, string> = {
  SANS: "SANS",
  SANY: "SANY",
  SANJ: "SANJ",
  LEVEL_3: "L3",
  LEVEL_2: "L2",
};

/**
 * Medium labels for prose ("0.42s to SA Youth") where the full championship
 * name is too long but a bare code is too terse.
 */
export const GALA_MEDIUM: Record<GalaCode, string> = {
  SANS: "SA Senior",
  SANY: "SA Youth",
  SANJ: "SANJ",
  LEVEL_3: "Level 3",
  LEVEL_2: "Level 2",
};

/** Badge/token suffix per gala — pairs with `--color-tier-*` in globals.css. */
export const GALA_TOKEN: Record<GalaCode, string> = {
  SANS: "sans",
  SANY: "sany",
  SANJ: "sanj",
  LEVEL_3: "l3",
  LEVEL_2: "l2",
};

/** Runtime membership test for a string off the wire (CSV import, URL param). */
const GALA_SET = new Set<string>(GALA_ORDER);
export function isGalaCode(value: string): value is GalaCode {
  return GALA_SET.has(value);
}

// ---------------------------------------------------------------------------
// Age eligibility
// ---------------------------------------------------------------------------
//
// Distinct from coverage and from the cuts themselves: a gala only ACCEPTS
// swimmers inside its age window, so outside it there is no cut to chase even
// if a row exists. Bounds are inclusive; an absent bound is unbounded.
//
// The young end of the age-graded galas is handled by their `10&U` / `11&U` /
// `12&U` catch-all rows, not by `minAge` — a 9-year-old is eligible for Level 2
// and resolves to the 10&U cut.

/** The eligibility fields read off a gala row. */
export type GalaEligibility = {
  minAge?: number | null;
  maxAge?: number | null;
};

/** Is a swimmer of this exact age eligible to enter this gala? Bounds inclusive. */
export function isGalaAgeEligible(
  gala: GalaEligibility,
  exactAge: number,
): boolean {
  if (gala.minAge != null && exactAge < gala.minAge) return false;
  if (gala.maxAge != null && exactAge > gala.maxAge) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Event coverage
// ---------------------------------------------------------------------------
//
// Coverage is a HARD rule, not merely missing data: a gala only has cuts for
// the events it lists, and anything else must never be imported, resolved or
// drawn. It is stored per gala (`galas.coveredEvents`) so a new meet is data
// rather than a code change.
//
// Coverage is course-independent — both courses of a gala cover the same
// events — and is separate from the event whitelist itself (`isValidEvent`),
// e.g. 100 IM is a real SCM event but no gala has a cut for it.

/** One (distance, stroke) a gala has cuts for. */
export type CoveredEvent = { distance: Distance; stroke: Stroke };

/** The coverage field read off a gala row. */
export type GalaCoverage = {
  coveredEvents: ReadonlyArray<{ distance: number; stroke: string }>;
};

/** Does this gala have cuts for this event at all? (No row ⇒ no line, ever.) */
export function galaCoversEvent(
  gala: GalaCoverage,
  distance: Distance | number,
  stroke: Stroke | string,
): boolean {
  const d = Number(distance);
  return gala.coveredEvents.some((e) => Number(e.distance) === d && e.stroke === stroke);
}

// ---------------------------------------------------------------------------
// Seed — the 2027 SSA definitions
// ---------------------------------------------------------------------------
//
// Transcribed from the three 2027 SSA qualifying-standard PDFs. `coveredEvents`
// mirrors exactly which rows exist in `data/qualifying-times.csv`; a test keeps
// the two in step. Age windows: SANJ/SANS/SANY are the federation's stated
// rules; LEVEL_2 and LEVEL_3 take maxAge 16 from their tables terminating there
// with no oldest catch-all. All of it is super-user editable at runtime.

/** A gala row as seeded — matches the `galas` table minus Convex system fields. */
export type GalaSeed = {
  code: GalaCode;
  displayName: string;
  shortLabel: string;
  ageScope: AgeScope;
  minAge?: number;
  maxAge?: number;
  coveredEvents: ReadonlyArray<CoveredEvent>;
  sortHint: number;
  season: string;
};

const FREE_SPRINT_TO_DISTANCE: ReadonlyArray<CoveredEvent> = [
  { distance: 50, stroke: "FREE" },
  { distance: 100, stroke: "FREE" },
  { distance: 200, stroke: "FREE" },
  { distance: 400, stroke: "FREE" },
  { distance: 800, stroke: "FREE" },
  { distance: 1500, stroke: "FREE" },
];

/** SANS and SANY cover the same 17 events: every whitelisted event with a cut. */
const OPEN_GALA_EVENTS: ReadonlyArray<CoveredEvent> = [
  ...FREE_SPRINT_TO_DISTANCE,
  { distance: 50, stroke: "BACK" },
  { distance: 100, stroke: "BACK" },
  { distance: 200, stroke: "BACK" },
  { distance: 50, stroke: "BREAST" },
  { distance: 100, stroke: "BREAST" },
  { distance: 200, stroke: "BREAST" },
  { distance: 50, stroke: "FLY" },
  { distance: 100, stroke: "FLY" },
  { distance: 200, stroke: "FLY" },
  { distance: 200, stroke: "IM" },
  { distance: 400, stroke: "IM" },
];

export const GALA_SEED: ReadonlyArray<GalaSeed> = [
  {
    code: "SANS",
    displayName: GALA_FULL.SANS,
    shortLabel: GALA_SHORT.SANS,
    ageScope: "OPEN",
    minAge: 15,
    // No upper bound — anyone 15 or over who makes the time qualifies.
    coveredEvents: OPEN_GALA_EVENTS,
    sortHint: 0,
    season: "2027",
  },
  {
    code: "SANY",
    displayName: GALA_FULL.SANY,
    shortLabel: GALA_SHORT.SANY,
    ageScope: "OPEN",
    minAge: 17,
    maxAge: 25,
    coveredEvents: OPEN_GALA_EVENTS,
    sortHint: 1,
    season: "2027",
  },
  {
    code: "SANJ",
    displayName: GALA_FULL.SANJ,
    shortLabel: GALA_SHORT.SANJ,
    ageScope: "AGE_GRADED",
    maxAge: 16,
    // No 50s. 100→1500 Free, 100/200 of every stroke, 200 + 400 IM.
    coveredEvents: [
      { distance: 100, stroke: "FREE" },
      { distance: 200, stroke: "FREE" },
      { distance: 400, stroke: "FREE" },
      { distance: 800, stroke: "FREE" },
      { distance: 1500, stroke: "FREE" },
      { distance: 100, stroke: "BACK" },
      { distance: 200, stroke: "BACK" },
      { distance: 100, stroke: "BREAST" },
      { distance: 200, stroke: "BREAST" },
      { distance: 100, stroke: "FLY" },
      { distance: 200, stroke: "FLY" },
      { distance: 200, stroke: "IM" },
      { distance: 400, stroke: "IM" },
    ],
    sortHint: 2,
    season: "2027",
  },
  {
    code: "LEVEL_3",
    displayName: GALA_FULL.LEVEL_3,
    shortLabel: GALA_SHORT.LEVEL_3,
    ageScope: "AGE_GRADED",
    maxAge: 16,
    // No 50s, no 200 Fly, no 800/1500, no 400 IM. Intentional (§4.9).
    coveredEvents: [
      { distance: 100, stroke: "FREE" },
      { distance: 200, stroke: "FREE" },
      { distance: 400, stroke: "FREE" },
      { distance: 100, stroke: "BACK" },
      { distance: 200, stroke: "BACK" },
      { distance: 100, stroke: "BREAST" },
      { distance: 200, stroke: "BREAST" },
      { distance: 100, stroke: "FLY" },
      { distance: 200, stroke: "IM" },
    ],
    sortHint: 3,
    season: "2027",
  },
  {
    code: "LEVEL_2",
    displayName: GALA_FULL.LEVEL_2,
    shortLabel: GALA_SHORT.LEVEL_2,
    ageScope: "AGE_GRADED",
    maxAge: 16,
    // The only gala with 50s. Nothing above 200 m, and no 200 Fly.
    coveredEvents: [
      { distance: 50, stroke: "FREE" },
      { distance: 100, stroke: "FREE" },
      { distance: 200, stroke: "FREE" },
      { distance: 50, stroke: "BACK" },
      { distance: 100, stroke: "BACK" },
      { distance: 200, stroke: "BACK" },
      { distance: 50, stroke: "BREAST" },
      { distance: 100, stroke: "BREAST" },
      { distance: 200, stroke: "BREAST" },
      { distance: 50, stroke: "FLY" },
      { distance: 100, stroke: "FLY" },
      { distance: 200, stroke: "IM" },
    ],
    sortHint: 4,
    season: "2027",
  },
];

/** Seed lookup by code, for tests and the seeding mutation. */
export const GALA_SEED_BY_CODE: Record<GalaCode, GalaSeed> = GALA_SEED.reduce(
  (acc, g) => {
    acc[g.code] = g;
    return acc;
  },
  {} as Record<GalaCode, GalaSeed>,
);
