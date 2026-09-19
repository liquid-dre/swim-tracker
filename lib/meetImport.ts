// lib/meetImport.ts — read a meet programme out of whatever the coach has.
//
// Pure and framework-free: text in, a draft out. The four accepted inputs — a
// HY-TEK Meet Manager PDF, an Excel workbook, a CSV, and pasted text — all
// become plain text before they reach here (`lib/pdfText.ts` does the PDF,
// `lib/sheetText.ts` the workbook), so there is exactly ONE parser to reason
// about and to test.
//
// Two principles, both learned from `parseStandardsCsv`:
//
//   NOTHING IS GUESSED. A date it cannot read is left unset for the super-user
//   to supply, never inferred from a filename or "probably this season". Course
//   is never SET here at all: where a document states one in words the draft
//   says so in a warning and leaves the choice to the person confirming it.
//
//   NOTHING VANISHES. Every line the parser skipped comes back in `skipped`, so
//   the preview can show that it read 8 of the 8 lines that mattered and say
//   what it ignored. A programme line that does not map to a whitelisted event
//   is still kept (see `parseProgrammeLine`); only genuine page furniture —
//   the printer banner, column headings — is set aside.

import { parseProgrammeLine, type MeetEvent } from "./meets";

/** A line the parser set aside, with the reason, so nothing disappears silently. */
export type SkippedLine = { line: number; text: string; reason: string };

/** What the parser read, before the super-user confirms it. */
export type MeetDraft = {
  /** The meet's own title, verbatim — never re-cased. Empty when not found. */
  name: string;
  /** ISO date, or null when the source had none we could read confidently. */
  startDate: string | null;
  /**
   * The meet's LAST day, when the document dated one — a programme headed
   * "Day 2 — Sunday 29 November 2026" states a two-day meet as plainly as it
   * states its events. Null when it runs one day, or when it numbered its days
   * without dating them: an end date inferred from "Day 3" would be a guess
   * about whether the middle day is a rest day, and this parser does not guess.
   */
  endDate: string | null;
  /** 24-hour "HH:MM" when the source printed a start time; null otherwise. */
  startTime: string | null;
  venue: string | null;
  events: MeetEvent[];
  /** Things the reader must see before committing (an ambiguous date, say). */
  warnings: string[];
  skipped: SkippedLine[];
};

// ---------------------------------------------------------------------------
// Page furniture — lines that are never programme content
// ---------------------------------------------------------------------------

/** The HY-TEK printer banner and column headings. Present on every report. */
const FURNITURE = [
  /hy-?tek/i,
  /meet\s+manager/i,
  /site\s+licen[sc]e/i,
  /^\s*page\s+\d+/i,
  /event\s+list/i,
  /^\s*event\s*#/i,
  /^\s*-+\s*$/,
];

function isFurniture(line: string): boolean {
  return FURNITURE.some((p) => p.test(line));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Month names and the common abbreviations, longest-first so "Sept" wins. */
const MONTH_INDEX: ReadonlyMap<string, number> = new Map([
  ["january", 1], ["jan", 1],
  ["february", 2], ["feb", 2],
  ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4],
  ["may", 5],
  ["june", 6], ["jun", 6],
  ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8],
  ["september", 9], ["sept", 9], ["sep", 9],
  ["october", 10], ["oct", 10],
  ["november", 11], ["nov", 11],
  ["december", 12], ["dec", 12],
]);

const MONTH_WORD = [...MONTH_INDEX.keys()]
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * A weekday, optionally leading a written date ("Friday, 11 September 2026").
 *
 * Part of the MATCH rather than skipped past, so the text before the date — the
 * meet's name — never ends up with a dangling "Friday," on it.
 */
const WEEKDAY = "(?:mon|tue|tues|wed|wednes|thu|thur|thurs|sat|satur|sun|fri)(?:day)?";
const ORDINAL = "(?:st|nd|rd|th)?";

/** "Friday, 11 September 2026" / "11 Sep 2026" — day first. */
const DAY_FIRST_WORDED = new RegExp(
  `\\b(?:${WEEKDAY},?\\s+)?(\\d{1,2})${ORDINAL}\\s+(${MONTH_WORD})\\.?,?\\s+(\\d{4})\\b`,
  "i",
);
/** "September 11, 2026" — month first, the American printing. */
const MONTH_FIRST_WORDED = new RegExp(
  `\\b(?:${WEEKDAY},?\\s+)?(${MONTH_WORD})\\.?\\s+(\\d{1,2})${ORDINAL},?\\s+(\\d{4})\\b`,
  "i",
);
const ISO_PRINTED = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SLASHED = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;

