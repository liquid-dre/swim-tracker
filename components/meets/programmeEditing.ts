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

/**
 * Move a line up or down; a move off either end is a no-op, not a wrap.
 *
 * The two lines swap EVENT NUMBERS as well as positions, because the number is
 * what actually decides the running order: `compareMeetEvents` sorts by it, so
 * every surface that reads the programme back — the meet page, the sign-up
 * sheet, the viewer's list — would otherwise show the original order and make
 * this control a lie.
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
  const out = [...lines];
  const a = out[index];
  const b = out[to];
  if (a.eventNumber !== undefined && b.eventNumber !== undefined) {
    out[index] = { ...a, eventNumber: b.eventNumber };
    out[to] = { ...b, eventNumber: a.eventNumber };
  }
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
 * The first reason this programme could not be saved, or null.
 *
 * Mirrors `cleanEvents` in convex/meets.ts so the form can block before the
 * server has to refuse — the server stays the control either way. It returns
 * WHICH line as well as what is wrong, because "Event 12 has no name" is not
 * actionable in a sixty-line drawer unless something can take you to Event 12.
 */
export function validateLines(
  lines: ReadonlyArray<MeetEvent>,
  course: Course | null,
): ProgrammeProblem | null {
  if (lines.length > 200) {
    return {
      message: `That is ${lines.length} events, more than the 200 a meet can hold.`,
      index: null,
    };
  }

  const seenNumbers = new Map<number, number>();
  for (const [i, line] of lines.entries()) {
    const where =
      line.eventNumber === undefined
        ? `Event ${i + 1}`
        : `Event ${line.eventNumber}`;
    const problem = (message: string): ProgrammeProblem => ({
      message,
      index: i,
    });

    if (line.rawLabel.trim() === "") return problem(`${where} has no name.`);
    if (line.rawLabel.length > 120)
      return problem(`${where}'s name is too long.`);

    // An event number IS the running order, so two lines cannot share one:
    // every read surface sorts by it and would order the pair arbitrarily.
    if (line.eventNumber !== undefined) {
      const first = seenNumbers.get(line.eventNumber);
      if (first !== undefined) {
        return problem(
          `Two events are both numbered ${line.eventNumber}. Give one of them a different number.`,
        );
      }
      seenNumbers.set(line.eventNumber, i);
    }

    const hasDistance = line.distance !== undefined;
    const hasStroke = line.stroke !== undefined;
    if (hasDistance !== hasStroke) {
      return problem(
        `${where} has only half an event: a distance needs a stroke.`,
      );
    }
    if (hasDistance && !isWhitelistedEvent(line.distance!, line.stroke!)) {
      return problem(`${where} ("${line.rawLabel}") is not a real event.`);
    }
    // Not fatal on the server, but it would make the line untimeable, and the
    // coach should hear it now rather than at the poolside.
    if (
      hasDistance &&
      course !== null &&
      !eventFitsCourse(line.distance!, line.stroke!, course)
    ) {
      return problem(
        `${where} (${eventLabel(line.distance!, line.stroke!)}) can't be swum in this meet's course.`,
      );
    }
  }
  return null;
}
