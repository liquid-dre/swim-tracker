"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, NotebookPen, Plus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatShortDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { ScopeBadge } from "./ScopeBadge";
import { TrainingNoteComposer } from "./TrainingNoteComposer";
import type { EditableTrainingNote, TrainingNote } from "./trainingNote";

/*
  Training-notes timeline (§R16) — the swimmer profile's running audit trail,
  shown to a coach and to the swimmer's viewers alike. It merges the swimmer's
  personal notes with the squad notes of every squad they belong to, newest
  first, each clearly labelled Personal or "Squad: <name>". Past phases PERSIST,
  so a reader sees what was worked on and can line it up against how the times
  moved in that period, and the latest note is the phase they're entering now.

  Writes are coach-only (server-enforced); a viewer sees the same thread, read-
  only, with no composer or per-note controls.
*/
export function TrainingNotesTimeline({
  swimmerId,
  swimmerName,
  today,
}: {
  swimmerId: Id<"swimmers">;
  swimmerName: string;
  today: string;
}) {
  const data = useQuery(api.trainingNotes.getSwimmerTrainingNotes, { swimmerId });
  const editable = data?.editable ?? false;
  // The squad picker is a coach concept; only fetch it when the caller may write.
  const squads = useQuery(api.squads.listSquads, editable ? {} : "skip");
  const deleteNote = useMutation(api.trainingNotes.deleteTrainingNote);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<EditableTrainingNote | null>(null);
  const [deleting, setDeleting] = useState<TrainingNote | null>(null);

  const squadOptions = (squads ?? []).map((s) => ({ _id: s._id, name: s.name }));

  function openNew() {
    setEditing(null);
    setComposerOpen(true);
  }

  function openEdit(note: TrainingNote) {
    setEditing({
      _id: note._id,
      scope: note.scope,
      squadId: note.squadId,
      focus: note.focus,
      body: note.body,
      noteDate: note.noteDate,
    });
    setComposerOpen(true);
  }

  const loading = data === undefined;
  const notes = data?.notes ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            Training notes
          </h2>
          <p className="text-sm text-ink-muted">
            Dated coaching notes on training focus — personal and squad-wide.
            Newest first; past phases stay as a record.
          </p>
        </div>
        {editable && !loading && notes.length > 0 && (
          <Button variant="secondary" size="sm" onClick={openNew}>
            <Plus className="size-4" /> Add note
          </Button>
        )}
      </div>

      {loading ? (
        <TimelineSkeleton />
      ) : notes.length === 0 ? (
        <EmptyState editable={editable} onAdd={openNew} />
      ) : (
        <ol className="flex flex-col">
          {notes.map((note, i) => (
            <NoteRow
              key={note._id}
              note={note}
              last={i === notes.length - 1}
              editable={editable}
              onEdit={() => openEdit(note)}
              onDelete={() => setDeleting(note)}
            />
          ))}
        </ol>
      )}

      {editable && (
        <TrainingNoteComposer
          key={editing?._id ?? (composerOpen ? "new" : "closed")}
          open={composerOpen}
          onOpenChange={(o) => {
            setComposerOpen(o);
            if (!o) setEditing(null);
          }}
          today={today}
          swimmer={{ _id: swimmerId, name: swimmerName }}
          squads={squadOptions}
          note={editing}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Delete this training note?"
        description={
          deleting ? (
            <>
              {deleting.scope === "SWIMMER"
                ? "This personal note"
                : `This squad note (${deleting.squadName})`}{" "}
              from {formatShortDate(deleting.noteDate)} will be removed from the
              log. This can&apos;t be undone.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Delete note"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteNote({ noteId: deleting._id });
          notify.success("Note deleted");
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// One timeline entry — a rail node + a note card
// ---------------------------------------------------------------------------

function NoteRow({
  note,
  last,
  editable,
  onEdit,
  onDelete,
}: {
  note: TrainingNote;
  last: boolean;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex gap-3.5">
      {/* Rail: a node aligned to the card's date, with a connector running to the
          next entry. Personal vs squad tints the node too, but the badge carries
          the actual meaning (colour is never the sole signal). */}
      <div className="relative flex w-3 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={
            "mt-1.5 size-2.5 shrink-0 rounded-full bg-white ring-2 " +
            (note.scope === "SWIMMER" ? "ring-brand-400" : "ring-gray-300")
          }
        />
        {!last && (
          <span aria-hidden className="w-px flex-1 bg-border" />
        )}
      </div>

      <div className={"min-w-0 flex-1 " + (last ? "pb-0" : "pb-5")}>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time
                  dateTime={note.noteDate}
                  className="text-sm font-medium text-ink"
                >
                  {formatShortDate(note.noteDate)}
                </time>
                <span aria-hidden className="h-3 w-px bg-border" />
                <ScopeBadge scope={note.scope} squadName={note.squadName} />
              </div>
              {note.focus && (
                <h3 className="text-base font-semibold leading-snug text-ink">
                  {note.focus}
                </h3>
              )}
            </div>

            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Note actions"
                  className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={onEdit}>Edit note</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
            {note.body}
          </p>

          <p className="mt-3 text-xs text-ink-faint">
            {note.authorName}
            {note.updatedAt !== null && " · edited"}
          </p>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Empty + loading
// ---------------------------------------------------------------------------

function EmptyState({
  editable,
  onAdd,
}: {
  editable: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-theme-xs">
      <NotebookPen aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">No training notes yet</p>
        <p className="mx-auto max-w-[44ch] text-sm text-ink-muted">
          {editable
            ? "Add a note about what this swimmer — or their squad — is working on. It starts the running log you can read against the times."
            : "When your coach records what's being worked on, the notes will appear here as a dated log."}
        </p>
      </div>
      {editable && (
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="size-4" /> Add training note
        </Button>
      )}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <ol className="flex flex-col" aria-busy>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-3.5">
          <div className="relative flex w-3 shrink-0 flex-col items-center">
            <span className="mt-1.5 size-2.5 rounded-full bg-surface-2" />
            {i < 2 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className={"flex-1 " + (i < 2 ? "pb-5" : "")}>
            <div className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white shadow-theme-xs" />
          </div>
        </li>
      ))}
    </ol>
  );
}
