"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { errorMessage, notify } from "@/lib/notify";
import type { EditableTrainingNote } from "./trainingNote";

type Scope = "SWIMMER" | "SQUAD";
type SquadOption = { _id: Id<"squads">; name: string };

/*
  Add / edit a training note (§R16). A slide-over the coach reaches from the
  swimmer profile and from squad management. It carries a scope toggle — This
  swimmer / A squad — so one composer serves both entry points; when opened from
  a squad it's locked to that squad, and when editing an existing note the scope
  is fixed (a note never moves between a swimmer and a squad). The note date
  defaults to today and anchors the phase on the timeline + the chart overlay.

  Keyed by the parent per target so all state seeds cleanly from props on open.
*/
export function TrainingNoteComposer({
  open,
  onOpenChange,
  today,
  swimmer,
  squads,
  fixedSquad,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Enables the "This swimmer" scope (the swimmer-profile entry point). */
  swimmer?: { _id: Id<"swimmers">; name: string };
  /** Squads the coach may target (the "A squad" picker). */
  squads?: SquadOption[];
  /** Lock to one squad (the squad-management entry point). */
  fixedSquad?: SquadOption;
  /** Present => edit mode; scope is fixed to the note's own scope. */
  note?: EditableTrainingNote | null;
}) {
  const createNote = useMutation(api.trainingNotes.createTrainingNote);
  const updateNote = useMutation(api.trainingNotes.updateTrainingNote);
  const isEdit = note != null;

  // Initial scope: an edit keeps the note's scope; a squad-locked composer is
  // SQUAD; otherwise default to the swimmer when one is available.
  const initialScope: Scope = isEdit
    ? note.scope
    : fixedSquad
      ? "SQUAD"
      : swimmer
        ? "SWIMMER"
        : "SQUAD";
  const scopeLocked = isEdit || fixedSquad != null || swimmer == null;

  const [scope, setScope] = useState<Scope>(initialScope);
  const [squadId, setSquadId] = useState<Id<"squads"> | "">(
    isEdit
      ? (note.squadId ?? "")
      : fixedSquad
        ? fixedSquad._id
        : "",
  );
  const [focus, setFocus] = useState(note?.focus ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [noteDate, setNoteDate] = useState(note?.noteDate ?? today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const targetSquad =
    fixedSquad ?? (squads ?? []).find((s) => s._id === squadId) ?? null;

  const scopeValid = scope === "SWIMMER" ? swimmer != null : squadId !== "";
  const canSave = body.trim() !== "" && scopeValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(undefined);
    const payload = {
      focus: focus.trim() === "" ? undefined : focus.trim(),
      body: body.trim(),
      noteDate,
    };
    try {
      if (isEdit) {
        await updateNote({ noteId: note._id, ...payload });
        notify.success("Note updated");
      } else if (scope === "SWIMMER") {
        await createNote({ scope: "SWIMMER", swimmerId: swimmer!._id, ...payload });
        notify.success("Training note added");
      } else {
        await createNote({
          scope: "SQUAD",
          squadId: squadId as Id<"squads">,
          ...payload,
        });
        notify.success("Training note added");
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const scopeSummary =
    scope === "SWIMMER"
      ? swimmer
        ? `Visible on ${swimmer.name}'s timeline and to their viewers.`
        : "Visible on the swimmer's timeline and to their viewers."
      : targetSquad
        ? `Shown to every swimmer in ${targetSquad.name} and their viewers.`
        : "Shown to every swimmer in the squad and their viewers.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit training note" : "Add training note"}</SheetTitle>
          <SheetDescription>
            A dated note about training focus. It joins the running log — past
            notes stay so the phase lines up against how times change.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-2">
            {/* Scope — hidden entirely when there's no choice to make (a squad-
                locked composer, a swimmer-only composer, or an edit). */}
            {!scopeLocked && swimmer && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-700">Scope</span>
                <Segmented
                  ariaLabel="Note scope"
                  value={scope}
                  onChange={(s) => setScope(s)}
                  options={[
                    { value: "SWIMMER", label: "This swimmer" },
                    { value: "SQUAD", label: "A squad" },
                  ]}
                />
                {scope === "SQUAD" && (
                  <Select
                    aria-label="Squad"
                    placeholder={
                      (squads ?? []).length === 0
                        ? "No squads yet"
                        : "Select a squad…"
                    }
                    value={squadId}
                    onValueChange={(v) => setSquadId(v as Id<"squads">)}
                    disabled={(squads ?? []).length === 0}
                    options={(squads ?? []).map((s) => ({
                      value: s._id,
                      label: s.name,
                    }))}
                  />
                )}
              </div>
            )}

            {/* Where this note lands — a plain, always-visible read of who sees it. */}
            <p className="-mt-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted">
              {scopeSummary}
            </p>

            <Input
              label="Focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Streamlining & underwater"
              hint="Optional short title for the phase."
              maxLength={80}
              autoFocus
            />

            <Textarea
              label="Note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What the training is focused on, and why."
              className="min-h-32"
              required
            />

            <DateField
              label="Applies from"
              value={noteDate}
              onChange={setNoteDate}
              hint="The date this phase starts — anchors the timeline and the chart marker."
            />
          </div>

          {error && (
            <p className="px-4 py-2 text-xs text-danger-ink" role="alert">
              {error}
            </p>
          )}

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
              {isEdit ? "Save changes" : "Add note"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
