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

/**
 * A printed date → ISO. **Day first**: these are Southern-African meet reports
 * (the sample is Zimbabwe Aquatic Union), and `11/9/2026` there is 11 September.
 *
 * When both halves are ≤ 12 the printed form is genuinely ambiguous. We still
 * read it day-first — a silent coin-flip is the one thing worse than a rule —
 * but return `ambiguous`, so the import preview can say so and the super-user
 * can correct it before anything is written.
 */
export function parsePrintedDate(
  text: string,
): { iso: string; ambiguous: boolean } | null {
  // ISO first: unambiguous, and what a CSV or a pasted line most likely uses.
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealDate(candidate) ? { iso: candidate, ambiguous: false } : null;
  }

  const slash = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (!slash) return null;
  const day = Number(slash[1]);
  const month = Number(slash[2]);
  const year = normaliseYear(Number(slash[3]));
  if (year === null || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (!isRealDate(candidate)) return null;
  return { iso: candidate, ambiguous: day <= 12 };
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
    const found = parsePrintedDate(line);
    if (!found) return;

    // Name = everything before the date, with the separator trimmed off.
    const beforeDate = line.slice(0, line.search(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/));
    const name = beforeDate.replace(/[\s\-–—:,]+$/, "").trim();
    if (name === "") return;

    draft.name = name;
    draft.startDate = found.iso;
    titleLine = i;
    if (found.ambiguous) {
      draft.warnings.push(
        `The printed date is ambiguous — "${line.match(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/)?.[0]}" was read day-first as ${found.iso}. Check it before saving.`,
      );
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
  const seenNumbers = new Set<number>();
  lines.forEach((raw, i) => {
    if (i === titleLine) return;
    const line = raw.trim();
    if (line === "") return;
    if (isFurniture(line)) return; // page furniture: not a skip worth reporting

    // A CSV header (`eventNumber,event`) is skipped once, silently.
    if (i === 0 && /^\s*(event\s*(number|#|no)?)\s*[,;\t]/i.test(line)) return;

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
      return;
    }

    const event = parseProgrammeLine(label, number);
    if (!event) return;

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
        return;
      }
      seenNumbers.add(event.eventNumber);
    }
    draft.events.push(event);
  });

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
