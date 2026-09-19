"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Select } from "@/components/ui/Select";
import { normaliseDigits, parseDigits } from "@/components/log/TimeField";
import { formatMeetDay, formatMeetDayDate, formatMeetDayShort } from "@/lib/meets";
import { formatTime } from "@/lib/swim";
import { SwimOutcome } from "./SwimOutcome";

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
  /** The day the programme now puts this event on, when it is not this one. */
  dayMismatch: string | null;
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
  // Built once for the sheet, not once per option per row.
  const dayOptions = days.map((day, i) => {
    const label = formatMeetDayShort(datesOf(days), i + 1);
    return { value: day, label, textValue: label };
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-ink-muted">
        Nobody is entered for this event yet.
      </p>
    );
  }

  return (
    <ul
      aria-label={`Swimmers entered, ${rows.length}`}
      className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      {rows.map((row) => (
        <li key={row._id} className="flex flex-col gap-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-ink">
              {row.name}
            </span>

            {days.length > 1 && (
              <Select
                aria-label={`Which day ${row.name} swims`}
                // The control whose value the warning below contradicts, tied
                // to it so a screen reader meets the reason with the control
                // rather than a paragraph away.
                aria-invalid={row.dayMismatch !== null ? true : undefined}
                aria-describedby={
                  row.dayMismatch !== null
                    ? `${row._id}-day-mismatch`
                    : undefined
                }
                value={row.swimDate}
                onValueChange={(value) => onSetDay(row._id, value)}
                size="sm"
                // The same short spelling as the programme editor's picker —
                // "Day 2" alone left the roster naming the day a third way.
                // `textValue` is what typeahead matches, so it has to be the
                // label: nobody jumps to a row by typing "2026-11-29".
                options={dayOptions}
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
              // Same idiom as the programme editor's IconButton: the REASON
              // goes in the accessible name, because `title` is a mouse
              // affordance an iPad never shows and a native `disabled` button
              // is unfocusable, so neither touch nor keyboard could reach it —
              // on the one destructive control here.
              aria-label={
                row.resultId === null
                  ? `Take ${row.name} off this event`
                  : `Take ${row.name} off this event — delete the recorded time first`
              }
              title={
                row.resultId === null
                  ? `Take ${row.name} off this event`
                  : "Delete the recorded time before taking this swimmer off"
              }
              aria-disabled={row.resultId !== null || undefined}
              onClick={() => {
                if (row.resultId !== null) return;
                onRemove(row._id);
              }}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors lg:size-9 touch:size-11 [transition-duration:var(--dur-1)] outline-none hover:bg-error-50 hover:text-error-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 aria-disabled:bg-gray-100 aria-disabled:text-gray-500 aria-disabled:cursor-default aria-disabled:hover:bg-gray-100 aria-disabled:hover:text-gray-500"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>

          <p className="text-xs text-ink-muted">
            <SwimOutcome row={row} />
            {row.genderMismatch && (
              <span className="text-warning-ink">
                {" · "}This event is no longer for this swimmer&rsquo;s
                category.
              </span>
            )}
            {/* The programme moved under an entry already made. Said in words
                beside a one-click fix, because the date drives `ageAtSwim` and
                a swim on the wrong side of a birthday is judged against the
                wrong cut with nothing downstream to flag it. */}
          </p>

          {/* Its own line with a real button, not a 16px link inside a 12px
              sentence: this is a poolside tap on a tablet, and the button
              rewrites a stored swim's date and `ageAtSwim`. */}
          {row.dayMismatch !== null && (
            <p
              id={`${row._id}-day-mismatch`}
              className="flex flex-wrap items-center gap-2 text-xs text-warning-ink"
            >
              <span>
                The programme now swims this on{" "}
                {dayLabel(days, row.dayMismatch)}.
              </span>
              <button
                type="button"
                disabled={busyId === row._id}
                onClick={() => onSetDay(row._id, row.dayMismatch!)}
                className="inline-flex h-11 items-center rounded-lg border border-warning-500/40 bg-white px-3 text-xs font-medium text-warning-ink outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-warning-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 lg:h-8 touch:h-11"
              >
                Move {row.name}
              </button>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
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
        aria-describedby={
          parsed.error !== null ? `${row._id}-time-error` : undefined
        }
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
          "h-11 w-32 rounded-lg border bg-white px-2 text-right text-sm tabular-nums text-gray-800 lg:h-9 touch:h-11 lg:w-28 placeholder:text-gray-500 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50 " +
          (parsed.error !== null
            ? "border-error-500 bg-error-50"
            : "border-gray-300 hover:border-gray-400")
        }
      />
      {parsed.error !== null && (
        <span id={`${row._id}-time-error`} className="text-xs text-danger-ink">
          {parsed.error}
        </span>
      )}
    </span>
  );
}

/**
 * The meet's span, from the day list the sheet already holds.
 *
 * `meetDates` is contiguous, so first-and-last reconstructs it exactly. Kept in
 * one place rather than rebuilt at each call site, because it is a projection
 * being turned back into the thing it was projected from.
 */
function datesOf(days: ReadonlyArray<string>) {
  return { startDate: days[0], endDate: days[days.length - 1] };
}

/** A day of the meet in the app's FULL spelling, from its ISO date. */
function dayLabel(days: ReadonlyArray<string>, iso: string): string {
  const i = days.indexOf(iso);
  return i >= 0 ? formatMeetDay(datesOf(days), i + 1) : formatMeetDayDate(iso);
}
