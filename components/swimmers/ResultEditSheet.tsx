"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  STROKE_LABEL,
  STROKE_ORDER,
  DISTANCE_ORDER,
  type Course,
  type Stroke,
  type SwimType,
} from "@/lib/swim";
import { parseDigits, TimeField } from "@/components/log/TimeField";
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

  // Whitelist-derived options (same rules as the /log screen).
  const distances = useMemo(() => {
    if (!events) return DISTANCE_ORDER.filter((d) => d === distance);
    const present = new Set(events.map((e) => e.distance));
    return DISTANCE_ORDER.filter((d) => present.has(d));
  }, [events, distance]);

  const strokes = useMemo(() => {
    if (!events || distance === null) return stroke ? [stroke] : [];
    const present = new Set(
      events.filter((e) => e.distance === distance).map((e) => e.stroke),
    );
    return STROKE_ORDER.filter((s) => present.has(s));
  }, [events, distance, stroke]);

  const courses = useMemo<Course[]>(() => {
    if (!events || distance === null || stroke === null) return course ? [course] : [];
    const ev = events.find((e) => e.distance === distance && e.stroke === stroke);
    return (ev?.allowedCourses ?? []) as Course[];
  }, [events, distance, stroke, course]);

  function selectDistance(d: number) {
    setDistance(d);
    const stillValid = events?.some((e) => e.distance === d && e.stroke === stroke);
    if (!stillValid) {
      setStroke(null);
      setCourse(null);
    }
  }

  function selectStroke(s: Stroke) {
    setStroke(s);
    const allowed = (
      events?.find((e) => e.distance === distance && e.stroke === s)?.allowedCourses ?? []
    ) as Course[];
    if (allowed.length === 1) setCourse(allowed[0]);
    else if (course === null || !allowed.includes(course)) setCourse(null);
  }

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(swimDate) && swimDate <= today;
  const parsed = parseDigits(digits);
  const ageAtSwim =
    dateValid && computeAge(swimmerDob, swimDate) >= 0
      ? computeAge(swimmerDob, swimDate)
      : null;
  const canSave =
    distance !== null &&
    stroke !== null &&
    course !== null &&
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
            <SelectField
              label="Distance"
              value={distance === null ? "" : String(distance)}
              onChange={(v) => selectDistance(Number(v))}
              options={distances.map((d) => ({ value: String(d), label: `${d} m` }))}
              placeholder="Select distance"
            />
            <SelectField
              label="Stroke"
              value={stroke ?? ""}
              onChange={(v) => selectStroke(v as Stroke)}
              options={strokes.map((s) => ({ value: s, label: STROKE_LABEL[s] }))}
              placeholder="Select stroke"
              disabled={distance === null}
            />
            {courses.length === 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Course</span>
                <p className="text-sm text-ink-muted">
                  This event runs{" "}
                  <span className="font-medium text-ink">
                    {courses[0] === "SCM" ? "short course (25m)" : "long course (50m)"}
                  </span>{" "}
                  only.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Course</span>
                <Segmented
                  ariaLabel="Course"
                  value={course ?? ("" as Course)}
                  onChange={(v) => setCourse(v)}
                  options={(courses.length ? courses : (["LCM", "SCM"] as Course[])).map(
                    (c) => ({ value: c, label: c === "SCM" ? "SCM · 25m" : "LCM · 50m" }),
                  )}
                />
              </div>
            )}

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

            <Input
              label="Date"
              type="date"
              value={swimDate}
              max={today}
              onChange={(e) => setSwimDate(e.target.value)}
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

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="relative">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-9 text-base text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </div>
    </div>
  );
}
