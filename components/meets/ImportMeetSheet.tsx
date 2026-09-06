"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";

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
import { errorMessage, notify } from "@/lib/notify";
import { formatMeetDates, meetEventLabel } from "@/lib/meets";
import { parseMeetProgramme, type MeetDraft } from "@/lib/meetImport";
import type { Course } from "@/lib/swim";

/*
  Import a meet programme (super-user only; `importMeet` enforces that).

  Three inputs, ONE parser. A HY-TEK PDF is turned into text by `lib/pdfText.ts`
  and then goes down the same path as a CSV or a paste, so there is a single set
  of rules to reason about and to test (`lib/meetImport.test.ts`).

  The step this sheet exists for is the CONFIRMATION. The parser reads a name, a
  date, a venue and a programme; the super-user checks them and says whether this
  is a NEW meet or a correction to an existing one. Nothing is auto-matched: the
  seeded "1st seeded" row sits on 12 Sep while the HAS programme says the 11th,
  so a date- or name-based rule would quietly create a near-duplicate rather than
  fix the row. The screen suggests the nearest meet; the person decides.
*/

/** How close a meet's date must be to the parsed one to be worth suggesting. */
const SUGGEST_WITHIN_DAYS = 5;

type MeetOption = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  eventCount: number;
};

export function ImportMeetSheet({
  open,
  onOpenChange,
  meets,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing meets, for the "attach to" picker and its suggestion. */
  meets: MeetOption[];
  onImported?: (meetId: Id<"meets">) => void;
}) {
  const importMeet = useMutation(api.meets.importMeet);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ created: boolean; eventCount: number } | null>(
    null,
  );

  // The parse is pure and cheap, so it re-runs from the text rather than being
  // stored — one source of truth for what the file says.
  const draft: MeetDraft | null = useMemo(
    () => (text.trim() === "" ? null : parseMeetProgramme(text)),
    [text],
  );

  // Confirmable fields, seeded from the parse. `null` means "not overridden";
  // the parsed value shows until the super-user types over it.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  const [venueEdit, setVenueEdit] = useState<string | null>(null);
  const [course, setCourse] = useState("");
  const [target, setTarget] = useState<string>(""); // "" = create a new meet
  const [targetTouched, setTargetTouched] = useState(false);

  const name = nameEdit ?? draft?.name ?? "";
  const startDate = dateEdit ?? draft?.startDate ?? "";
  const venue = venueEdit ?? draft?.venue ?? "";

  // The nearest existing meet by date — a SUGGESTION only, pre-selected so the
  // common case (re-importing over a seeded fixture) is one click, and freely
  // overridden. Once the super-user has touched the picker we never move it.
  const suggestion = useMemo(() => {
    if (!startDate) return null;
    let best: { meet: MeetOption; distance: number } | null = null;
    for (const meet of meets) {
      const distance = Math.abs(daysBetween(meet.startDate, startDate));
      if (distance > SUGGEST_WITHIN_DAYS) continue;
      if (best === null || distance < best.distance) best = { meet, distance };
    }
    return best?.meet ?? null;
  }, [meets, startDate]);

  const effectiveTarget = targetTouched ? target : (suggestion?._id ?? "");
  const targetMeet = meets.find((m) => m._id === effectiveTarget) ?? null;

  function reset() {
    setText("");
    setReadError(null);
    setDone(null);
    setNameEdit(null);
    setDateEdit(null);
    setVenueEdit(null);
    setCourse("");
    setTarget("");
    setTargetTouched(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setReading(true);
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        // pdf.js is ~350 KB — loaded only now, by someone who chose a PDF.
        const { extractPdfText } = await import("@/lib/pdfText");
        setText(await extractPdfText(file));
      } else {
        setText(await file.text());
      }
    } catch (err) {
      setReadError(errorMessage(err, "That file could not be read."));
    } finally {
      setReading(false);
    }
  }

  const canImport =
    draft !== null &&
    name.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    draft.events.length > 0;

  async function onImport() {
    if (!canImport || importing || draft === null) return;
    setImporting(true);
    try {
      const res = await importMeet({
        meetId: effectiveTarget ? (effectiveTarget as Id<"meets">) : undefined,
        name: name.trim(),
        startDate,
        venue: venue.trim() || undefined,
        course: (course || undefined) as Course | undefined,
        // No end date and no gala tag: a programme states neither, and the
        // mutation leaves both alone when they are absent, so importing over an
        // existing meet never silently unsets details someone entered by hand.
        events: draft.events,
      });
      setDone({ created: res.created, eventCount: res.eventCount });
      notify.success(
        res.created
          ? `Meet added with ${res.eventCount} events`
          : `Programme replaced — ${res.eventCount} events`,
      );
      onImported?.(res.meetId);
    } catch (err) {
      notify.error(err);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>Import a meet programme</SheetTitle>
          <SheetDescription>
            A HY-TEK event list (PDF), a CSV, or pasted text. Nothing is saved
            until you confirm what was read below.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
          {/* --- 1. the file ------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,.csv,text/csv,.txt,text/plain"
              onChange={onFile}
              className="sr-only"
              id="meet-file"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={reading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden /> Choose a file
            </Button>
            {text !== "" && (
              <button
                type="button"
                onClick={reset}
                className="rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear
              </button>
            )}
          </div>

          {readError && (
            <p className="rounded-lg border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger-ink">
              {readError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="meet-text" className="text-sm font-medium text-gray-700">
              …or paste the event list
            </label>
            <textarea
              id="meet-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDone(null);
                setReadError(null);
              }}
              spellCheck={false}
              placeholder={"HAS 1st Seeded Gala 2026 - 11/9/2026\n101  Mixed 100 Freestyle\n103  Mixed 100 Breaststroke"}
              className="h-32 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] placeholder:text-ink-faint hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
            />
          </div>

          {/* --- 2. what was read ------------------------------------------ */}
          {draft && !done && (
            <>
              {draft.warnings.length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-lg border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-sm text-warning-ink">
                  {draft.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2/60 p-3">
                <p className="text-sm font-medium text-ink">
                  Check the details before saving
                </p>
                <Input
                  id="import-name"
                  label="Meet name"
                  value={name}
                  onChange={(e) => setNameEdit(e.target.value)}
                  maxLength={120}
                />
                <DateField
                  id="import-date"
                  label="Date"
                  value={startDate}
                  onChange={setDateEdit}
                />
                <Input
                  id="import-venue"
                  label="Venue"
                  value={venue}
                  onChange={(e) => setVenueEdit(e.target.value)}
                  maxLength={120}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    htmlFor="import-course"
                    className="text-sm font-medium text-gray-700"
                  >
                    Course
                  </label>
                  <Select
                    id="import-course"
                    value={course}
                    onValueChange={setCourse}
                    size="md"
                    options={[
                      { value: "", label: "Not set" },
                      { value: "LCM", label: "Long course (50 m)" },
                      { value: "SCM", label: "Short course (25 m)" },
                    ]}
                  />
                  <p className="text-xs text-ink-muted">
                    A programme doesn&rsquo;t state the course. Leave it unset
                    rather than guessing.
                  </p>
                </div>
              </div>

              {/* --- 3. new meet, or a correction to an existing one -------- */}
              <div className="flex min-w-0 flex-col gap-1.5">
                <label
                  htmlFor="import-target"
                  className="text-sm font-medium text-gray-700"
                >
                  Save as
                </label>
                <Select
                  id="import-target"
                  value={effectiveTarget}
                  onValueChange={(next) => {
                    setTarget(next);
                    setTargetTouched(true);
                  }}
                  size="md"
                  options={[
                    { value: "", label: "A new meet" },
                    ...meets.map((m) => ({
                      value: m._id,
                      label: `${m.name} — ${formatMeetDates(m)}`,
                    })),
                  ]}
                />
                <p className="text-xs text-ink-muted">
                  {targetMeet ? (
                    <>
                      Replaces <span className="font-medium">{targetMeet.name}</span>
                      &rsquo;s details and its{" "}
                      {targetMeet.eventCount === 0
                        ? "(empty) programme"
                        : `${targetMeet.eventCount}-event programme`}
                      .{" "}
                      {targetMeet.startDate !== startDate && (
                        <>
                          Its date changes from {formatMeetDates(targetMeet)} to the
                          date above.
                        </>
                      )}
                      {!targetTouched && " Suggested because the dates are close."}
                    </>
                  ) : (
                    "Adds a new fixture to the calendar."
                  )}
                </p>
              </div>

              {/* --- 4. the programme itself ------------------------------- */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-ink">
                  {draft.events.length} event
                  {draft.events.length === 1 ? "" : "s"} read
                </p>
                <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white text-sm">
                  {draft.events.map((event, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-2 px-3 py-1.5"
                    >
                      <span className="w-10 shrink-0 tabular-nums text-ink-faint">
                        {event.eventNumber ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {event.rawLabel}
                      </span>
                      <span
                        className={
                          event.distance === undefined
                            ? "shrink-0 text-2xs text-ink-faint"
                            : "shrink-0 text-2xs text-ink-muted"
                        }
                      >
                        {event.distance === undefined
                          ? "not tracked"
                          : meetEventLabel(event)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {draft.skipped.length > 0 && (
                <details className="rounded-lg border border-border bg-white px-3 py-2 text-xs">
                  <summary className="cursor-pointer text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {draft.skipped.length} line
                    {draft.skipped.length === 1 ? "" : "s"} were not read as events
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {draft.skipped.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 tabular-nums text-ink-faint">
                          line {s.line}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink-muted">
                          {s.text}
                        </span>
                        <span className="shrink-0 text-ink-faint">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {/* --- 5. the outcome -------------------------------------------- */}
          {done && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm">
              <CheckCircle2
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-success-600"
              />
              <p className="text-ink">
                {done.created ? "Meet added" : "Programme replaced"}:{" "}
                {done.eventCount} event{done.eventCount === 1 ? "" : "s"}.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done ? "Done" : "Cancel"}
          </Button>
          {!done && (
            <Button loading={importing} disabled={!canImport} onClick={onImport}>
              {targetMeet ? "Replace programme" : "Add meet"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Whole days from `a` to `b` (both ISO). Used only for the nearest-meet hint. */
function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}
