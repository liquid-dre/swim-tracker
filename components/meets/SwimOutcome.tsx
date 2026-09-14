import { formatTime } from "@/lib/swim";

/*
  What a swim at a meet MEANT, in one line of plain English.

  Three surfaces ask this same question — the coach's entry sheet, the viewer's
  "your events" block, and a swimmer's Meets tab — and the first two had grown
  near-identical private copies of the logic (`Comparison` and `Outcome`), each
  with its own duplicate of the seconds formatter and its own slightly different
  wording for the same fact. A third copy was the moment to make it one.

  Never colour alone (DESIGN.md): "personal best" is a word first; the green only
  reinforces it. The strings are deliberately about the MARK THEY CAME IN WITH —
  `pbBefore` in `lib/swim.ts` — not their all-time best, because that is the
  comparison a coach makes standing at the end of the lane.
*/

/** The comparison fields every meet-swim row already carries. */
export type SwimOutcomeRow = {
  timeMs: number | null;
  pbBeforeMs: number | null;
  /** Signed `pbBefore − time`, so positive means faster. */
  deltaMs: number | null;
  newPb: boolean;
  firstTime: boolean;
};

/** A signed millisecond gap as seconds, the way a coach says it out loud. */
export function formatDelta(ms: number): string {
  return `${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

export function SwimOutcome({ row }: { row: SwimOutcomeRow }) {
  // Not swum yet — a plan, not a result. Say what they are bringing to it.
  if (row.timeMs === null) {
    return (
      <>
        {row.pbBeforeMs === null
          ? "No previous time for this event."
          : `Best going in ${formatTime(row.pbBeforeMs)}.`}
      </>
    );
  }

  if (row.firstTime) return <>First time at this event, so this is the best.</>;
  if (row.pbBeforeMs === null || row.deltaMs === null) {
    return <>Nothing to compare this against.</>;
  }

  const delta = row.deltaMs;
  return (
    <>
      Best going in{" "}
      <span className="tabular-nums">{formatTime(row.pbBeforeMs)}</span>
      {" · "}
      <span className={row.newPb ? "font-medium text-success-ink" : undefined}>
        {row.newPb
          ? `New personal best, ${formatDelta(delta)} faster`
          : delta === 0
            ? "Matched it exactly"
            : `${formatDelta(-delta)} slower`}
      </span>
    </>
  );
}
