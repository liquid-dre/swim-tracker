"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Select } from "@/components/ui/Select";
import { normaliseDigits, parseDigits } from "@/components/log/TimeField";
import { formatTime } from "@/lib/swim";

/*
  The swimmers entered for one event, and what they went.

  Presentational: props in, markup out, no queries — so it renders in the design
  preview with mocks, and so the sheet above it owns every decision about what a
  mutation means.

  A row is one swimmer's whole story at this event, in reading order: who, what
  they went, what they came in with, and whether the day was an improvement. The
  comparison is deliberately three separate facts rather than one coloured
  number — colour alone never carries meaning here, so "New PB" is a word.
*/

export type EntryRow = {
  _id: string;
  name: string;
  swimDate: string;
  genderMismatch: boolean;
  resultId: string | null;
  timeMs: number | null;
  pbBeforeMs: number | null;
  deltaMs: number | null;
  newPb: boolean;
  firstTime: boolean;
};

export function EntryRosterTable({
  rows,
  days,
  courseKnown,
  resolved,
  busyId,
  onRecordTime,
  onSetDay,
  onRemove,
}: {
  rows: ReadonlyArray<EntryRow>;
  /** The meet's days. One day = no day control at all. */
  days: ReadonlyArray<string>;
  /** A time cannot be recorded until the meet says which pool it is in. */
  courseKnown: boolean;
  /** A relay is on the programme but is not one swimmer's event. */
  resolved: boolean;
  busyId: string | null;
  onRecordTime: (entryId: string, timeInput: string) => void;
  onSetDay: (entryId: string, swimDate: string) => void;
  onRemove: (entryId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-ink-muted">
        Nobody is entered for this event yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {rows.map((row) => (
        <li key={row._id} className="flex flex-col gap-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-ink">
              {row.name}
            </span>

            {days.length > 1 && (
              <Select
                aria-label={`Which day ${row.name} swims`}
                value={row.swimDate}
                onValueChange={(value) => onSetDay(row._id, value)}
                size="sm"
                options={days.map((day, i) => ({
                  value: day,
                  label: `Day ${i + 1}`,
                  textValue: day,
                }))}
              />
            )}

            {resolved && courseKnown ? (
              <RowTime
                row={row}
                busy={busyId === row._id}
                onCommit={(input) => onRecordTime(row._id, input)}
              />
            ) : (
              <span className="text-xs text-ink-faint">
                {resolved ? "Set the meet's course" : "No time to record"}
              </span>
            )}

            <button
              type="button"
              aria-label={`Take ${row.name} off this event`}
              title={
                row.resultId === null
                  ? `Take ${row.name} off this event`
                  : "Delete the recorded time before taking this swimmer off"
              }
              disabled={row.resultId !== null}
              onClick={() => onRemove(row._id)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors [transition-duration:var(--dur-1)] outline-none hover:bg-error-50 hover:text-error-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>

          <p className="text-xs text-ink-muted">
            <Comparison row={row} />
            {row.genderMismatch && (
              <span className="text-warning-ink">
                {" · "}This event is no longer for this swimmer&rsquo;s
                category.
              </span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** What the swim meant, in words rather than in colour alone. */
function Comparison({ row }: { row: EntryRow }) {
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
  if (row.pbBeforeMs === null) return <>Nothing to compare this against.</>;

  const delta = row.deltaMs ?? 0;
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

/** A signed millisecond gap as seconds, the way a coach says it out loud. */
function formatDelta(ms: number): string {
  return `${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

/**
 * One row's time, on the same right-to-left digit model the log form uses:
 * digits fill hundredths, then seconds, then minutes. Committed on blur or
 * Enter rather than on every keystroke, so a half-typed time is never saved.
 */
function RowTime({
  row,
  busy,
  onCommit,
}: {
  row: EntryRow;
  busy: boolean;
  onCommit: (input: string) => void;
}) {
  const stored = row.timeMs === null ? "" : formatTime(row.timeMs);
  const [digits, setDigits] = useState(() => normaliseDigits(stored));
  const lastStored = useRef(stored);

  // A time changed elsewhere (another coach, or the log form filling this
  // entry) replaces what is shown — but never while it is being typed into.
  useEffect(() => {
    if (lastStored.current !== stored) {
      lastStored.current = stored;
      setDigits(normaliseDigits(stored));
    }
  }, [stored]);

  const parsed = parseDigits(digits);
  const dirty = normaliseDigits(stored) !== digits;

  function commit() {
    if (!dirty || parsed.ms === null) return;
    onCommit(parsed.text);
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <input
        inputMode="numeric"
        aria-label={`Time for ${row.name}`}
        aria-invalid={parsed.error !== null ? true : undefined}
        disabled={busy}
        value={parsed.text ?? ""}
        placeholder="—:——:——"
        onChange={(e) => setDigits(normaliseDigits(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={
          "h-9 w-28 rounded-lg border bg-white px-2 text-right text-sm tabular-nums text-gray-800 placeholder:text-gray-500 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50 " +
          (parsed.error !== null
            ? "border-error-500 bg-error-50"
            : "border-gray-300 hover:border-gray-400")
        }
      />
      {parsed.error !== null && (
        <span className="text-xs text-danger-ink">{parsed.error}</span>
      )}
    </span>
  );
}
