"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  clubId?: Id<"clubs">;
  clubName?: string | null;
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
  const reassignSwimmerClub = useMutation(api.swimmers.reassignSwimmerClub);
  const isEdit = swimmer !== null;

  // A coach creates into their own club automatically; a super-user has no club,
  // so when they ADD a swimmer they must choose which club owns it (Phase 5). On
  // EDIT, only a super-user may move a swimmer to another club (P2 reassign).
  const profile = useCurrentProfile();
  const isSuper = profile?.role === "SUPER_USER";
  const needsClub = !isEdit && isSuper; // must choose on create
  const canReassign = isEdit && isSuper; // may move on edit
  const showClub = needsClub || canReassign;
  const clubs = useQuery(api.clubs.listClubs, showClub ? {} : "skip");

  const [name, setName] = useState(swimmer?.name ?? "");
  const [dob, setDob] = useState(swimmer?.dob ?? "");
  const [gender, setGender] = useState<"M" | "F">(swimmer?.gender ?? "F");
  const [notes, setNotes] = useState(swimmer?.notes ?? "");
  const [clubId, setClubId] = useState<string>(swimmer?.clubId ?? "");
  const [viewerEmails, setViewerEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Duplicate-swimmer guard (P2): the server throws when a same-name, same-DOB
  // swimmer exists; we surface a confirm and re-submit with allowDuplicate.
  const [dupPrompt, setDupPrompt] = useState<string | null>(null);

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

  const payload = () => ({
    name: name.trim(),
    dob,
    gender,
    notes: notes.trim() === "" ? undefined : notes.trim(),
  });

  // Create the swimmer. `allowDuplicate` is set only after the coach confirms the
  // duplicate warning, so the second attempt goes through.
  async function doAdd(allowDuplicate: boolean) {
    const emails = viewerEmails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
    await addSwimmer({
      ...payload(),
      ...(needsClub ? { clubId: clubId as Id<"clubs"> } : {}),
      ...(emails.length > 0 ? { viewerEmails: emails } : {}),
      ...(allowDuplicate ? { allowDuplicate: true } : {}),
    });
    notify.success("Swimmer added");
    onOpenChange(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      if (isEdit) {
        await updateSwimmer({ swimmerId: swimmer._id, ...payload() });
        // Super-user: apply a club move if they changed it.
        if (canReassign && clubId !== "" && clubId !== (swimmer.clubId ?? "")) {
          await reassignSwimmerClub({
            swimmerId: swimmer._id,
            clubId: clubId as Id<"clubs">,
          });
        }
        notify.success("Swimmer updated");
        onOpenChange(false);
      } else {
        await doAdd(false);
      }
    } catch (err) {
      const message = errorMessage(err);
      // The duplicate guard is a warning, not a hard error: prompt to confirm.
      if (!isEdit && /with that date of birth already exists/i.test(message)) {
        setDupPrompt(message);
      } else {
        // Inline error next to the field; the form stays open to fix and retry.
        setServerError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
            <DateField
              label="Date of birth"
              value={dob}
              max={today}
              onChange={setDob}
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
            {showClub && (
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
                  {canReassign
                    ? "Move this swimmer to another club. Only you (admin) can change this — it sets who may edit their record."
                    : "Which club owns this swimmer. Its coach can then edit their record."}
                </span>
              </div>
            )}
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional. Anything worth remembering."
            />
            {!isEdit && (
              <Input
                label="Viewer access (optional)"
                value={viewerEmails}
                onChange={(e) => setViewerEmails(e.target.value)}
                placeholder="parent@example.com, swimmer@example.com"
                hint="Read-only access for a swimmer/parent, comma-separated. We email each a link; access binds when they sign up."
              />
            )}
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

    <ConfirmDialog
      open={dupPrompt !== null}
      onOpenChange={(o) => {
        if (!o) setDupPrompt(null);
      }}
      title="Possible duplicate swimmer"
      description={dupPrompt ?? ""}
      confirmLabel="Add anyway"
      confirmVariant="primary"
      onConfirm={async () => {
        try {
          await doAdd(true);
        } catch (err) {
          setServerError(errorMessage(err));
        } finally {
          setDupPrompt(null);
        }
      }}
    />
    </>
  );
}
