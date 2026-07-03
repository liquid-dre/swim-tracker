"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
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
import { computeAge } from "@/lib/swim";

export type EditableSwimmer = {
  _id: Id<"swimmers">;
  name: string;
  dob: string;
  gender: "M" | "F";
  notes?: string;
};

/*
  Add / edit swimmer form (Step 4). A right-side slide-over rather than a modal
  (product register: exhaust non-modal patterns first). The parent gives this a
  `key` per target so state initialises from props on open — no reset effect.
*/
export function SwimmerForm({
  open,
  onOpenChange,
  swimmer,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swimmer: EditableSwimmer | null; // null => add mode
  today: string; // ISO date, captured once by the parent
}) {
  const addSwimmer = useMutation(api.swimmers.addSwimmer);
  const updateSwimmer = useMutation(api.swimmers.updateSwimmer);
  const isEdit = swimmer !== null;

  // A coach creates into their own club automatically; a super-user has no club,
  // so when they ADD a swimmer they must choose which club owns it (Phase 5).
  const profile = useCurrentProfile();
  const needsClub = !isEdit && profile?.role === "SUPER_USER";
  const clubs = useQuery(api.clubs.listClubs, needsClub ? {} : "skip");

  const [name, setName] = useState(swimmer?.name ?? "");
  const [dob, setDob] = useState(swimmer?.dob ?? "");
  const [gender, setGender] = useState<"M" | "F">(swimmer?.gender ?? "F");
  const [notes, setNotes] = useState(swimmer?.notes ?? "");
  const [clubId, setClubId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(dob);
  const age = dobValid ? computeAge(dob, today) : null;
  const canSave =
    name.trim() !== "" &&
    dobValid &&
    age !== null &&
    age >= 0 &&
    (!needsClub || clubId !== "");

  // Map a server validation message to the field it's about, so the error
  // shows next to the input rather than only as a toast.
  const nameError = serverError && /name/i.test(serverError) ? serverError : undefined;
  const dobError =
    serverError && /(date|birth)/i.test(serverError) ? serverError : undefined;
  const otherError = serverError && !nameError && !dobError ? serverError : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    const payload = {
      name: name.trim(),
      dob,
      gender,
      notes: notes.trim() === "" ? undefined : notes.trim(),
    };
    setSaving(true);
    setServerError(null);
    try {
      if (isEdit) {
        await updateSwimmer({ swimmerId: swimmer._id, ...payload });
        notify.success("Swimmer updated");
      } else {
        await addSwimmer(
          needsClub ? { ...payload, clubId: clubId as Id<"clubs"> } : payload,
        );
        notify.success("Swimmer added");
      }
      onOpenChange(false);
    } catch (err) {
      // Inline error next to the field; the form stays open to fix and retry.
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit swimmer" : "Add swimmer"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this swimmer's details."
              : "Personal bests and squads are added after the swimmer exists."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ntando Mbeki"
              error={nameError}
              autoFocus
              required
            />
            <Input
              label="Date of birth"
              type="date"
              value={dob}
              max={today}
              onChange={(e) => setDob(e.target.value)}
              error={dobError}
              hint={
                age !== null && age >= 0
                  ? `Age ${age} today`
                  : "Used to match age-exact qualifying cuts."
              }
              required
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Gender</span>
              <Segmented
                ariaLabel="Gender"
                value={gender}
                onChange={setGender}
                options={[
                  { value: "F", label: "Female" },
                  { value: "M", label: "Male" },
                ]}
              />
            </div>
            {needsClub && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Club</span>
                <Select
                  aria-label="Club"
                  placeholder={
                    clubs === undefined
                      ? "Loading clubs…"
                      : clubs.length === 0
                        ? "Create a club first (Admin)"
                        : "Choose a club"
                  }
                  value={clubId}
                  onValueChange={setClubId}
                  disabled={clubs === undefined || clubs.length === 0}
                  options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
                />
                <span className="text-xs text-ink-muted">
                  Which club owns this swimmer. Its coach can then edit their record.
                </span>
              </div>
            )}
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional. Anything worth remembering."
            />
          </div>

          <SheetFooter className="gap-2 border-t border-border">
            {otherError && (
              <p role="alert" className="text-sm text-danger-ink">
                {otherError}
              </p>
            )}
            <div className="flex flex-row justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
                {isEdit ? "Save changes" : "Add swimmer"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
