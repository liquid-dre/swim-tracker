"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { SchoolGalaBadge } from "@/components/ui/SchoolGalaBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { errorMessage, notify } from "@/lib/notify";
import { computeAge, formatTime, type Course, type Stroke } from "@/lib/swim";
import { parseDigits, TimeField } from "@/components/log/TimeField";
import { EventSelectors, isValidEventTriple } from "@/components/log/EventSelectors";
import type { HistoryResult } from "@/components/swimmers/HistoryTable";

/*
  School-gala entry (BRD §R15) — the ONE write a viewer (parent) gets. A focused
  slide-over scoped to a single swimmer they are already linked to: pick the
  event off the whitelist, the date, the gala name, and the time (right-to-left
  digit entry). The swim type is FIXED to SCHOOL_GALA — a parent can never log a
  meet, trial or practice — and the server re-enforces that regardless. Doubles
  as the edit form for a gala row the parent already entered.

  It says plainly what a school gala is (and is not) so nobody mistakes it for an
  official time: it tracks progress, it never sets a personal best or a cut.
*/

const LIMIT_COPY =
  "School gala times track your swimmer's progress but don't count toward personal bests or qualifying — those come from official meets.";

export function SchoolGalaSheet({
  open,
  onOpenChange,
  swimmerId,
  swimmerName,
  swimmerDob,
  today,
  result = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swimmerId: Id<"swimmers">;
  swimmerName: string;
  swimmerDob: string;
  today: string;
  // When set, the sheet edits this existing (school-gala) row instead of creating.
  result?: HistoryResult | null;
}) {
  const events = useQuery(api.events.listActiveEvents, open ? {} : "skip");
  const logResult = useMutation(api.results.logResult);
  const updateResult = useMutation(api.results.updateResult);

  const editing = result !== null;

  const [distance, setDistance] = useState<number | null>(result?.distance ?? null);
  const [stroke, setStroke] = useState<Stroke | null>(
    (result?.stroke as Stroke) ?? null,
  );
  const [course, setCourse] = useState<Course | null>(result?.course ?? null);
  const [swimDate, setSwimDate] = useState(result?.swimDate ?? today);
  const [galaName, setGalaName] = useState(result?.meetName ?? "");
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
    eventValid && dateValid && ageAtSwim !== null && parsed.ms !== null && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || distance === null || stroke === null || course === null) return;

    setSaving(true);
    setServerError(null);
    const galaTrimmed = galaName.trim();
    try {
      if (editing && result) {
        await updateResult({
          resultId: result._id,
          distance: distance as 25 | 50 | 100 | 200 | 400 | 800 | 1500,
          stroke,
          course,
          swimType: "SCHOOL_GALA",
          swimDate,
          timeInput: parsed.text!,
          meetName: galaTrimmed,
        });
        notify.success("School gala time updated");
      } else {
        await logResult({
          swimmerId,
          distance: distance as 25 | 50 | 100 | 200 | 400 | 800 | 1500,
          stroke,
          course,
          swimType: "SCHOOL_GALA",
          swimDate,
          timeInput: parsed.text!,
          meetName: galaTrimmed === "" ? undefined : galaTrimmed,
        });
        notify.success("School gala time added");
      }
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
          <SheetTitle>
            {editing ? "Edit school gala time" : "Log a school gala time"}
          </SheetTitle>
          <SheetDescription>
            For {swimmerName}. School gala times are unofficial.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            {/* The rule, stated up front so it's read before the first field. */}
            <p className="flex gap-2 rounded-xl border border-warning-subtle bg-warning-subtle/60 px-3 py-2.5 text-xs leading-relaxed text-warning-ink">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              <span>{LIMIT_COPY}</span>
            </p>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">Type</span>
              {/* Fixed — a parent can only ever log a school gala time. */}
              <SchoolGalaBadge />
            </div>

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
              label="Gala name"
              value={galaName}
              onChange={(e) => setGalaName(e.target.value)}
              placeholder="e.g. Inter-house Gala"
              hint="Optional — the school or gala this was swum at."
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
                {editing ? "Save changes" : "Add gala time"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