/** A date found in a line: what it means, and exactly where it sat. */
export type FoundDate = {
  iso: string;
  ambiguous: boolean;
  /** Index of the match in the source text — the name/venue split point. */
  index: number;
  /** The matched text, verbatim, for the ambiguity warning. */
  raw: string;
};

/**
 * Find the date in a line and say WHERE it is, so callers can split the text
 * around it (name before, venue after) without re-deriving the position with a
 * second regex that might match somewhere else.
 *
 * Forms, in order of confidence:
 *   ISO           2026-09-11               unambiguous
 *   worded        Friday, 11 September 2026 / September 11, 2026 — unambiguous,
 *                 because the month is spelled out. Club programmes and
 *                 spreadsheet exports print these constantly.
 *   numeric       11/9/2026 — **day first**: these are Southern-African meet
 *                 reports and 11/9 there is 11 September. When both halves are
 *                 ≤ 12 the form is genuinely ambiguous; it is still read day
 *                 first (a silent coin-flip is the one thing worse than a rule)
 *                 but flagged so the preview can say so.
 */
export function findPrintedDate(text: string): FoundDate | null {
  const iso = ISO_PRINTED.exec(text);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealDate(candidate)
      ? { iso: candidate, ambiguous: false, index: iso.index, raw: iso[0] }
      : null;
  }

  for (const [pattern, dayIdx, monthIdx] of [
    [DAY_FIRST_WORDED, 1, 2],
    [MONTH_FIRST_WORDED, 2, 1],
  ] as const) {
    const m = pattern.exec(text);
    if (!m) continue;
    const day = Number(m[dayIdx]);
    const month = MONTH_INDEX.get(m[monthIdx].toLowerCase());
    const year = normaliseYear(Number(m[3]));
    if (month === undefined || year === null || day < 1 || day > 31) continue;
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    if (!isRealDate(candidate)) continue;
    // A spelled-out month cannot be mistaken for a day — never ambiguous.
    return { iso: candidate, ambiguous: false, index: m.index, raw: m[0] };
  }

  const slash = SLASHED.exec(text);
  if (!slash) return null;
  const day = Number(slash[1]);
  const month = Number(slash[2]);
  const year = normaliseYear(Number(slash[3]));
  if (year === null || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (!isRealDate(candidate)) return null;
  return {
    iso: candidate,
    ambiguous: day <= 12,
    index: slash.index,
    raw: slash[0],
  };
}

/**
 * A printed date → ISO. The position-free form of `findPrintedDate`, kept
 * because most callers only want the meaning.
 */
export function parsePrintedDate(
  text: string,
): { iso: string; ambiguous: boolean } | null {
  const found = findPrintedDate(text);
  return found === null
    ? null
    : { iso: found.iso, ambiguous: found.ambiguous };
}

/**
 * A printed start time → 24-hour `"HH:MM"`, or null.
 *
 * Reads "6:00 PM", "6 PM", "18:00" and "08:00". Deliberately strict about the
 * am/pm marker: a bare "6:00" is read as 06:00, which is what a 24-hour
 * programme means by it, and an evening gala prints the PM.
 */
