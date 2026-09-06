import {
  buildRawLabel,
  newLineId,
  splitLineByGender,
  type MeetEvent,
  type MeetEventGender,
} from "@/lib/meets";
import {
  EVENT_WHITELIST,
  eventLabel,
  isWhitelistedEvent,
  STROKE_LABEL,
  type Course,
  type Distance,
  type Stroke,
} from "@/lib/swim";

/*
  The programme editor's reasoning, with no React in it.

  Editing a programme is a sequence of small, total transformations on a list of
  lines — add, re-word, re-sex, split, reorder, remove — and each one has a rule
  worth being sure about. Keeping them here means they are unit-tested against
  the same whitelist the server validates with, rather than being verified by
  clicking around a drawer.

  The invariant they all preserve: every line has an id, and a line that already
  had one keeps it. An id is what sign-ups point at, so re-issuing one during an
  edit would strand a coach's entries just as surely as deleting the line.
*/

/** Courses in the words the Details tab uses, not their codes. */
const COURSE_WORDS: Record<Course, string> = {
  LCM: "long course",
  SCM: "short course",
};

/** One searchable event on the add-an-event list. */
export type EventOption = {
  distance: Distance;
  stroke: Stroke;
  label: string;
  /**
   * Valid for the meet's course. Invalid options are DISABLED rather than
   * hidden, per the app's event-selector convention: "100 IM is short course
   * only" is a fact worth showing, and a silently missing row reads as a bug.
   */
  allowed: boolean;
  /** Why not, when it isn't. */
  reason: string | null;
};

