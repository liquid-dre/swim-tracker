import {
  computeMatrixCell,
  eventSortKey,
  type Course,
  type CutsByCourse,
  type Distance,
  type GalaCode,
  type PbByGalaCourse,
  type Stroke,
} from "./swim";

/*
  "Close to a cut" — the dashboard card and the panel behind it.

  An EVENT is close when the gap to the next gala the swimmer has not yet made,
  in EITHER course, is above zero and at most one second. It is judged the way
  the status matrix's Best-of-both mode judges a cell (`computeMatrixCell` with
  "BEST"), because both courses are valid for entry (§4.2): a long-course swim
  0.40s off a SANJ cut the swimmer has already beaten in short course gets them
  nothing new, so it is not close. One verdict per event, never one per course,
  measured in whichever course the swimmer is nearer the cut in.

  The card counts SWIMMERS with at least one close event; the panel lists those
  events. Both read this one copy so the number and the list cannot disagree.
*/

/** Within 1.00s of the next cut — the threshold the dashboard copy states. */
export const CLOSE_TO_CUT_MS = 1000;

export type CloseEvent = {
  distance: Distance;
  stroke: Stroke;
  label: string;
  course: Course; // the course the gap was measured in (the nearer one)
  pbMs: number; // the qualifying time behind the gap
  nextGala: GalaCode;
  gapMs: number; // > 0 and ≤ CLOSE_TO_CUT_MS
};

/**
 * The close-to-a-cut verdict for one event: the qualifying time, next gala and
 * gap when the swimmer is within `CLOSE_TO_CUT_MS` of a gala they have not made
 * in either course, otherwise null.
 */
export function closeToCutVerdict(
  pb: PbByGalaCourse,
  cuts: CutsByCourse,
): Pick<CloseEvent, "course" | "pbMs" | "nextGala" | "gapMs"> | null {
  const cell = computeMatrixCell(pb, cuts, "BEST");
  if (
    cell.nextGala === null ||
    cell.gapMs === null ||
    cell.gapCourse === null ||
    cell.pbMs === null ||
    cell.gapMs <= 0 ||
    cell.gapMs > CLOSE_TO_CUT_MS
  ) {
    return null;
  }
  return {
    course: cell.gapCourse,
    pbMs: cell.pbMs,
    nextGala: cell.nextGala,
    gapMs: cell.gapMs,
  };
}

/** Closest first; canonical event order breaks a tie. */
export function compareCloseEvents(a: CloseEvent, b: CloseEvent): number {
  return (
    a.gapMs - b.gapMs ||
    eventSortKey(a.distance, a.stroke) - eventSortKey(b.distance, b.stroke)
  );
}

/**
 * Swimmers ordered by their single closest event, then by name. Expects each
 * swimmer's `events` already sorted with `compareCloseEvents` and non-empty.
 */
export function compareCloseSwimmers(
  a: { name: string; events: ReadonlyArray<CloseEvent> },
  b: { name: string; events: ReadonlyArray<CloseEvent> },
): number {
  return a.events[0].gapMs - b.events[0].gapMs || a.name.localeCompare(b.name);
}
