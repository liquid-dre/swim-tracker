"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { Segmented } from "@/components/ui/Segmented";
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
import {
  computeAge,
  formatTime,
  type Course,
  type Stroke,
  type SwimType,
} from "@/lib/swim";
import { parseDigits, TimeField } from "@/components/log/TimeField";
import { EventSelectors, isValidEventTriple } from "@/components/log/EventSelectors";
import type { HistoryResult } from "./HistoryTable";

/*
  Edit an existing result (Step 6). A right-side slide-over mirroring SwimmerForm.
  The event (distance → stroke → course) is constrained to the active whitelist so
  an edit can never land off it (100 IM stays SCM-only, etc.); the server
  re-validates regardless. The parent keys this per target so state seeds cleanly.
*/
export function ResultEditSheet({
  open,
  onOpenChange,
  result,
  swimmerDob,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: HistoryResult | null;
  swimmerDob: string;
  today: string;
}) {
  const events = useQuery(api.events.listActiveEvents, open ? {} : "skip");
  const updateResult = useMutation(api.results.updateResult);

  const [distance, setDistance] = useState<number | null>(result?.distance ?? null);
  const [stroke, setStroke] = useState<Stroke | null>((result?.stroke as Stroke) ?? null);
  const [course, setCourse] = useState<Course | null>(result?.course ?? null);
  const [swimType, setSwimType] = useState<SwimType>(result?.swimType ?? "MEET");
  const [swimDate, setSwimDate] = useState(result?.swimDate ?? today);
  const [meetName, setMeetName] = useState(result?.meetName ?? "");
  const [venue, setVenue] = useState(result?.venue ?? "");
  const [notes, setNotes] = useState(result?.notes ?? "");
  const [digits, setDigits] = useState(
    result ? (formatTime(result.timeMs).match(/\d/g)?.join("") ?? "").slice(-6) : "",
  );

  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(swimDate) && swimDate <= today;
  const parsed = parseDigits(digits);
  const eventValid = isValidEventTriple(events, distance, stroke, course);
  const ageAtSwim =
    dateValid && computeAge(swimmerDob, swimDate) >= 0
      ? computeAge(swimmerDob, swimDate)
      : null;
  const canSave =
    eventValid &&
    dateValid &&
    ageAtSwim !== null &&
    parsed.ms !== null &&
    !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || result === null || distance === null || stroke === null || course === null) {
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await updateResult({
        resultId: result._id,
        distance: distance as 50 | 100 | 200 | 400 | 800 | 1500,
        stroke,
        course,
        swimType,
        swimDate,
        timeInput: parsed.text!,
        meetName: meetName.trim(),
        venue: venue.trim(),
        notes: notes.trim(),
      });
      notify.success("Result updated");
      onOpenChange(false);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Edit result</SheetTitle>
          <SheetDescription>
            Only meet times count toward a personal best. Changes are re-validated
            against the event whitelist.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <EventSelectors
              events={events}
              distance={distance}
              stroke={stroke}
              course={course}
              onDistance={setDistance}
              onStroke={setStroke}
              onCourse={setCourse}
              disabled={events === undefined}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Type</span>
              <Segmented
                ariaLabel="Swim type"
                value={swimType}
                onChange={setSwimType}
                options={[
                  { value: "MEET", label: "Meet" },
                  { value: "TIME_TRIAL", label: "Trial" },
                  { value: "PRACTICE", label: "Practice" },
                ]}
              />
            </div>

            <TimeField digits={digits} onDigits={setDigits} />

            <DateField
              label="Date"
              value={swimDate}
              max={today}
              onChange={setSwimDate}
              hint={ageAtSwim !== null ? `Age ${ageAtSwim} on this date` : undefined}
              error={
                swimDate !== "" && !dateValid
                  ? "Pick a date up to today."
                  : ageAtSwim === null && dateValid
                    ? "Date is before the swimmer's date of birth."
                    : undefined
              }
            />
            <Input
              label="Meet name"
              value={meetName}
              onChange={(e) => setMeetName(e.target.value)}
              placeholder="e.g. Summer Championships"
            />
            <Input
              label="Venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Optional"
            />
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <SheetFooter className="gap-2 border-t border-border">
            {serverError && (
              <p role="alert" className="text-sm text-danger-ink">
                {serverError}
              </p>
            )}
            <div className="flex flex-row justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
                Save changes
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
