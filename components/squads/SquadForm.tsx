"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage, notify } from "@/lib/notify";

export type EditableSquad = {
  _id: Id<"squads">;
  name: string;
  description?: string;
};

// Create / edit squad slide-over (Step 4). Keyed by the parent per target so
// state initialises from props on open.
export function SquadForm({
  open,
  onOpenChange,
  squad,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squad: EditableSquad | null; // null => create mode
}) {
  const createSquad = useMutation(api.squads.createSquad);
  const updateSquad = useMutation(api.squads.updateSquad);
  const isEdit = squad !== null;

  const [name, setName] = useState(squad?.name ?? "");
  const [description, setDescription] = useState(squad?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const canSave = name.trim() !== "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    const payload = {
      name: name.trim(),
      description: description.trim() === "" ? undefined : description.trim(),
    };
    setSaving(true);
    setNameError(undefined);
    try {
      if (isEdit) {
        await updateSquad({ squadId: squad._id, ...payload });
        notify.success("Squad updated");
      } else {
        await createSquad(payload);
        notify.success("Squad created");
      }
      onOpenChange(false);
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit squad" : "New squad"}</SheetTitle>
          <SheetDescription>
            A squad groups swimmers so you can compare and track them together.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <Input
              label="Squad name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Performance"
              error={nameError}
              autoFocus
              required
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional. Who this squad is for."
            />
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
              {isEdit ? "Save changes" : "Create squad"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