export function parsePrintedTime(text: string): string | null {
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i.exec(text);
  if (m) {
    let hour = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = m[3].toLowerCase() === "p";
    if (hour === 12) hour = 0;
    return `${pad(pm ? hour + 12 : hour)}:${pad(minute)}`;
  }
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (h24) return `${pad(Number(h24[1]))}:${pad(Number(h24[2]))}`;
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Two-digit years are this century; anything outside 2000–2100 is refused. */
function normaliseYear(year: number): number | null {
  const full = year < 100 ? 2000 + year : year;
  return full >= 2000 && full <= 2100 ? full : null;
}

function isRealDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// ---------------------------------------------------------------------------
// A stated course
// ---------------------------------------------------------------------------

/**
 * The course a document says it is swum in, when it says so in words.
 *
 * This is REPORTED, never applied: `MeetDraft` still carries no course, and the
 * import sheet still opens its course control on the same default it always
 * did. A programme's own header ("Short Course") is a fact worth putting in
 * front of the person confirming the import — filing a 25 m junior gala as long
 * course is the one mistake nothing downstream would ever flag — but it is the
 * person, not the parser, who sets it (§4.2).
 */
export function statedCourse(text: string): { label: string; course: "SCM" | "LCM" } | null {
  const short = /\bshort[\s-]?course\b|\bSCM\b|\b25\s?m(?:etre|eter)?\s+pool\b/i.exec(text);
  const long = /\blong[\s-]?course\b|\bLCM\b|\b50\s?m(?:etre|eter)?\s+pool\b/i.exec(text);
  // Both, or neither, is not a statement — a programme that mentions each is
  // describing something we cannot read off a single word.
  if ((short === null) === (long === null)) return null;
  const found = short ?? long!;
  return { label: found[0], course: short ? "SCM" : "LCM" };
}

// ---------------------------------------------------------------------------
// Header lines — one meet's identity
// ---------------------------------------------------------------------------

/** What a header line says about its meet, beyond the date itself. */
type HeaderIdentity = {
  name: string;
  startTime: string | null;
  venue: string | null;
};

// ---------------------------------------------------------------------------
// Day headings — a meet's own days, inside one programme
// ---------------------------------------------------------------------------

/**
 * "Day 2", "Session 3" — the whole line, once separators are stripped.
 *
 * The WORD is required. A bare number is an event number, and a programme is
 * full of them.
 */
const DAY_MARKER = /^(?:day|session)\s*(\d{1,2})$/i;

/** The most days this parser will read, matching `MAX_SPAN_DAYS` on the server. */
const MAX_DAYS = 31;

/** Leading and trailing separators removed — tabs, dashes, colons, commas. */
function tidy(text: string): string {
  return text.replace(/^[\s\-–—:,]+/, "").replace(/[\s\-–—:,]+$/, "").trim();
}

/** Whole days between two ISO dates, or null if either is unreadable. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** What a day heading says: which day, and the date it carries (if any). */
type DayHeading = { number: number | null; date: string | null };

/**
 * Is this line the start of a DAY of the meet rather than a new meet?
 *
 * A three-day championship prints "Day 2 — Sunday 29 November 2026" above the
 * Sunday half of its programme, and that line is dated with a name before it —
 * which is exactly the shape `parseMeetWorkbook` splits meets on. Left
 * unrecognised, a three-day gala imports as three separate one-day meets.
 *
 * So the day markers are named, and named narrowly: the whole text before the
 * date must be "Day 2" or "Session 2" and nothing else. Anything with a real
 * name in front of it ("2nd Junior League — 4 October 2026") is still a meet.
 *
 * A BARE date — no name, no marker — counts as a day heading only when it falls
 * strictly after the meet's own start and inside the span cap. That bound is
 * what keeps a printer's footer date, or the "closing date for entries", from
 * silently re-dating half a programme.
 */
function dayHeadingOf(line: string, startDate: string | null): DayHeading | null {
  const found = findPrintedDate(line);
  if (found !== null) {
    const before = tidy(line.slice(0, found.index));
    if (before !== "") {
      const marked = DAY_MARKER.exec(before);
      return marked ? { number: Number(marked[1]), date: found.iso } : null;
    }
    if (startDate === null || found.iso <= startDate) return null;
    const gap = daysBetween(startDate, found.iso);
    return gap !== null && gap < MAX_DAYS
      ? { number: null, date: found.iso }
      : null;
  }
  const marked = DAY_MARKER.exec(tidy(line));
  return marked ? { number: Number(marked[1]), date: null } : null;
}

/** Does this header line name a DAY rather than a meet? */
function isDayMarkerName(name: string): boolean {
  return DAY_MARKER.test(tidy(name));
}

/**
 * Read a meet's identity off the line carrying its date.
 *
 * A club programme prints one row per meet — `1st Seeded Gala ⇥ Friday, 11
 * September 2026 ⇥ 6:00 PM ⇥ Les Brown` — and HY-TEK prints the same shape as
 * prose: `HAS 1ST SEEDED GALA 2026 - 11/9/2026`. Both are "name, then date, then
 * whatever else", so the date's own position does the splitting:
 *
 *   before the date  the NAME, verbatim (never re-cased, never invented)
 *   after the date   the start time and the venue, in whichever order
 *
 * Venue is taken POSITIONALLY rather than by keyword, because the real venues
 * here are "Les Brown" and "HIS" — neither contains "pool", "aquatic" or
 * "club", so the old keyword rule found nothing at all.
 *
 * Returns null when there is no name before the date: a bare date is not a meet,
 * and inventing a title is the one thing this module refuses to do.
 */
function identityFromHeader(line: string, found: FoundDate): HeaderIdentity | null {
  const name = line
    .slice(0, found.index)
    .replace(/[\s\-–—:,\t]+$/, "")
    .trim();
  if (name === "") return null;

  const after = line.slice(found.index + found.raw.length);
  const startTime = parsePrintedTime(after);

  // Everything after the date, minus the separators and the time, is the venue.
  // Split on tabs first (a spreadsheet's real column breaks) and fall back to
  // dash-separated prose.
  const venue =
    after
      .split(/\t|\s+[-–—]\s+/)
      .map((part) => part.trim())
      .filter(
        (part) =>
          part !== "" &&
          !/^[-–—:,]+$/.test(part) &&
          parsePrintedTime(part) === null,
      )[0] ?? null;

  return { name, startTime, venue };
}

/**
 * Read `lines[from, to)` into `draft` as its programme.
 *
 * Extracted so the single-meet and multi-meet parsers share one set of rules —
 * and, crucially, so `seenNumbers` is scoped to ONE meet. It used to be
 * document-wide, which is harmless for a one-meet document and catastrophic for
 * a season workbook: twelve meets each numbering their events from 1 would see
 * eleven of them discarded as duplicates.
 *
 * `skipLine` is the header line this block belongs to, so a meet's own title row
 * is never also read as one of its events.
 *
 * DAYS are read here too, because which day an event is on is stated the only
 * way a document can state it: by a heading above the events it covers. Each
 * one sets the day carried by everything beneath it until the next; a dated
 * heading also tells the draft how long the meet runs.
 */
function readProgrammeInto(
  draft: MeetDraft,
  lines: ReadonlyArray<string>,
  from: number,
  to: number,
  skipLine: number,
): void {
  const seenNumbers = new Set<number>();
  // Undefined until a heading says otherwise: a programme with no day headings
  // leaves every line unplaced, which is exactly what it stated.
  let day: number | undefined;
  let lastDated: string | null = null;
  for (let i = from; i < to; i += 1) {
    if (i === skipLine) continue;
    const line = lines[i].trim();
    if (line === "") continue;
    if (isFurniture(line)) continue; // page furniture: not a skip worth reporting

    const heading = dayHeadingOf(line, draft.startDate);
    if (heading !== null) {
      // The DATE decides when it has one — it is the only reading that survives
      // a programme skipping a day ("Day 1 Friday, Day 2 Sunday" over a
      // three-day span). Its own number is the fallback, and failing both, the
      // heading is simply the next day.
      const fromDate =
        heading.date !== null && draft.startDate !== null
          ? daysBetween(draft.startDate, heading.date)
          : null;
      const derived =
        fromDate !== null && fromDate >= 0 ? fromDate + 1 : heading.number;
      day = derived !== null && derived >= 1 && derived <= MAX_DAYS
        ? derived
        : (day ?? 0) + 1;
      if (
        heading.date !== null &&
        draft.startDate !== null &&
        heading.date > draft.startDate &&
        (lastDated === null || heading.date > lastDated)
      ) {
        lastDated = heading.date;
      }
      continue;
    }

    // A CSV header (`eventNumber,event`) is skipped once, silently.
    if (i === 0 && /^\s*(event\s*(number|#|no)?)\s*[,;\t]/i.test(line)) continue;

    const csv = CSV_NUMBERED.exec(line);
    const numbered = csv ?? NUMBERED.exec(line);
    const label = numbered ? numbered[2] : line;
    const number = numbered ? Number(numbered[1]) : undefined;

    if (!EVENT_ISH.test(label)) {
      draft.skipped.push({
        line: i + 1,
        text: line,
        reason: "no stroke or relay in the line — read as heading, not an event",
      });
      continue;
    }

    const event = parseProgrammeLine(label, number);
    if (!event) continue;

    // A duplicate event number means the same line was read twice (a two-column
    // report re-flowed, say). Keep the first; report the second rather than
    // quietly stacking a duplicate into the programme.
    if (event.eventNumber !== undefined) {
      if (seenNumbers.has(event.eventNumber)) {
        draft.skipped.push({
          line: i + 1,
          text: line,
          reason: `event ${event.eventNumber} already read above — duplicate ignored`,
        });
        continue;
      }
      seenNumbers.add(event.eventNumber);
    }
    draft.events.push(day === undefined ? event : { ...event, day });
  }

  if (lastDated !== null) draft.endDate = lastDated;

  // Numbered days with no dates on them: the day each event is on was read, but
  // the meet's span was not, and the server bounds a day index by that span. So
  // say it here rather than letting every day silently fail to save.
  const maxDay = draft.events.reduce((n, e) => Math.max(n, e.day ?? 0), 0);
  if (maxDay > 1 && draft.endDate === null) {
    draft.warnings.push(
      `This programme runs to ${maxDay} days but never dates the last one. Set the meet's end date below, or the day each event is on won't be saved.`,
    );
  }
}

/** The one wording for a day-first reading of an ambiguous printed date. */
function ambiguousDateWarning(found: FoundDate): string {
  return `The printed date is ambiguous — "${found.raw}" was read day-first as ${found.iso}. Check it before saving.`;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * A programme line: an optional leading event number, then the event's name.
 * Handles the PDF's `" 101   Mixed 100 Freestyle"`, a CSV's `101,Mixed 100
 * Freestyle`, and a bare `Mixed 100 Freestyle` with no number at all.
 */
const NUMBERED = /^\s*(\d{1,4})\s*[,;\t]?\s+(\S.*)$/;
const CSV_NUMBERED = /^\s*(\d{1,4})\s*[,;\t]\s*(\S.*)$/;

/** Words that make a line recognisably an EVENT rather than prose. */
const EVENT_ISH =
  /(free|back|breast|fly|butterfly|medley|\bi\.?\s?m\b|relay)/i;

/**
 * Read a whole programme out of text.
 *
 * The meet's identity comes from the first non-furniture line carrying a date —
 * HY-TEK prints `HAS 1ST SEEDED GALA 2026 - 11/9/2026` — with the text before
 * the date taken as the name, verbatim. With no such line there is no name: a
 * top line is not a title just because it is at the top. A venue is recognised
 * from a pool or aquatic-club line above it. Everything else is scanned for
 * programme lines.
 */
export function parseMeetProgramme(text: string): MeetDraft {
  const draft: MeetDraft = {
    name: "",
    startDate: null,
    endDate: null,
    startTime: null,
    venue: null,
    events: [],
    warnings: [],
    skipped: [],
  };

  const lines = text.split(/\r?\n/);
  // The line index the title was taken from, so it is never also read as an event.
  let titleLine = -1;

  // --- identity -------------------------------------------------------------
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || titleLine >= 0) return;
    if (isFurniture(line)) {
      // The banner carries the PRINT date, not the meet date — never read it.
      if (/pool|aquatic|swim(ming)?\s+club|centre|center/i.test(line) && !draft.venue) {
        draft.venue = line.split(/\s+-\s+/)[0].trim() || null;
      }
      return;
    }
    if (!draft.venue && /pool|aquatic\s+centre|aquatic\s+center|swim(ming)?\s+club/i.test(line)) {
      draft.venue = line.split(/\s+-\s+/)[0].trim() || null;
      return;
    }
    const found = findPrintedDate(line);
    if (!found) return;

    const identity = identityFromHeader(line, found);
    if (identity === null) return;
    // "Day 2 — Sunday 29 November 2026" names a day, not the meet. Taking it as
    // the title would name the meet "Day 2" and date it to its second morning.
    if (isDayMarkerName(identity.name)) return;

    draft.name = identity.name;
    draft.startDate = found.iso;
    draft.startTime = identity.startTime;
    if (identity.venue !== null && draft.venue === null) draft.venue = identity.venue;
    titleLine = i;
    if (found.ambiguous) {
      draft.warnings.push(ambiguousDateWarning(found));
    }
  });

  if (draft.startDate === null) {
    draft.warnings.push("No date found — set the meet's date below before saving.");
  }
  if (draft.name === "") {
    // Deliberately NOT filled from the top line. A spreadsheet does title cell
    // A1 — but so does a pasted list that opens "Warm-up from 07:00", and a
    // prefilled wrong name is committable while a blank one holds the button
    // until a person types it. The line is still reported under `skipped`.
    draft.warnings.push("No meet name found — enter one below before saving.");
  }

  const stated = statedCourse(text);
  if (stated) {
    draft.warnings.push(
      `This programme says "${stated.label}" — set the course below to ${
        stated.course === "SCM" ? "short" : "long"
      } course. Nothing here sets it for you.`,
    );
  }

  // --- programme ------------------------------------------------------------
  readProgrammeInto(draft, lines, 0, lines.length, titleLine);

  const unresolved = draft.events.filter(
    (e) => e.distance === undefined || e.stroke === undefined,
  ).length;
  if (unresolved > 0) {
    draft.warnings.push(
      `${unresolved} event${unresolved === 1 ? "" : "s"} (relays, or events this app has no cut for) will show by name only.`,
    );
  }
  if (draft.events.length === 0) {
    draft.warnings.push("No events were found in this file.");
  }

  return draft;
}

// ---------------------------------------------------------------------------
// A whole season in one document
// ---------------------------------------------------------------------------

/**
 * Read EVERY meet in a document.
 *
 * A club does not publish its season one file at a time: it publishes one
 * workbook — "HAS 2026-2027 Seeded and Junior League Galas" — with a dozen dated
 * fixtures in it, each followed by its own numbered programme. Read one meet at
 * a time, that file is twelve careful manual passes, and it will be twelve more
 * next June.
 *
 * The splitting rule is the one `parseMeetProgramme` already has, without the
 * stop. That parser hunts for the FIRST line carrying a readable date and a name
 * before it, calls that the meet's identity, and treats everything else as
 * programme. Here, EVERY such line opens a new meet, and the numbered lines
 * beneath it are its programme — which is exactly how the document reads to a
 * human, and needs no new notion of a "section".
 *
 * With fewer than two headers this delegates to `parseMeetProgramme` verbatim,
 * so every existing document — a HY-TEK export, a pasted list, a one-meet
 * spreadsheet — parses byte-for-byte as it did before. Multi-meet behaviour only
 * appears when the document genuinely contains several meets.
 *
 * Each draft gets its OWN event numbering (see `readProgrammeInto`) and its own
 * warnings, so one meet's ambiguous date or empty programme never reads as
 * another's.
 */
export function parseMeetWorkbook(text: string): MeetDraft[] {
  const lines = text.split(/\r?\n/);

  const headers: Array<{
    line: number;
    found: FoundDate;
    identity: HeaderIdentity;
  }> = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || isFurniture(line)) return;
    const found = findPrintedDate(line);
    if (found === null) return;
    const identity = identityFromHeader(line, found);
    if (identity === null) return; // a bare date is not a meet
    // Nor is "Day 2 — Sunday 29 November 2026": that is this meet's second day,
    // and splitting on it would file one three-day championship as three
    // one-day meets whose programmes each hold a third of the events.
    if (isDayMarkerName(identity.name)) return;
    headers.push({ line: i, found, identity });
  });

  if (headers.length < 2) return [parseMeetProgramme(text)];

  return headers.map((header, n) => {
    const end = n + 1 < headers.length ? headers[n + 1].line : lines.length;
    const draft: MeetDraft = {
      name: header.identity.name,
      startDate: header.found.iso,
      endDate: null,
      startTime: header.identity.startTime,
      venue: header.identity.venue,
      events: [],
      warnings: [],
      skipped: [],
    };
    if (header.found.ambiguous) {
      draft.warnings.push(ambiguousDateWarning(header.found));
    }

    readProgrammeInto(draft, lines, header.line, end, header.line);

    // A course stated IN THIS BLOCK is reported, never applied — the same rule
    // the single-meet parser follows (§4.2). Scoped to the block so one meet's
    // "Short Course" heading cannot silently speak for the other eleven.
    const stated = statedCourse(lines.slice(header.line, end).join("\n"));
    if (stated) {
      draft.warnings.push(
        `This programme says "${stated.label}" — set the course below to ${
          stated.course === "SCM" ? "short" : "long"
        } course. Nothing here sets it for you.`,
      );
    }

    const unresolved = draft.events.filter(
      (e) => e.distance === undefined || e.stroke === undefined,
    ).length;
    if (unresolved > 0) {
      draft.warnings.push(
        `${unresolved} event${unresolved === 1 ? "" : "s"} (relays, or events this app has no cut for) will show by name only.`,
      );
    }
    // Not an error: a club routinely publishes a fixture whose programme is
    // still to come. The dated meet belongs on the calendar now, and a later
    // re-import fills it in.
    if (draft.events.length === 0) {
      draft.warnings.push(
        "No events listed for this meet — it will be saved with its date and an empty programme.",
      );
    }

    return draft;
  });
}
