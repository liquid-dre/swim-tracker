"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GALA_FULL, GALA_ORDER, type GalaCode } from "@/lib/galas";
import { notify } from "@/lib/notify";
import type { MeetEvent } from "@/lib/meets";
import type { Course } from "@/lib/swim";

/*
  Add or edit one meet (super-user only; convex/meets.ts enforces that regardless
  of what this component renders).

  It edits the meet's DETAILS, never its programme — an event list comes from an
  importable document, and hand-typing 40 HY-TEK lines into a form is the manual
  work this feature exists to remove. The existing programme is carried through
  untouched on save, and the import sheet is how it changes.
*/

export type EditableMeet = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  course: Course | null;
  galaCode: GalaCode | null;
  events: MeetEvent[];
};

export function MeetForm({
  open,
  onOpenChange,
  today,
  meet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Absent = add a new meet. Present = edit that one. */
  meet?: EditableMeet;
}) {
  const createMeet = useMutation(api.meets.createMeet);
  const updateMeet = useMutation(api.meets.updateMeet);
  const editing = meet !== undefined;

  const [name, setName] = useState(meet?.name ?? "");
  const [startDate, setStartDate] = useState(meet?.startDate ?? today);
  const [endDate, setEndDate] = useState(meet?.endDate ?? "");
  const [venue, setVenue] = useState(meet?.venue ?? "");
  const [course, setCourse] = useState<string>(meet?.course ?? "");
  const [galaCode, setGalaCode] = useState<string>(meet?.galaCode ?? "");
  const [saving, setSaving] = useState(false);

  // A meet that runs one day has no end date at all — "same as the start" and
  // "not set" must not be two ways of saying the same thing (the server drops a
  // matching end date for the same reason).
  const multiDay = endDate !== "" && endDate !== startDate;
  const datesValid =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    (endDate === "" || (/^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate));
  const valid = name.trim() !== "" && datesValid;

  async function onSave() {
    if (!valid || saving) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      startDate,
      endDate: multiDay ? endDate : undefined,
      venue: venue.trim() || undefined,
      course: (course || undefined) as Course | undefined,
      galaCode: (galaCode || undefined) as GalaCode | undefined,
      events: meet?.events ?? [],
    };
    try {
      await notify.promise(
        editing
          ? updateMeet({ meetId: meet._id, ...fields })
          : createMeet(fields),
        {
          loading: editing ? "Saving meet…" : "Adding meet…",
          success: editing ? "Meet saved" : "Meet added",
        },
      );
      onOpenChange(false);
    } catch {
      // notify.promise has already surfaced the server's own message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit meet" : "Add a meet"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "The meet's details. Its event list is changed by importing a programme."
              : "Add a fixture to the season calendar. Import its programme afterwards."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
          <Input
            id="meet-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="HAS 1st Seeded Gala 2026"
            maxLength={120}
          />

          <DateField
            id="meet-start"
            label="Starts"
            value={startDate}
            onChange={setStartDate}
          />

          <DateField
            id="meet-end"
            label="Ends"
            hint="Leave blank for a one-day meet."
            value={endDate}
            onChange={setEndDate}
            min={startDate}
          />

          <Input
            id="meet-venue"
            label="Venue"
            hint="Optional."
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Les Brown Pool"
            maxLength={120}
          />

          <SelectField
            id="meet-course"
            label="Course"
            hint="Leave unset if you don't know. A guessed course would compare times against the wrong table."
          >
            <Select
              id="meet-course"
              value={course}
              onValueChange={setCourse}
              size="md"
              options={[
                { value: "", label: "Not set" },
                { value: "LCM", label: "Long course (50 m)" },
                { value: "SCM", label: "Short course (25 m)" },
              ]}
            />
          </SelectField>

          <SelectField
            id="meet-gala"
            label="Gala tour"
            hint="Marks this meet as a championship's tour. A label only — the qualifying screens still read the tour date set in Admin › Galas."
          >
            <Select
              id="meet-gala"
              value={galaCode}
              onValueChange={setGalaCode}
              size="md"
              options={[
                { value: "", label: "Not a gala tour" },
                ...GALA_ORDER.map((code) => ({
                  value: code,
                  label: GALA_FULL[code],
                })),
              ]}
            />
          </SelectField>

          {editing && meet.events.length > 0 && (
            <p className="text-xs text-ink-muted">
              This meet&rsquo;s {meet.events.length}-event programme is kept as it
              is. Import a programme to replace it.
            </p>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!valid} onClick={onSave}>
            {editing ? "Save meet" : "Add meet"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** A label + hint wrapper for `Select`, which (unlike Input/DateField) has none. */
function SelectField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