/** The whitelist as a searchable list, in canonical event order. */
export function eventOptions(
  course: Course | null,
  search: string,
): EventOption[] {
  const needle = search.trim().toLowerCase();
  return EVENT_WHITELIST.map((row) => {
    const label = eventLabel(row.distance, row.stroke);
    const allowed = course === null || row.allowedCourses.includes(course);
    return {
      distance: row.distance,
      stroke: row.stroke,
      label,
      allowed,
      reason: allowed
        ? null
        : `${label} is ${row.allowedCourses.map((c) => COURSE_WORDS[c]).join(" and ")} only.`,
    };
  }).filter((option) => {
    if (needle === "") return true;
    const haystack =
      `${option.label} ${STROKE_LABEL[option.stroke]} ${option.distance}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/** The next programme number, continuing the meet's own sequence. */
export function nextEventNumber(
  lines: ReadonlyArray<MeetEvent>,
): number | undefined {
  const numbers = lines
    .map((l) => l.eventNumber)
    .filter((n): n is number => n !== undefined);
  // A programme with no numbers at all stays unnumbered — inventing a running
  // order the document never stated would be a claim, not a convenience.
  return numbers.length === 0 ? undefined : Math.max(...numbers) + 1;
}

/** Add one whitelisted event, worded the way a programme would word it. */
export function addWhitelistLine(
  lines: ReadonlyArray<MeetEvent>,
  event: { distance: Distance; stroke: Stroke },
  mint: () => string = newLineId,
): MeetEvent[] {
  const eventNumber = nextEventNumber(lines);
  return [
    ...lines,
    {
      id: mint(),
      ...(eventNumber === undefined ? {} : { eventNumber }),
      rawLabel: buildRawLabel({ gender: "MIXED", ...event }) ?? "",
      gender: "MIXED",
      distance: event.distance,
      stroke: event.stroke,
    },
  ];
}

/**
 * Add a line this app has no event for — a relay, a 25 m sprint, a novelty
 * race. It goes on the programme because it IS on the programme; it simply
 * never resolves, so nobody can be timed against it.
 */
export function addCustomLine(
  lines: ReadonlyArray<MeetEvent>,
  rawLabel: string,
  mint: () => string = newLineId,
): MeetEvent[] {
  const eventNumber = nextEventNumber(lines);
  return [
    ...lines,
    {
      id: mint(),
      ...(eventNumber === undefined ? {} : { eventNumber }),
      rawLabel: rawLabel.trim().replace(/\s+/g, " "),
      gender: "MIXED",
    },
  ];
}

/**
 * Change one line.
 *
 * The label follows the event only while it is still the generated one. Once
 * somebody has typed their own words — the source document's, usually — those
 * words are the record and nothing here overwrites them.
 */
export function updateLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  patch: Partial<MeetEvent>,
): MeetEvent[] {
  return lines.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, ...patch };
    const wasGenerated = line.rawLabel === buildRawLabel(line);
    if (wasGenerated && patch.rawLabel === undefined) {
      next.rawLabel = buildRawLabel(next) ?? line.rawLabel;
    }
    return next;
  });
}

/** Clear a line's resolved event, leaving the words. */
export function unresolveLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
): MeetEvent[] {
  return lines.map((line, i) =>
    i === index
      ? {
          id: line.id,
          rawLabel: line.rawLabel,
          gender: line.gender,
          ...(line.eventNumber === undefined
            ? {}
            : { eventNumber: line.eventNumber }),
        }
      : line,
  );
}

/** Point a line at a real event, refusing anything off the whitelist (§4.3). */
export function resolveLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  event: { distance: Distance; stroke: Stroke },
): MeetEvent[] {
  if (!isWhitelistedEvent(event.distance, event.stroke)) return [...lines];
  return updateLine(lines, index, event);
}

export function setLineGender(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  gender: MeetEventGender,
): MeetEvent[] {
  return updateLine(lines, index, { gender });
}

/** Does every line carry a number? Does none? Anything else is neither. */
function numbering(lines: ReadonlyArray<MeetEvent>): "all" | "none" | "mixed" {
  const numbered = lines.filter((l) => l.eventNumber !== undefined).length;
  if (numbered === 0) return "none";
  if (numbered === lines.length) return "all";
  return "mixed";
}

/**
 * Number every line 1..n in its current array order.
 *
 * `nextEventNumber` deliberately refuses to invent numbers when a line is
 * merely ADDED — a running order the source document never stated is a claim,
 * not a convenience. Asking to reorder is different: it is the coach stating
 * one. So this is reachable only from `moveLine`, and only on a programme that
 * has no numbers at all.
 */
export function numberAll(lines: ReadonlyArray<MeetEvent>): MeetEvent[] {
  return lines.map((line, i) => ({ ...line, eventNumber: i + 1 }));
}

/**
 * Move a line up or down; a move off either end is a no-op, not a wrap.
 *
 * The two lines swap EVENT NUMBERS as well as positions, because the number is
 * what actually decides the running order. `compareMeetEvents` sorts by it, and
 * falls back to distance-and-stroke for lines that have none — never to array
 * position. So an array-only move is invisible everywhere the programme is read
 * back: the meet page, the sign-up sheet, the viewer's list.
 *
 * A programme with no numbers therefore gets them here, from its current order,
 * because that is the only way an order can be expressed at all. A programme
 * with SOME numbers is refused: half a running order is not one, and guessing
 * which half to extend would be inventing the meet's schedule.
 */
export function moveLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  delta: -1 | 1,
): MeetEvent[] {
  const to = index + delta;
  if (index < 0 || index >= lines.length || to < 0 || to >= lines.length) {
    return [...lines];
  }
  const shape = numbering(lines);
  if (shape === "mixed") return [...lines];

  const out = shape === "none" ? numberAll(lines) : [...lines];
  const a = out[index];
  const b = out[to];
  out[index] = { ...a, eventNumber: b.eventNumber };
  out[to] = { ...b, eventNumber: a.eventNumber };
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function removeLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
): MeetEvent[] {
  return lines.filter((_, i) => i !== index);
}

/**
 * Split a mixed line into a boys' line and a girls' line, in place.
 *
 * The boys' line keeps the original id so sign-ups already made survive; the
 * girls' line is new and takes the next number, so the pair reads as the two
 * consecutive races they are.
 *
 * That inserted number belongs to somebody, so every line after it shifts up by
 * one. Without that, splitting event 4 mints a second event 5 and the programme
 * has two lines claiming one slot — which nothing downstream could tell apart,
 * since the number IS the running order.
 */
export function splitLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  mint: () => string = newLineId,
): MeetEvent[] {
  const line = lines[index];
  if (line === undefined) return [...lines];
  const [boys, girls] = splitLineByGender(line, mint);
  const after = lines
    .slice(index + 1)
    .map((l) =>
      girls.eventNumber !== undefined &&
      l.eventNumber !== undefined &&
      l.eventNumber >= girls.eventNumber
        ? { ...l, eventNumber: l.eventNumber + 1 }
        : l,
    );
  return [...lines.slice(0, index), boys, girls, ...after];
}

/**
 * Can this line be moved? Not on a programme that numbers only some of its
 * events: the number is the running order, half an order is not one, and a
 * move that could not be expressed would appear to work and then not stick.
 */
export function canMoveLine(
  lines: ReadonlyArray<MeetEvent>,
  index: number,
  delta: -1 | 1,
): boolean {
  const to = index + delta;
  if (lines[index] === undefined || lines[to] === undefined) return false;
  return numbering(lines) !== "mixed";
}

/** Why reordering is unavailable on this programme, or null. */
export function reorderBlockedReason(
  lines: ReadonlyArray<MeetEvent>,
): string | null {
  return numbering(lines) === "mixed"
    ? "Some events here are numbered and some aren't. The number is the running order, so give every event one (or none) before reordering."
    : null;
}

/** A programme problem, and which line to send the coach to. */
export type ProgrammeProblem = {
  message: string;
  /** Index into `lines`, or null when the problem is the list as a whole. */
  index: number | null;
};

/** Can this event be swum in this course at all? (§4.3 — 100 IM and 25 m are SCM.) */
export function eventFitsCourse(
  distance: Distance,
  stroke: Stroke,
  course: Course,
): boolean {
  return EVENT_WHITELIST.some(
    (row) =>
      row.distance === distance &&
      row.stroke === stroke &&
      row.allowedCourses.includes(course),
  );
}

/**
 * Every reason this programme could not be saved, in line order.
 *
 * Mirrors `cleanEvents` in convex/meets.ts — and only `cleanEvents`. A rule the
 * server does not enforce must not block the save here either: a stored
 * programme that predates the rule would then be unsaveable for ANY edit,
 * including a one-character fix to the meet's name. The course mismatch is
 * exactly that case, so it is a per-line warning (`EventPair` renders it) and
 * not a problem.
 *
 * All of them, not the first, so eight bad lines is one pass rather than eight
 * rounds of fix-blocked-fix.
 */
export function validateLines(
  lines: ReadonlyArray<MeetEvent>,
): ProgrammeProblem[] {
  if (lines.length > 200) {
    return [
      {
        message: `That is ${lines.length} events, more than the 200 a meet can hold.`,
        index: null,
      },
    ];
  }

  const out: ProgrammeProblem[] = [];
  const seenNumbers = new Set<number>();
  for (const [i, line] of lines.entries()) {
    const where =
      line.eventNumber === undefined
        ? `Event ${i + 1}`
        : `Event ${line.eventNumber}`;
    const say = (message: string) => out.push({ message, index: i });

    if (line.rawLabel.trim() === "") {
      say(`${where} has no name.`);
    } else if (line.rawLabel.length > 120) {
      say(`${where}'s name is too long.`);
    }

    // An event number IS the running order, so two lines cannot share one:
    // every read surface sorts by it and would order the pair arbitrarily.
    if (line.eventNumber !== undefined) {
      if (seenNumbers.has(line.eventNumber)) {
        say(
          `Two events are both numbered ${line.eventNumber}. Give one of them a different number.`,
        );
      }
      seenNumbers.add(line.eventNumber);
    }

    const hasDistance = line.distance !== undefined;
    const hasStroke = line.stroke !== undefined;
    if (hasDistance !== hasStroke) {
      say(`${where} has only half an event: a distance needs a stroke.`);
    } else if (hasDistance && !isWhitelistedEvent(line.distance!, line.stroke!)) {
      say(`${where} ("${line.rawLabel}") is not a real event.`);
    }
  }
  return out;
}
