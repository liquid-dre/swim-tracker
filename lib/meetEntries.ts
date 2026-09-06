// lib/meetEntries.ts — sign-ups: one swimmer on one line of one meet's programme.
//
// Pure, framework-free, no I/O — the same contract as lib/meets.ts and
// lib/swim.ts. What lives here is the reasoning that has nothing to do with the
// database: how a club's entries roll up into the counts a meets list shows,
// and which entry a freshly logged time belongs to.
//
// The PB arithmetic deliberately does NOT live here. `pbBefore` and
// `compareToPbBefore` are in lib/swim.ts with the rest of §4.6, because "the
// fastest MEET swim" is a fact about personal bests that entries merely
// consume — duplicating it here would be the third copy of a rule this codebase
// has only just finished reducing to one.

/** What a meets-list row says about a club's sign-ups for one meet. */
export type EntryTally = {
  /** Swimmers signed up. */
  entered: number;
  /** How many of those have a time recorded. */
  timed: number;
};

/**
 * Roll a club's entries up per meet.
 *
 * The meets list needs a count for every meet on screen, which is why entries
 * are read for a whole date range in one seek and tallied here rather than
 * queried per row.
 */
export function tallyEntriesByMeet<
  T extends { meetId: string; resultId?: unknown },
>(entries: ReadonlyArray<T>): Map<string, EntryTally> {
  const out = new Map<string, EntryTally>();
  for (const entry of entries) {
    const tally = out.get(entry.meetId) ?? { entered: 0, timed: 0 };
    tally.entered++;
    if (entry.resultId !== undefined && entry.resultId !== null) tally.timed++;
    out.set(entry.meetId, tally);
  }
  return out;
}

/** "14 of 18 timed" for a meet that has been swum; plain "18" for one to come. */
export function describeTally(tally: EntryTally, upcoming: boolean): string {
  if (tally.entered === 0) return "";
  if (upcoming || tally.timed === tally.entered) return String(tally.entered);
  return `${tally.timed} of ${tally.entered} timed`;
}

/**
 * Which sign-up a time just logged through the log form belongs to.
 *
 * A coach who logs poolside the usual way should not have to also tick the
 * swimmer off on the meet sheet — if they were entered for this event, that
 * entry is what the swim fills. Candidates are the swimmer's own entries at
 * this meet whose line RESOLVED to this exact event and that have no time yet;
 * the earliest event number wins, because that is the order the meet runs in.
 *
 * Returns null when nothing matches, and that is a real state rather than a
 * failure: the swim shows on the meet as one nobody was signed up for, which is
 * exactly what happened.
 */
export function pickEntryToFill<
  T extends {
    resultId?: unknown;
    distance?: number;
    stroke?: string;
    eventNumber?: number;
  },
>(
  entries: ReadonlyArray<T>,
  event: { distance: number; stroke: string },
): T | null {
  const candidates = entries.filter(
    (e) =>
      e.resultId === undefined &&
      e.distance === event.distance &&
      e.stroke === event.stroke,
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, e) => {
    const a = e.eventNumber ?? Number.MAX_SAFE_INTEGER;
    const b = best.eventNumber ?? Number.MAX_SAFE_INTEGER;
    return a < b ? e : best;
  });
}
