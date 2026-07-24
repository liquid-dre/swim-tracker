"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { AttendanceStatus } from "./types";
import { STATUS_META, STATUS_ORDER } from "./attendance-format";

/*
  The roster checklist for one session (§R18). Each swimmer gets a status, an
  optional private note, and a per-note "show swimmer" toggle. A status persists on
  click; the note persists on blur; the toggle on change. On a FUTURE session only
  Excused is enabled (an advance absence must be a communicated excusal). Note and
  toggle unlock only once a status exists (there's no row to attach them to yet).
*/

export type RosterRow = {
  swimmerId: Id<"swimmers">;
  name: string;
  status: AttendanceStatus | null;
  note: string | null;
  noteVisibleToViewer: boolean;
};

function StatusButtons({
  value,
  isFuture,
  disabled,
  onSet,
}: {
  value: AttendanceStatus | null;
  isFuture: boolean;
  disabled: boolean;
  onSet: (status: AttendanceStatus) => void;
}) {
  return (
    <div role="group" aria-label="Attendance status" className="flex flex-wrap gap-1">
      {STATUS_ORDER.map((s) => {
        const active = value === s;
        const blocked = disabled || (isFuture && s !== "EXCUSED");
        const meta = STATUS_META[s];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            disabled={blocked}
            title={isFuture && s !== "EXCUSED" ? "Only 'Excused' can be set ahead of time" : undefined}
            onClick={() => onSet(s)}
            className={cn(
              "h-9 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? meta.chip
                : "border-gray-300 bg-white text-ink-muted hover:border-gray-400",
              blocked && "cursor-not-allowed opacity-40 hover:border-gray-300",
            )}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  row,
  isFuture,
  disabled,
  onSetStatus,
  onCommitNote,
  onToggleVisible,
}: {
  row: RosterRow;
  isFuture: boolean;
  disabled: boolean;
  onSetStatus: (id: Id<"swimmers">, status: AttendanceStatus) => void;
  onCommitNote: (id: Id<"swimmers">, note: string) => void;
  onToggleVisible: (id: Id<"swimmers">, visible: boolean) => void;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const hasStatus = row.status !== null;

  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.name}</div>
      <StatusButtons
        value={row.status}
        isFuture={isFuture}
        disabled={disabled}
        onSet={(s) => onSetStatus(row.swimmerId, s)}
      />
      <div className="flex items-center gap-2 sm:w-64">
        <input
          type="text"
          value={note}
          placeholder="Note (optional)"
          disabled={disabled || !hasStatus}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((row.note ?? "") !== note) onCommitNote(row.swimmerId, note);
          }}
          className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:border-brand-300 focus:shadow-focus-ring disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <label
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-2xs",
            hasStatus && note.trim() ? "text-ink-muted" : "text-ink-faint",
          )}
          title="Let the swimmer/parent see this note"
        >
          <input
            type="checkbox"
            checked={row.noteVisibleToViewer}
            disabled={disabled || !hasStatus}
            onChange={(e) => onToggleVisible(row.swimmerId, e.target.checked)}
            className="size-3.5 accent-brand-500 disabled:cursor-not-allowed"
          />
          Show swimmer
        </label>
      </div>
    </div>
  );
}

export function SessionRosterTable({
  roster,
  isFuture,
  disabled = false,
  onSetStatus,
  onCommitNote,
  onToggleVisible,
}: {
  roster: RosterRow[];
  isFuture: boolean;
  disabled?: boolean;
  onSetStatus: (id: Id<"swimmers">, status: AttendanceStatus) => void;
  onCommitNote: (id: Id<"swimmers">, note: string) => void;
  onToggleVisible: (id: Id<"swimmers">, visible: boolean) => void;
}) {
  if (roster.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-ink-muted shadow-theme-sm">
        No active swimmers on this session&rsquo;s squads.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      {roster.map((row) => (
        <Row
          key={row.swimmerId}
          row={row}
          isFuture={isFuture}
          disabled={disabled}
          onSetStatus={onSetStatus}
          onCommitNote={onCommitNote}
          onToggleVisible={onToggleVisible}
        />
      ))}
    </div>
  );
}
