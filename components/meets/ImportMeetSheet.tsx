"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, ArrowRight, CheckCircle2, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  fix the row.

  WHERE THE SHEET WAS OPENED FROM DECIDES THE TARGET. From a meet's own page the
  target IS that meet, fixed — the page header already says which meet you are
  on, and a nearest-date suggestion that quietly aimed a wholesale replace at a
  DIFFERENT meet would be the worst bug this feature could have. Only from the
  meets list, where there is no such context, does the suggestion apply, and even
  there it is a pre-selection the super-user can change.

  Replacing a programme is the one irreversible act here, so it is gated like
  one: a danger-variant confirmation naming the target and showing what changes,
  field by field. Adding a new meet destroys nothing and is not gated.
*/

/** How close a meet's date must be to the parsed one to be worth suggesting. */
const SUGGEST_WITHIN_DAYS = 5;

type MeetOption = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  eventCount: number;
};

/** One field the import would change on the meet it targets. */
type Change = { label: string; from: string; to: string };

export function ImportMeetSheet({
  open,
  onOpenChange,
  meets,
  lockedMeetId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing meets, for the "Save as" picker and its suggestion. */
  meets: MeetOption[];
  /**
   * Opened from a meet's own page: the import targets THAT meet and nothing
   * else. No picker, no suggestion, no way to hit a neighbour by accident.
   */
  lockedMeetId?: Id<"meets">;
  onImported?: (meetId: Id<"meets">) => void;
}) {
  const importMeet = useMutation(api.meets.importMeet);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  // The nearest existing meet by date — only ever offered from the meets LIST.
  // On a meet's own page `lockedMeetId` settles it and this never runs.
  const suggestion = useMemo(() => {
    if (lockedMeetId || !startDate) return null;
    let best: { meet: MeetOption; distance: number } | null = null;
    for (const meet of meets) {
      const distance = Math.abs(daysBetween(meet.startDate, startDate));
      if (distance > SUGGEST_WITHIN_DAYS) continue;
      if (best === null || distance < best.distance) best = { meet, distance };
    }
    return best?.meet ?? null;
  }, [meets, startDate, lockedMeetId]);

  const effectiveTarget =
    lockedMeetId ?? (targetTouched ? target : (suggestion?._id ?? ""));
  const targetMeet = meets.find((m) => m._id === effectiveTarget) ?? null;

  /** Exactly what changes on the target meet, so nothing is renamed silently. */
  const changes: Change[] = useMemo(() => {
    if (!targetMeet) return [];
    const out: Change[] = [];
    const nextName = name.trim();
    if (nextName !== "" && targetMeet.name !== nextName) {
      out.push({ label: "Name", from: targetMeet.name, to: nextName });
    }
    if (startDate !== "" && targetMeet.startDate !== startDate) {
      out.push({
        label: "Date",
        from: formatMeetDates(targetMeet),
        to: formatMeetDates({ startDate }),
      });
    }
    const nextVenue = venue.trim();
    if (nextVenue !== "" && targetMeet.venue !== nextVenue) {
      out.push({
        label: "Venue",
        from: targetMeet.venue ?? "Not set",
        to: nextVenue,
      });
    }
    if (draft && targetMeet.eventCount !== draft.events.length) {
      out.push({
        label: "Events",
        from: targetMeet.eventCount === 0 ? "None" : String(targetMeet.eventCount),
        to: String(draft.events.length),
      });
    }
    return out;
  }, [targetMeet, name, startDate, venue, draft]);

  function clearInput() {
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
    clearInput();
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

  async function runImport() {
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
      notify.error(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  // Replacing is irreversible, so it goes through the app's destructive
  // confirmation. Adding a new meet destroys nothing and commits straight away.
  function onSubmit() {
    if (targetMeet) setConfirming(true);
    else void runImport();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>Import a meet programme</SheetTitle>
          <SheetDescription>
            {lockedMeetId && targetMeet ? (
              <>
                Loads the programme for{" "}
                <span className="font-medium text-ink">{targetMeet.name}</span>.
                Nothing is saved until you confirm what was read.
              </>
            ) : (
              <>
                A HY-TEK event list (PDF), a CSV, or pasted text. Nothing is saved
                until you confirm what was read below.
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
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
                onClick={clearInput}
                className="rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear
              </button>
            )}
          </div>

          {readError && (
            <p
              role="alert"
              className="rounded-lg border border-error-500/40 bg-danger-subtle px-3 py-2 text-sm text-danger-ink"
            >
              {readError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="meet-text" className="text-sm font-medium text-gray-700">
              …or paste the programme
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
            <p className="text-xs text-ink-muted">
              One event per line, as the programme prints it. A leading event
              number is optional, and a CSV of{" "}
              <span className="font-medium text-ink">event number, event name</span>{" "}
              works the same way.
            </p>
          </div>

          {/* --- 2. what was read ------------------------------------------ */}
          {/* The parse changes on every keystroke, so what gets ANNOUNCED is one
              short summary, not the whole block re-read each time. It is its own
              element rather than an aria-live wrapper around the sections: a
              wrapper would have to be `display: contents` to keep the layout,
              and that can drop the live region from the accessibility tree. */}
          <p className="sr-only" role="status">
            {draft ? parseSummary(draft) : "No programme loaded."}
          </p>
          <>
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

                {/* --- 3. new meet, or a correction to an existing one ------ */}
                {lockedMeetId ? (
                  targetMeet && (
                    <ChangeSummary
                      targetName={targetMeet.name}
                      eventCount={targetMeet.eventCount}
                      changes={changes}
                    />
                  )
                ) : (
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
                        // Every other option destroys a programme, so each one
                        // says "Replace" rather than reading as a plain filing
                        // choice.
                        ...meets.map((m) => ({
                          value: m._id,
                          label: `Replace — ${m.name} (${formatMeetDates(m)})`,
                          textValue: m.name,
                        })),
                      ]}
                    />
                    {targetMeet ? (
                      <>
                        {!targetTouched && (
                          <p className="text-xs text-ink-muted">
                            Suggested because the dates are close. Choose{" "}
                            <span className="font-medium text-ink">A new meet</span>{" "}
                            to add a fixture instead.
                          </p>
                        )}
                        <ChangeSummary
                          targetName={targetMeet.name}
                          eventCount={targetMeet.eventCount}
                          changes={changes}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-ink-muted">
                        Adds a new fixture to the calendar.
                      </p>
                    )}
                  </div>
                )}

                {/* --- 4. the programme itself --------------------------- */}
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-ink">
                    {draft.events.length} event
                    {draft.events.length === 1 ? "" : "s"} read
                  </p>
                  <ul className="custom-scrollbar max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white text-sm">
                    {draft.events.map((event, i) => (
                      <li key={i} className="flex items-baseline gap-2 px-3 py-1.5">
                        <span className="w-10 shrink-0 tabular-nums text-ink-faint">
                          {event.eventNumber ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {event.rawLabel}
                        </span>
                        {/* An unresolved line is the one a super-user needs to
                            notice, so it is the LOUDER of the two, not quieter. */}
                        <span
                          className={
                            event.distance === undefined
                              ? "shrink-0 text-2xs font-medium text-warning-ink"
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

            {/* --- 5. the outcome ----------------------------------------- */}
            {done && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm">
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-success-600"
                />
                <p className="text-ink">
                  {done.created ? "Meet added" : "Programme replaced"}:{" "}
                  {done.eventCount} event{done.eventCount === 1 ? "" : "s"} loaded.
                </p>
              </div>
            )}
          </>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done ? "Done" : "Cancel"}
          </Button>
          {!done && (
            // Replacing wears the destructive colour; adding a fixture does not.
            <Button
              variant={targetMeet ? "danger" : "primary"}
              loading={importing}
              disabled={!canImport}
              onClick={onSubmit}
            >
              {targetMeet ? "Replace programme" : "Add meet"}
            </Button>
          )}
        </SheetFooter>

        {targetMeet && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Replace this programme?"
            description={
              <>
                <span className="font-medium text-ink">{targetMeet.name}</span>
                &rsquo;s{" "}
                {targetMeet.eventCount === 0
                  ? "empty programme"
                  : `${targetMeet.eventCount}-event programme`}{" "}
                will be replaced by the {draft?.events.length ?? 0} events read
                from this file. This cannot be undone.
                {changes.length > 0 && (
                  <span className="mt-3 block">
                    <span className="text-xs font-medium text-ink">
                      It also changes:
                    </span>
                    <span className="mt-1 block">
                      {changes.map((c) => (
                        <ChangeRow key={c.label} change={c} />
                      ))}
                    </span>
                  </span>
                )}
              </>
            }
            confirmLabel="Replace programme"
            onConfirm={runImport}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * What the import will change on the meet it targets, field by field.
 *
 * Shown inline before the button AND inside the confirmation, because "replaces
 * its details" is the vaguest possible way to tell someone their meet is about
 * to be renamed. A rename here is usually CORRECT — the seeded row says "1st
 * seeded" and the real programme says "HAS 1ST SEEDED GALA 2026" — which is
 * exactly why it should be visible rather than a discovery afterwards.
 */
function ChangeSummary({
  targetName,
  eventCount,
  changes,
}: {
  targetName: string;
  eventCount: number;
  changes: Change[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning-subtle bg-warning-subtle px-3 py-2.5">
      <p className="text-sm text-warning-ink">
        Replaces <span className="font-medium">{targetName}</span>&rsquo;s{" "}
        {eventCount === 0 ? "empty programme" : `${eventCount}-event programme`}.
      </p>
      {changes.length === 0 ? (
        <p className="text-xs text-warning-ink">
          Its name, date and venue stay as they are.
        </p>
      ) : (
        <dl className="flex flex-col gap-0.5 text-xs text-warning-ink">
          {changes.map((c) => (
            <div key={c.label} className="flex flex-wrap items-baseline gap-1.5">
              <dt className="w-14 shrink-0 font-medium">{c.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-1.5">
                <span className="line-through opacity-70">{c.from}</span>
                <ArrowRight aria-hidden className="size-3 shrink-0 opacity-70" />
                <span className="font-medium">{c.to}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** One before → after line inside the confirmation dialog's prose. */
function ChangeRow({ change }: { change: Change }) {
  return (
    <span className="flex flex-wrap items-baseline gap-1.5 py-0.5 text-xs">
      <span className="w-14 shrink-0 font-medium text-ink-muted">
        {change.label}
      </span>
      <span className="text-ink-muted line-through">{change.from}</span>
      <ArrowRight aria-hidden className="size-3 shrink-0 text-ink-faint" />
      <span className="font-medium text-ink">{change.to}</span>
    </span>
  );
}

/** One sentence of what the parse found, for the screen-reader status line. */
function parseSummary(draft: MeetDraft): string {
  const parts = [
    `${draft.events.length} event${draft.events.length === 1 ? "" : "s"} read`,
  ];
  if (draft.warnings.length > 0) {
    parts.push(
      `${draft.warnings.length} warning${draft.warnings.length === 1 ? "" : "s"}`,
    );
  }
  if (draft.skipped.length > 0) {
    parts.push(
      `${draft.skipped.length} line${draft.skipped.length === 1 ? "" : "s"} not read as events`,
    );
  }
  return `${parts.join(". ")}.`;
}

/** Whole days from `a` to `b` (both ISO). Used only for the nearest-meet hint. */
function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}
