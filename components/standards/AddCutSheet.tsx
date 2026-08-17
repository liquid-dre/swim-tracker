"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";

import { api } from "@/convex/_generated/api";
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
import { errorMessage, notify } from "@/lib/notify";
import {
  eventLabel,
  formatTime,
  parseTime,
  galaCoversEvent,
  type Course,
  type GalaCode,
  type Stroke,
} from "@/lib/swim";
import { GALA_MEDIUM } from "@/lib/galas";
import { GALA_COLUMNS, type AgeKind } from "./model";

// One label map, shared with every other gala surface (lib/galas.ts).
const TIER_LABEL = GALA_MEDIUM;

const KIND_OPTIONS: { value: AgeKind; label: string; hint: string }[] = [
  { value: "young", label: "Youngest", hint: "&U: applies to this age and below" },
  { value: "exact", label: "Exact", hint: "one single-year age" },
  { value: "old", label: "Oldest", hint: "+ : applies to this age and above" },
];

export type AddCutPrefill = { tier?: GalaCode; kind?: AgeKind; age?: number | null };

/*
  Add a missing cut for the event in view (Step 9, §5.8). Gender + event come
  from the screen filters; the coach picks a tier (only tiers that actually
  cover this event are selectable — coverage is a hard rule, never back-filled),
  an age (exact or a catch-all bound), and a time parsed by the domain parser.
  Opened from a blank "+" cell it arrives pre-filled with that tier + age.
*/
export function AddCutSheet({
  open,
  onOpenChange,
  gender,
  distance,
  stroke,
  course,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gender: "M" | "F";
  distance: number;
  stroke: Stroke;
  /** The course being edited — a cut belongs to one course only (§4.2). */
  course: Course;
  prefill?: AddCutPrefill;
}) {
  const createStandard = useMutation(api.standards.createStandard);
  const galas = useQuery(api.galas.listGalas, {});

  const coveringTiers = useMemo(
    () =>
      GALA_COLUMNS.filter((code) => {
        const gala = (galas ?? []).find((g) => g.code === code);
        return gala !== undefined && galaCoversEvent(gala, distance, stroke);
      }),
    [galas, distance, stroke],
  );

  const [tier, setTier] = useState<GalaCode | null>(
    prefill?.tier ?? coveringTiers[0] ?? null,
  );
  const [kind, setKind] = useState<AgeKind>(prefill?.kind ?? "exact");
  const [age, setAge] = useState<string>(
    prefill?.age !== undefined ? String(prefill.age) : "",
  );
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // An OPEN gala (SANS/SANY) has one cut for every age, so it needs NO age at
  // all — the age fields are hidden and the value sent is null.
  const selectedGala = (galas ?? []).find((g) => g.code === tier);
  const isOpenGala = selectedGala?.ageScope === "OPEN";
  const ageNum = Number(age);
  const ageValid =
    isOpenGala ||
    (age.trim() !== "" && Number.isInteger(ageNum) && ageNum > 0 && ageNum <= 100);

  const parsed = useMemo(() => {
    if (time.trim() === "") return { ms: null as number | null, error: null as string | null };
    try {
      return { ms: parseTime(time), error: null };
    } catch (err) {
      return { ms: null, error: err instanceof Error ? err.message : "Invalid time" };
    }
  }, [time]);

  const canSave = tier !== null && ageValid && parsed.ms !== null && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || tier === null || parsed.ms === null) return;
    setSaving(true);
    setFormError(null);
    try {
      if (selectedGala === undefined) {
        setFormError("That gala is not set up yet.");
        return;
      }
      await createStandard({
        galaId: selectedGala._id,
        course,
        gender,
        distance: distance as 50 | 100 | 200 | 400 | 800 | 1500,
        stroke,
        age: isOpenGala ? null : ageNum,
        isCatchAllYoung: !isOpenGala && kind === "young",
        isCatchAllOld: !isOpenGala && kind === "old",
        timeMs: parsed.ms,
      });
      notify.success("Cut added");
      onOpenChange(false);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Add a cut</SheetTitle>
          <SheetDescription>
            {gender === "F" ? "Girls" : "Boys"} · {eventLabel(distance, stroke)} ·
            long course
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-1">
            {/* Gala */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink">Gala</legend>
              <div role="radiogroup" aria-label="Gala" className="flex flex-wrap gap-2">
                {GALA_COLUMNS.map((t) => {
                  const covers = coveringTiers.includes(t);
                  const active = t === tier;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!covers}
                      onClick={() => setTier(t)}
                      title={covers ? undefined : `${TIER_LABEL[t]} has no cut for this event.`}
                      className={
                        "h-9 rounded-lg border px-3 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
                        (active
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : covers
                            ? "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800"
                            : "cursor-not-allowed border-dashed border-gray-200 bg-transparent text-ink-faint")
                      }
                    >
                      {TIER_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Age kind + value */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink">Age band</legend>
              <div role="radiogroup" aria-label="Age band" className="flex flex-wrap gap-2">
                {KIND_OPTIONS.map((opt) => {
                  const active = opt.value === kind;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setKind(opt.value)}
                      title={opt.hint}
                      className={
                        "h-9 rounded-lg border px-3 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
                        (active
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Input
              label={kind === "exact" ? "Age" : "Bound age"}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 13"
              hint={
                kind === "young"
                  ? "Applies to this age and younger (e.g. 10 → “10&U”)."
                  : kind === "old"
                    ? "Applies to this age and older (e.g. 17 → “17+”)."
                    : "The single year this cut applies to."
              }
              className="w-32"
            />

            {/* Time */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-cut-time" className="text-sm font-medium text-ink">
                Time
              </label>
              <input
                id="add-cut-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="1:07:47"
                aria-invalid={parsed.error ? true : undefined}
                aria-describedby="add-cut-time-echo"
                className={
                  "time h-9 w-40 rounded-lg border px-3 text-base tabular-nums text-ink outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:border-brand-300 focus:shadow-focus-ring " +
                  (parsed.error
                    ? "border-error-500 bg-error-50"
                    : "border-gray-300 hover:border-gray-400")
                }
              />
              <p
                id="add-cut-time-echo"
                className="flex min-h-5 items-center gap-1.5 text-xs"
                aria-live="polite"
              >
                {parsed.error ? (
                  <span className="text-danger-ink">Enter as m:ss:hh (e.g. 1:07:47).</span>
                ) : parsed.ms !== null ? (
                  <>
                    <Check aria-hidden className="size-3.5 text-brand-500" strokeWidth={2.25} />
                    <span className="text-ink-muted">
                      Saves as{" "}
                      <span className="time font-medium text-ink">{formatTime(parsed.ms)}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-ink-faint">
                    Type the digits and colons, e.g. 1:07:47 or 59:09.
                  </span>
                )}
              </p>
            </div>

            {formError && (
              <p role="alert" className="text-sm text-danger-ink">
                {formError}
              </p>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
              Add cut
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
