// lib/meets.ts — Meets: the dated competitions on the season calendar.
//
// Pure, framework-free, no I/O — same contract as lib/swim.ts, so both Convex
// and the client share one implementation and it unit-tests in isolation.
//
// ---------------------------------------------------------------------------
// A MEET IS NOT A GALA
// ---------------------------------------------------------------------------
// `lib/galas.ts` owns the five QUALIFYING galas (SANS / SANY / SANJ / LEVEL_3 /
// LEVEL_2): reference data carrying cuts, coverage and entry-age windows. This
// module owns something different — one dated competition you actually swim at
// ("HAS 1st Seeded Gala 2026", 11 Sep 2026, Les Brown Pool) and its programme
// of events. The app already calls that a MEET: `results.meetName`, the
// `swimType: "MEET"` that alone counts toward a headline PB, and the log form's
// "Meet / venue name". This module keeps that word.
//
// A meet may carry an optional `galaCode` TAG — "this meet is the SANJ tour".
// The tag is DISPLAY-ONLY. `galas.tourDate` remains the sole authority for the
// birthday rule that every qualifying surface depends on (§4.9); nothing here
// reads it, writes it, or competes with it.

import {
  isWhitelistedEvent,
  eventLabel,
  eventSortKey,
  type Course,
  type Distance,
  type Stroke,
} from "./swim";
import { isGalaCode, type GalaCode } from "./galas";

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

/**
 * Who a programme event is for, as the programme itself states it. HY-TEK
 * prints "Mixed 100 Freestyle" / "Girls 11-12 100 Free"; we keep only the sex
 * scope, because an age band is the meet's own grouping and has no bearing on
 * any event identity in this app.
 */
export type MeetEventGender = "M" | "F" | "MIXED";

/**
 * One line of a meet's programme.
 *
 * `rawLabel` is the source document's own words, kept VERBATIM and always
 * displayed — a relay, a 25 m sprint or a "50 IM" that this app has no event
 * for is still genuinely on the programme, so it is never dropped. `distance`
 * and `stroke` are set ONLY when the line resolves to a whitelisted event
 * (BRD §4.3); absent means "this app has no event for that line", which is a
 * different fact from "the line was blank".
 */
export type MeetEvent = {
  /**
   * Stable identity for this line, assigned on write and preserved across
   * edits and re-imports. Sign-ups point at a LINE, not at a resolved event:
   * a real programme repeats "100 Free" once per age band, so (distance,
   * stroke) cannot tell two of its lines apart. Array position cannot either —
   * an import replaces the whole array.
   *
   * Optional only while the backfill runs; every write assigns one.
   */
  id?: string;
  /** HY-TEK programme number (101, 102…). Absent when the source has none. */
  eventNumber?: number;
  rawLabel: string;
  gender?: MeetEventGender;
  distance?: Distance;
  stroke?: Stroke;
};

/** A meet as every read surface sees it. */
export type Meet = {
  name: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate?: string | null; // absent/null = single day
  venue?: string | null;
  /** One pool, one course. Absent = not known — never guessed (see §4.2). */
  course?: Course | null;
  /** Display-only tag; never authoritative over galas.tourDate. */
  galaCode?: GalaCode | null;
  events: ReadonlyArray<MeetEvent>;
};

// ---------------------------------------------------------------------------
// 2. Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real ISO YYYY-MM-DD date, or null. Timezone-safe (parsed as UTC). */
export function cleanMeetDate(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return null;
  }
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return trimmed;
}

/**
 * The inclusive ISO dates a meet occupies. A meet with no `endDate` runs for
 * one day; the calendar paints a cell for every date this returns.
 *
 * Bounded at 31 days so a typo'd end year can never generate a runaway span.
 */
export function meetDates(meet: {
  startDate: string;
  endDate?: string | null;
}): string[] {
  const start = cleanMeetDate(meet.startDate);
  if (start === null) return [];
  const end = cleanMeetDate(meet.endDate ?? null);
  if (end === null || end <= start) return [start];

  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < 31) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Does the meet touch any date in [from, to] (inclusive, ISO strings)? */
