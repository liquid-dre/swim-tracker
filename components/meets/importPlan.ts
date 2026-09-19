/*
  Which rows a press of Import writes, and what it destroys doing it.

  Pure, and in its own file, because every count on that screen is a view of
  this one question — the button's number, the warning beside it, the blocked
  reason, the confirmation's count and the list of meets it names. They used to
  be five separate pieces of arithmetic over three arrays held in parallel
  (`drafts`, the edits, the outcomes), correlated by position.

  One of those correlations was made against the FILTERED "included" array, so
  a single skipped row shifted every lookup after it. The observable result was
  not an off-by-one in a label: after a partial failure, a retry could find no
  replacement at all, skip the confirmation entirely, and overwrite a programme
  with no dialog. A count and a dialog cannot disagree if neither is allowed to
  do its own arithmetic.
*/

/** A row's outcome, narrowed to the only thing this file needs from it. */
export type PlanOutcome = { status: string };

export type PlanRow = {
  /** Deliberately left out of this import. */
  skip: boolean;
  /** "" = create a new meet; otherwise the id of the meet this replaces. */
  target: string;
};

export type ImportPlan = {
  /** Indices into the ORIGINAL rows array, of what the next press writes. */
  write: number[];
  /** The ids those rows replace, in row order, including repeats. */
  replaces: string[];
  /** Each replaced id once, in first-seen order — what a confirmation lists. */
  replaceIds: string[];
  /** An id two rows both claim, or null. The second write would erase the first. */
  duplicateId: string | null;
};

export function importPlan(
  rows: ReadonlyArray<PlanRow>,
  outcomes: ReadonlyArray<PlanOutcome>,
): ImportPlan {
  const write: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    // Indices into `rows`, never into a filtered copy of it — the whole point.
    // A saved row is skipped by the writer on a retry, so it is not in play.
    if (rows[i].skip) continue;
    if (outcomes[i]?.status === "saved") continue;
    write.push(i);
  }

  const replaces = write.map((i) => rows[i].target).filter((t) => t !== "");
  const replaceIds = replaces.filter((t, i) => replaces.indexOf(t) === i);
  const duplicateId =
    replaceIds.length === replaces.length
      ? null
      : (replaces.find((t, i) => replaces.indexOf(t) !== i) ?? null);

  return { write, replaces, replaceIds, duplicateId };
}
