"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { formatTime, parseTime } from "@/lib/swim";

/*
  One editable cut in the standards grid (Step 9, §5.8). Resting, it's a quiet
  right-aligned tabular time you can click to edit. Editing, it's a small text
  input parsed by the domain `parseTime` on commit (Enter / blur); Escape
  cancels, and a trash affordance deletes the cut. A monotonicity inversion
  shows a warning glyph — a signal, never a block (§11a). The parent owns the
  DB write and the confirm-on-inversion flow; this is a controlled view over
  one `timeMs`.
*/

export function EditableTimeCell({
  timeMs,
  inverted,
  invTitle,
  onCommit,
  onDelete,
}: {
  timeMs: number;
  inverted: boolean;
  invTitle?: string;
  onCommit: (ms: number) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function begin() {
    setDraft(formatTime(timeMs));
    setError(null);
    setEditing(true);
  }

  function commit() {
    let ms: number;
    try {
      ms = parseTime(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid time.");
      return; // stay in edit mode so the coach can fix it
    }
    setEditing(false);
    setError(null);
    if (ms !== timeMs) onCommit(ms);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        title={inverted ? invTitle : "Edit cut"}
        className="group/cell flex w-full items-center justify-end gap-1.5 rounded-md px-2 py-1 text-right outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inverted && (
          <AlertTriangle
            aria-hidden
            className="size-3.5 shrink-0 text-warning-500"
            strokeWidth={2}
          />
        )}
        <span className="time text-sm tabular-nums text-ink group-hover/cell:text-brand-600">
          {formatTime(timeMs)}
        </span>
        {inverted && <span className="sr-only">{invTitle}</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
            setError(null);
          }
        }}
        onBlur={commit}
        inputMode="numeric"
        autoComplete="off"
        aria-label="Cut time"
        aria-invalid={error ? true : undefined}
        title={error ?? undefined}
        className={
          "time w-[5.5rem] rounded-md border px-2 py-1 text-right text-sm tabular-nums text-ink outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:shadow-focus-ring " +
          (error
            ? "border-error-500 bg-error-50"
            : "border-brand-300 bg-white focus:border-brand-300")
        }
      />
      <button
        type="button"
        aria-label="Delete cut"
        title="Delete cut"
        // Fire before the input's blur-commit so deleting never trips a parse.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setEditing(false);
          setError(null);
          onDelete();
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-danger-subtle hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