export function meetOverlapsRange(
  meet: { startDate: string; endDate?: string | null },
  from: string,
  to: string,
): boolean {
  const start = meet.startDate;
  const end = cleanMeetDate(meet.endDate ?? null) ?? start;
  return start <= to && end >= from;
}

/** Is the meet still to come (or running) as of `today`? */
export function isUpcoming(
  meet: { startDate: string; endDate?: string | null },
  today: string,
): boolean {
  const end = cleanMeetDate(meet.endDate ?? null) ?? meet.startDate;
  return end >= today;
}

// ---------------------------------------------------------------------------
// 3. Programme-line parsing
// ---------------------------------------------------------------------------
//
// The parser NEVER rejects a programme line. A meet's programme is a fact about
// the meet, not about this app's event whitelist: a relay, a 25 m sprint or a
// "50 IM" all belong on the screen. What the parser decides is only whether a
// line ALSO resolves to a whitelisted (distance, stroke) — the strict half —
// so that later work (readiness, entries) has something exact to key on and
// never has to re-guess from text.

/** Sex prefixes HY-TEK and the local meets actually print. */
const GENDER_WORDS: ReadonlyArray<[RegExp, MeetEventGender]> = [
  [/^(mixed|combined|open)\b/i, "MIXED"],
  [/^(boys?|men'?s?|male)\b/i, "M"],
  [/^(girls?|women'?s?|ladies|female)\b/i, "F"],
];

/**
 * Stroke words, longest-first so "Individual Medley" wins over "Medley" and
 * "Breaststroke" is never read as two tokens.
 */
const STROKE_WORDS: ReadonlyArray<[RegExp, Stroke]> = [
  [/\bindividual\s+medley\b/i, "IM"],
  [/\bbreaststrokes?\b/i, "BREAST"],
  [/\bbackstrokes?\b/i, "BACK"],
  [/\bbutterfly\b/i, "FLY"],
  [/\bfreestyles?\b/i, "FREE"],
  [/\bmedley\b/i, "IM"],
  [/\bbreast\b/i, "BREAST"],
  [/\bback\b/i, "BACK"],
  [/\bfree\b/i, "FREE"],
  [/\bfly\b/i, "FLY"],
  [/\bi\.?\s?m\.?\b/i, "IM"],
];

/** The real racing distances (BRD §4.3) — the only numbers a line may resolve to. */
const DISTANCES = new Set<number>([25, 50, 100, 200, 400, 800, 1500]);

/** A relay leg count ("4x50", "4 x 100", "4X50 Free Relay"). */
const RELAY = /\b\d\s*[x×]\s*\d{2,4}\b|\brelays?\b/i;

/** An age band the meet groups by ("11-12", "13 & over", "10&U", "Open"). */
const AGE_BAND = /\b\d{1,2}\s*(?:-|–|&|and)\s*(?:\d{1,2}|u|under|over|older)\b/i;

/**
 * Read one programme line into a `MeetEvent`.
 *
 * Returns null only for a line with no content at all — every other line comes
 * back with its `rawLabel` intact, resolved or not. A relay never resolves: a
 * relay time is a team's, not a swimmer's personal best, so giving it a
 * (distance, stroke) would let it into event-level comparisons it must not
 * enter.
 */
export function parseProgrammeLine(
  raw: string,
  eventNumber?: number,
): MeetEvent | null {
  const rawLabel = raw.trim().replace(/\s+/g, " ");
  if (rawLabel === "") return null;

  const event: MeetEvent = { rawLabel };
  if (eventNumber !== undefined && Number.isInteger(eventNumber)) {
    event.eventNumber = eventNumber;
  }

  // Sex prefix, if the line opens with one.
  for (const [pattern, gender] of GENDER_WORDS) {
    if (pattern.test(rawLabel)) {
      event.gender = gender;
      break;
    }
  }

  // A relay is programme content but never a swimmer's event — stop here.
  if (RELAY.test(rawLabel)) return event;

  // Strip any age band before hunting for the distance, so "11-12 100 Free"
  // cannot read 11 (or 12) as the distance.
  const withoutBand = rawLabel.replace(AGE_BAND, " ");

  // The distance is the first bare number that is a real racing distance. A
  // trailing "m" is optional and common ("100m Freestyle").
  let distance: Distance | undefined;
  for (const match of withoutBand.matchAll(/\b(\d{2,4})\s*m?\b/gi)) {
    const n = Number(match[1]);
    if (DISTANCES.has(n)) {
      distance = n as Distance;
      break;
    }
  }

  let stroke: Stroke | undefined;
  for (const [pattern, s] of STROKE_WORDS) {
    if (pattern.test(withoutBand)) {
      stroke = s;
      break;
    }
  }

  // Both halves, and a real event: only then is it safe to resolve.
  if (distance !== undefined && stroke !== undefined && isWhitelistedEvent(distance, stroke)) {
    event.distance = distance;
    event.stroke = stroke;
  }
  return event;
}

// ---------------------------------------------------------------------------
// 4. Display
// ---------------------------------------------------------------------------

/** Sex scope as a programme reads it. */
export const MEET_GENDER_LABEL: Record<MeetEventGender, string> = {
  M: "Boys",
  F: "Girls",
  MIXED: "Mixed",
};

/**
 * The label to show for a programme event. The resolved event name when the
 * line mapped to a real event ("100 Free"), the source document's own words
 * otherwise — so a relay or a 25 m sprint still reads correctly.
 */
export function meetEventLabel(event: MeetEvent): string {
  if (event.distance !== undefined && event.stroke !== undefined) {
    return eventLabel(event.distance, event.stroke);
  }
  return event.rawLabel;
}

/**
 * Programme order: by the meet's own event number when it has one — that IS the
 * running order, and it is what a coach reads off the poolside sheet — falling
 * back to canonical event order for a numberless list.
 */
export function compareMeetEvents(a: MeetEvent, b: MeetEvent): number {
  if (a.eventNumber !== undefined && b.eventNumber !== undefined) {
    return a.eventNumber - b.eventNumber;
  }
  if (a.eventNumber !== undefined) return -1;
  if (b.eventNumber !== undefined) return 1;
  const ak = a.distance !== undefined && a.stroke !== undefined
    ? eventSortKey(a.distance, a.stroke)
    : Number.MAX_SAFE_INTEGER;
  const bk = b.distance !== undefined && b.stroke !== undefined
    ? eventSortKey(b.distance, b.stroke)
    : Number.MAX_SAFE_INTEGER;
  return ak - bk;
}

// ---------------------------------------------------------------------------
// 5. Programme editing
// ---------------------------------------------------------------------------
//
// A programme is no longer write-once. It can be built by hand, edited line by
// line, and re-imported over the top — and sign-ups point at LINES. So the one
// thing this section must guarantee is that a line keeps its identity through
// every one of those operations, and that when a line genuinely does disappear,
// the caller is told rather than discovering it as an orphaned entry.

/** A fresh line id. Random, because position and label are both mutable. */
export function newLineId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * A meet name reduced to what two spellings of the same meet share: case and
 * spacing carry no meaning, so "HAS 1ST SEEDED  GALA 2026" and "HAS 1st Seeded
 * Gala 2026" are the same fixture. Nothing else is normalised — punctuation and
 * wording differences are real differences, and guessing past them is how a
 * swim ends up attached to a meet nobody attended.
 */
export function normaliseMeetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Labels compare on case and spacing only — "100 FREE" is "100 Free". */
function labelKey(event: MeetEvent): string {
  return `${event.eventNumber ?? ""}|${event.rawLabel.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

/**
 * Give every incoming line an id, reusing the existing line it corresponds to.
 *
 * An import replaces the whole array, so without this a re-import of the same
 * programme — the ordinary case, correcting a venue or a typo — would mint 60
 * new ids and strand every sign-up. A line is matched by its own `id` first
 * (an edit from the programme editor, which round-trips ids), then by event
 * number + label (an import, which has none). Anything unmatched is new.
 *
 * `droppedIds` names the existing lines nothing claimed. The caller decides
 * what that means: the meet form warns before saving, and the entry layer
 * refuses to strand sign-ups silently.
 */
export function reconcileLines(
  existing: ReadonlyArray<MeetEvent>,
  incoming: ReadonlyArray<MeetEvent>,
  mint: () => string = newLineId,
): { lines: MeetEvent[]; droppedIds: string[] } {
  const byId = new Map<string, MeetEvent>();
  const byLabel = new Map<string, MeetEvent[]>();
  for (const line of existing) {
    if (line.id === undefined) continue;
    byId.set(line.id, line);
    const key = labelKey(line);
    const bucket = byLabel.get(key);
    if (bucket === undefined) byLabel.set(key, [line]);
    else bucket.push(line);
  }

  const claimed = new Set<string>();
  const lines = incoming.map((line) => {
    if (line.id !== undefined && byId.has(line.id) && !claimed.has(line.id)) {
      claimed.add(line.id);
      return { ...line, id: line.id };
    }
    // Duplicate labels are real (two heats of the same event), so take the
    // first unclaimed match rather than collapsing them onto one id.
    const bucket = byLabel.get(labelKey(line));
    const match = bucket?.find((m) => m.id !== undefined && !claimed.has(m.id));
    if (match?.id !== undefined) {
      claimed.add(match.id);
      return { ...line, id: match.id };
    }
    return { ...line, id: mint() };
  });

  const droppedIds = [...byId.keys()].filter((id) => !claimed.has(id));
  return { lines, droppedIds };
}

/** The programme's own words for a hand-built line: "Boys 100 Free". */
export function buildRawLabel(spec: {
  gender?: MeetEventGender;
  distance?: Distance;
  stroke?: Stroke;
}): string | null {
  if (spec.distance === undefined || spec.stroke === undefined) return null;
  return `${MEET_GENDER_LABEL[spec.gender ?? "MIXED"]} ${eventLabel(spec.distance, spec.stroke)}`;
}

/** Re-word a line for a different sex scope, keeping everything else. */
function relabelForGender(line: MeetEvent, gender: MeetEventGender): string {
  const built = buildRawLabel({ ...line, gender });
  if (built !== null) return built;
  // Unresolved line (a relay, a 25 m sprint): keep the source's words and swap
  // only the sex prefix, so "4 x 50 Medley Relay" survives the split intact.
  let rest = line.rawLabel.trim();
  for (const [pattern] of GENDER_WORDS) {
    const stripped = rest.replace(pattern, "").trim();
    if (stripped !== rest) {
      rest = stripped;
      break;
    }
  }
  return `${MEET_GENDER_LABEL[gender]} ${rest}`.trim();
}

/**
 * Split one mixed line into a boys' line and a girls' line.
 *
 * The boys' line KEEPS the original id, so sign-ups already made against the
 * mixed line survive the split rather than being silently dropped; the girls'
 * line is new. Any male entrants therefore stay valid and only female entrants
 * are flagged for the coach to move — which is the smaller correction of the
 * two, and never a deletion.
 */
export function splitLineByGender(
  line: MeetEvent,
  mint: () => string = newLineId,
): [MeetEvent, MeetEvent] {
  const boys: MeetEvent = {
    ...line,
    id: line.id ?? mint(),
    gender: "M",
    rawLabel: relabelForGender(line, "M"),
  };
  const girls: MeetEvent = {
    ...line,
    id: mint(),
    gender: "F",
    rawLabel: relabelForGender(line, "F"),
    ...(line.eventNumber === undefined
      ? {}
      : { eventNumber: line.eventNumber + 1 }),
  };
  return [boys, girls];
}

/**
 * May this swimmer be entered in this line? An unstated or mixed sex scope
 * takes everyone; a boys' or girls' line takes only its own.
 */
export function genderAllowsSwimmer(
  line: MeetEventGender | undefined,
  swimmer: "M" | "F",
): boolean {
  return line === undefined || line === "MIXED" || line === swimmer;
}

/** The programme line with this id, or null. */
export function lineById(
  events: ReadonlyArray<MeetEvent>,
  lineId: string,
): MeetEvent | null {
  return events.find((e) => e.id === lineId) ?? null;
}

// ---------------------------------------------------------------------------
// 6. Formatting
// ---------------------------------------------------------------------------

/** "11 Sep 2026" or "28–30 Nov 2026" — a meet's dates in one phrase. */
export function formatMeetDates(meet: {
  startDate: string;
  endDate?: string | null;
}): string {
  const start = parseParts(meet.startDate);
  if (!start) return meet.startDate;
  const endIso = cleanMeetDate(meet.endDate ?? null);
  const end = endIso && endIso > meet.startDate ? parseParts(endIso) : null;
  if (!end) return `${start.day} ${start.month} ${start.year}`;
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${start.month} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${start.year}`;
  }
  return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseParts(iso: string): { day: number; month: string; year: number } | null {
  const m = ISO_DATE.test(iso) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  return {
    day: Number(m[3]),
    month: MONTHS[Number(m[2]) - 1] ?? m[2],
    year: Number(m[1]),
  };
}

/** A gala code off the wire (import, URL param) or null. */
export function cleanGalaTag(value: string | null | undefined): GalaCode | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return isGalaCode(trimmed) ? trimmed : null;
}

/** A course off the wire, or null when unknown. Never guessed from a venue. */
export function cleanCourse(value: string | null | undefined): Course | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === "SCM" || trimmed === "LCM" ? trimmed : null;
}

// ---------------------------------------------------------------------------
// 7. Seed — the 2026/27 season's fixtures
// ---------------------------------------------------------------------------
//
// These 15 dates were previously hardcoded in `lib/galaCalendar.ts`, whose only
// job was pre-filling the meet name on /log from the swim date. That map was a
// SECOND source of truth for a fact the calendar now owns, so it is gone and
// these rows replace it — name and date only, no programme, no venue, no course.
//
// They are transcribed EXACTLY as that file had them, including
// "2026-09-12" for the 1st seeded gala. The HAS programme PDF says the meet is
// on the 11th; importing it corrects the row rather than this constant, because
// a seed is a starting point and the table is the truth. Do not "fix" it here —
// the seed is idempotent by (name, startDate), so an edited row would be
// re-inserted alongside the corrected one.

/** A fixture as seeded: the minimum a calendar pin needs. */
export type MeetSeed = { name: string; startDate: string };

export const MEET_SEED: ReadonlyArray<MeetSeed> = [
  { name: "SC", startDate: "2026-08-24" },
  { name: "Africa Aquatics Zone 4 Botswana", startDate: "2026-09-02" },
  { name: "1st seeded", startDate: "2026-09-12" },
  { name: "1st Junior", startDate: "2026-09-14" },
  { name: "2nd seeded", startDate: "2026-09-21" },
  { name: "2nd Junior", startDate: "2026-09-28" },
  { name: "3rd seeded", startDate: "2026-10-10" },
  { name: "3rd Junior", startDate: "2026-10-12" },
  { name: "National Sprint", startDate: "2026-10-17" },
  { name: "4th seeded", startDate: "2026-10-31" },
  { name: "4th Junior", startDate: "2026-11-02" },
  { name: "HAS senior champs", startDate: "2026-11-28" },
  { name: "5th seeded", startDate: "2027-01-09" },
  { name: "5th Junior", startDate: "2027-01-18" },
  { name: "Nat Senior Championship", startDate: "2027-01-23" },
];
