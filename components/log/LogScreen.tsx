"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Timer, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { errorMessage, notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import { computeAge, STROKE_LABEL, type Course, type Stroke } from "@/lib/swim";
import { parseDigits, TimeField } from "./TimeField";
import { EventSelectors, isValidEventTriple } from "./EventSelectors";

type SwimType = "MEET" | "TIME_TRIAL" | "PRACTICE";

// Last-used meet/date/type persist across visits (BRD Step 5) — poolside you log
// many swims from the same meet on the same day.
const DEFAULTS_KEY = "swimtracker.log.defaults";
type Defaults = { meetName: string; swimDate: string; swimType: SwimType };

type SavedEntry = {
  id: Id<"results">;
  swimmer: string;
  event: string;
  course: Course;
  swimType: SwimType;
  time: string;
};

export function LogScreen({ today }: { today: string }) {
  const swimmers = useQuery(api.swimmers.listSwimmers, { activeOnly: true });
  const events = useQuery(api.events.listActiveEvents, {});
  const logResult = useMutation(api.results.logResult);
  const deleteResult = useMutation(api.results.deleteResult);

  // --- form state -----------------------------------------------------------
  const [swimmerId, setSwimmerId] = useState<Id<"swimmers"> | "">("");
  const [distance, setDistance] = useState<number | null>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [swimType, setSwimType] = useState<SwimType>("MEET");
  const [swimDate, setSwimDate] = useState(today);
  const [meetName, setMeetName] = useState("");
  const [notes, setNotes] = useState("");
  const [digits, setDigits] = useState("");

  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedEntry[]>([]);

  const timeRef = useRef<HTMLInputElement>(null);

  // Restore remembered defaults once on mount. This is a deliberate one-time
  // sync from an external store (localStorage): the server and first client
  // render both use the plain defaults, then we patch — which is exactly what
  // keeps the controlled inputs free of an SSR hydration mismatch.
  useEffect(() => {
    let d: Partial<Defaults> | null = null;
    try {
      const raw = localStorage.getItem(DEFAULTS_KEY);
      d = raw ? (JSON.parse(raw) as Partial<Defaults>) : null;
    } catch {
      d = null; // ignore malformed storage
    }
    if (!d) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (d.meetName) setMeetName(d.meetName);
    if (d.swimType) setSwimType(d.swimType);
    if (d.swimDate && /^\d{4}-\d{2}-\d{2}$/.test(d.swimDate)) setSwimDate(d.swimDate);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // --- validity -------------------------------------------------------------
  const selectedSwimmer = swimmers?.find((s) => s._id === swimmerId) ?? null;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(swimDate) && swimDate <= today;
  const parsedTime = parseDigits(digits);
  // The event trio is only valid as a whole whitelist event — a stale (now
  // invalid) selection left after changing one control can never be saved.
  const eventValid = isValidEventTriple(events, distance, stroke, course);
  const canSave =
    swimmerId !== "" &&
    eventValid &&
    dateValid &&
    parsedTime.ms !== null &&
    !saving;

  const ageAtSwim =
    selectedSwimmer && dateValid ? computeAge(selectedSwimmer.dob, swimDate) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || distance === null || stroke === null || course === null) return;

    setSaving(true);
    setServerError(null);
    try {
      const id = await logResult({
        swimmerId,
        distance: distance as 50 | 100 | 200 | 400 | 800 | 1500,
        stroke,
        course,
        swimType,
        swimDate,
        timeInput: parsedTime.text!, // canonical m:ss:hh from the anchor
        meetName: meetName.trim() === "" ? undefined : meetName.trim(),
        notes: notes.trim() === "" ? undefined : notes.trim(),
      });

      // Remember meet/date/type for the next entry.
      try {
        localStorage.setItem(
          DEFAULTS_KEY,
          JSON.stringify({ meetName, swimDate, swimType } satisfies Defaults),
        );
      } catch {
        /* ignore */
      }

      setRecent((prev) =>
        [
          {
            id,
            swimmer: selectedSwimmer?.name ?? "Swimmer",
            event: `${distance} ${STROKE_LABEL[stroke]}`,
            course,
            swimType,
            time: parsedTime.text!,
          },
          ...prev,
        ].slice(0, 6),
      );

      notify.success("Time saved");
      // Stay on the form for the next swim: keep swimmer/event/meet, clear the
      // time (and notes) and re-focus the anchor.
      setDigits("");
      setNotes("");
      timeRef.current?.focus();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteRecent(entry: SavedEntry) {
    try {
      await deleteResult({ resultId: entry.id });
      setRecent((prev) => prev.filter((r) => r.id !== entry.id));
      notify.success("Entry removed");
    } catch (err) {
      notify.error(err);
    }
  }

  const loading = swimmers === undefined || events === undefined;
  const noSwimmers = swimmers !== undefined && swimmers.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Log a time"
        breadcrumb={trailForHref("/log")}
        description="Pick the swimmer and event, then enter the time. The form stays put so you can log the next swim straight away."
      />

      {noSwimmers ? (
        <EmptyRoster />
      ) : (
        <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-col gap-6">
            {/* 1 — swimmer */}
            <Field label="Swimmer" htmlFor="swimmer">
              <div className="flex flex-col gap-1.5">
                <Select
                  id="swimmer"
                  size="md"
                  placeholder={loading ? "Loading swimmers…" : "Select a swimmer"}
                  value={swimmerId}
                  onValueChange={(v) => setSwimmerId(v as Id<"swimmers">)}
                  disabled={loading}
                  options={
                    swimmers?.map((s) => ({
                      value: s._id,
                      label: `${s.name} · ${s.age}`,
                    })) ?? []
                  }
                />
                {selectedSwimmer && (
                  <p className="text-xs text-ink-muted">
                    {ageAtSwim !== null
                      ? `Age ${ageAtSwim} on the swim date`
                      : `Age ${selectedSwimmer.age} today`}
                  </p>
                )}
              </div>
            </Field>

            {/* 2 — event: distance, stroke, course all visible at once, each
                driven live off the whitelist (invalid options disabled). */}
            <EventSelectors
              events={events}
              distance={distance}
              stroke={stroke}
              course={course}
              onDistance={setDistance}
              onStroke={setStroke}
              onCourse={setCourse}
              disabled={loading}
            />

            {/* 3 — the anchor */}
            <TimeField ref={timeRef} digits={digits} onDigits={setDigits} />

            {serverError && (
              <p role="alert" className="text-sm text-danger-ink">
                {serverError}
              </p>
            )}

            {/* Desktop submit; the sticky bar below covers mobile. */}
            <div className="hidden lg:block">
              <Button type="submit" size="md" disabled={!canSave} loading={saving}>
                <Timer className="size-4" /> Save time
              </Button>
            </div>
          </div>

          {/* Right rail — context of the swim (type, date, meet). */}
          <aside className="flex flex-col gap-5 lg:border-l lg:border-border lg:pl-8">
            <Field label="Type" htmlFor="">
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
              {swimType !== "MEET" && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  Only meet times count toward a personal best.
                </p>
              )}
            </Field>

            <DateField
              label="Date"
              id="swim-date"
              value={swimDate}
              max={today}
              onChange={setSwimDate}
              error={
                swimDate !== "" && !dateValid ? "Pick a date up to today." : undefined
              }
            />

            <Input
              label="Meet / venue name"
              value={meetName}
              onChange={(e) => setMeetName(e.target.value)}
              placeholder="e.g. Summer Championships"
              hint="Remembered for the next entry."
            />

            <Input
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </aside>

          {/* Mobile sticky save bar — always in thumb reach. */}
          <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg/80 lg:hidden">
            <Button type="submit" size="md" className="w-full" disabled={!canSave} loading={saving}>
              <Timer className="size-4" /> Save time
            </Button>
          </div>
        </form>
      )}

      {recent.length > 0 && <RecentList entries={recent} onDelete={onDeleteRecent} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small local pieces
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : (
        <span className="text-sm font-medium text-ink">{label}</span>
      )}
      {children}
    </div>
  );
}

function RecentList({
  entries,
  onDelete,
}: {
  entries: SavedEntry[];
  onDelete: (entry: SavedEntry) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-muted">Logged this session</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <ul className="divide-y divide-gray-100">
          {entries.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-ink">{r.swimmer}</p>
                <p className="text-xs text-ink-muted">
                  {r.event} · {r.course}
                  {r.swimType !== "MEET" && (
                    <span className="text-ink-faint">
                      {" "}
                      · {r.swimType === "TIME_TRIAL" ? "Trial" : "Practice"}
                    </span>
                  )}
                </p>
              </div>
              <span className="time text-md font-medium tabular-nums text-ink">
                {r.time}
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.swimmer} ${r.event}`}
                onClick={() => onDelete(r)}
                className="inline-flex size-8 items-center justify-center rounded-md text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EmptyRoster() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white shadow-theme-sm px-6 py-14 text-center">
      <Timer aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">No active swimmers yet</p>
        <p className="mx-auto max-w-[42ch] text-sm text-ink-muted">
          Add a swimmer on the Roster screen first, then come back to log their times.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => (window.location.href = "/swimmers")}>
        Go to roster
      </Button>
    </div>
  );
}
