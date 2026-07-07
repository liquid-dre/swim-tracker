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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatShortDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { TrainingNoteComposer } from "./TrainingNoteComposer";
import type { EditableTrainingNote, TrainingNote } from "./trainingNote";

/*
  Squad training notes (§R16), reached from squad management. The squad's own
  running log of training focus — every note here is squad-wide, so it shows on
  the timeline of every member and to their viewers. Coach-only (the whole
  squads screen is). Add / edit / delete a note without leaving the squad.
*/
export function SquadTrainingNotesSheet({
  open,
  onOpenChange,
  squad,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squad: { _id: Id<"squads">; name: string } | null;
  today: string;
}) {
  const notes = useQuery(
    api.trainingNotes.getSquadTrainingNotes,
    squad ? { squadId: squad._id } : "skip",
  );
  const deleteNote = useMutation(api.trainingNotes.deleteTrainingNote);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<EditableTrainingNote | null>(null);
  const [deleting, setDeleting] = useState<TrainingNote | null>(null);

  const loading = notes === undefined;

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Training notes</SheetTitle>
          <SheetDescription>
            {squad ? `${squad.name}. ` : ""}Squad-wide notes on training focus —
            each shows on every member&apos;s timeline and to their viewers.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-2">
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => {
              setEditing(null);
              setComposerOpen(true);
            }}
          >
            <Plus className="size-4" /> Add note
          </Button>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <ul className="flex flex-col gap-3" aria-busy>
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white shadow-theme-xs"
                  />
                ))}
              </ul>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                <NotebookPen
                  aria-hidden
                  className="size-6 text-ink-faint"
                  strokeWidth={1.75}
                />
                <p className="text-sm font-medium text-ink">No squad notes yet</p>
                <p className="mx-auto max-w-[36ch] text-sm text-ink-muted">
                  Record what the squad is working on. It appears on every
                  member&apos;s timeline as a dated log.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {notes.map((note) => (
                  <li
                    key={note._id}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <time
                          dateTime={note.noteDate}
                          className="text-sm font-medium text-ink"
                        >
                          {formatShortDate(note.noteDate)}
                        </time>
                        {note.focus && (
                          <h3 className="text-base font-semibold leading-snug text-ink">
                            {note.focus}
                          </h3>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="Note actions"
                          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEdit(note)}>
                            Edit note
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(note)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                      {note.body}
                    </p>
                    <p className="mt-3 text-xs text-ink-faint">
                      {note.authorName}
                      {note.updatedAt !== null && " · edited"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>

      {squad && (
        <TrainingNoteComposer
          key={editing?._id ?? (composerOpen ? "new" : "closed")}
          open={composerOpen}
          onOpenChange={(o) => {
            setComposerOpen(o);
            if (!o) setEditing(null);
          }}
          today={today}
          fixedSquad={squad}
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
              This squad note from {formatShortDate(deleting.noteDate)} will be
              removed from the log. This can&apos;t be undone.
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
    </Sheet>
  );
}
