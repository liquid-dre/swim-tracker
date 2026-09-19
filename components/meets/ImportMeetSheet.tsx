"use client";

import { Fragment, useMemo, useRef, useState } from "react";
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
import {
  formatMeetDates,
  groupEventsByDay,
  meetEventLabel,
} from "@/lib/meets";
import { parseMeetWorkbook, type MeetDraft } from "@/lib/meetImport";
import { MultiMeetReview } from "./MultiMeetReview";
import type { Course } from "@/lib/swim";
import { COURSE_LABEL } from "./meetShared";
import { DANGER_SURFACE, WARNING_SURFACE } from "@/components/ui/callout";

/*
  Import a meet programme (super-user only; `importMeet` enforces that).

  Four inputs, ONE parser. A HY-TEK PDF (`lib/pdfText.ts`) and an Excel workbook
  (`lib/sheetText.ts`) are each turned into text and then go down the same path
  as a CSV or a paste, so there is a single set of rules to reason about and to
  test (`lib/meetImport.test.ts`). Both readers are loaded on demand — a coach
  who never imports anything pays for neither.

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

/** Matches MAX_SPAN_DAYS in convex/meets.ts, as MeetForm does. */
const MAX_SPAN_DAYS = 31;

/** `iso` + n days, as ISO; undefined for an unparseable start. */
function addDays(iso: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type MeetOption = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  venue: string | null;
  course: Course | null;
  eventCount: number;
};

/** One field the import would change on the meet it targets. */
type Change = { label: string; from: string; to: string };

export function ImportMeetSheet({
  open,
  onOpenChange,
  meets,
  lockedMeet,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing meets, for the "Save as" picker and its suggestion. */
  meets: MeetOption[];
  /**
   * Opened from a meet's own page: the import targets THAT meet and nothing
   * else. No picker, no suggestion, no way to hit a neighbour by accident.
   *
   * The whole ROW, not an id: the caller already has it, so the sheet never
   * waits on a second subscription to learn the name it is about to overwrite.
   */
  lockedMeet?: MeetOption;
  onImported?: (meetId: Id<"meets">) => void;
}) {
  const importMeet = useMutation(api.meets.importMeet);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  /**
   * Set when a file was longer than its reader's cap — a PDF past the page cap,
   * a workbook past the sheet cap. `unit` names what was counted, because
   * "2 of 5 pages" and "2 of 5 sheets" are different things to go and fix.
   */
  const [truncated, setTruncated] = useState<{
    read: number;
    total: number;
    unit: "pages" | "sheets";
  } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{
    created: boolean;
    eventCount: number;
  } | null>(null);

  // The parse is pure and cheap, so it re-runs from the text rather than being
  // stored — one source of truth for what the file says.
  //
  // `parseMeetWorkbook` returns MANY drafts, because a club publishes its season
  // as one file. With a single meet in it the array holds exactly what
  // `parseMeetProgramme` always returned, so everything below this line is the
  // flow it has always been; with several, the review list takes over.
  const drafts: MeetDraft[] = useMemo(
    () => (text.trim() === "" ? [] : parseMeetWorkbook(text)),
    [text],
  );
  const multi = drafts.length > 1;
  const draft: MeetDraft | null = multi ? null : (drafts[0] ?? null);

  // Confirmable fields, seeded from the parse. `null` means "not overridden";
  // the parsed value shows until the super-user types over it.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  // Separately from the start: a document that heads its second half "Day 2 —
  // Sunday 29 November" has stated a two-day meet, and the day each event is on
  // cannot be saved against a meet the calendar thinks runs for one.
  const [endEdit, setEndEdit] = useState<string | null>(null);
  const [venueEdit, setVenueEdit] = useState<string | null>(null);
  // `null` = untouched, so the control can mean different things in its two
  // situations without either being a silent default. Creating a meet, it opens
  // on long course — a default the person sees and can change is their
  // decision, and it is what almost every meet here is. REPLACING one, it opens
  // on "keep": quietly re-pooling a meet somebody already set would be a guess,
  // and the parser still never states a course either way.
  const [courseEdit, setCourseEdit] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(""); // "" = create a new meet
  const [targetTouched, setTargetTouched] = useState(false);
  // The server's own wording when an import would clear sign-ups, held so the
  // confirmation can say exactly what it costs.
  const [dropWarning, setDropWarning] = useState<string | null>(null);

  const name = nameEdit ?? draft?.name ?? "";
  const startDate = dateEdit ?? draft?.startDate ?? "";
  const endDate = endEdit ?? draft?.endDate ?? "";
  const venue = venueEdit ?? draft?.venue ?? "";
  // A meet that runs one day has no end date at all, exactly as the meet form
  // stores it — "same as the start" and "not set" must not be two spellings of
  // one fact.
  const endToSend = endDate !== "" && endDate > startDate ? endDate : undefined;
  // The preview, banded exactly as the meet page will band it — against the
  // dates about to be SENT, so changing the end date re-bands the preview and a
  // day the meet will not reach shows up here rather than after the write.
  const previewDays = useMemo(
    () =>
      groupEventsByDay(draft?.events ?? [], {
        startDate,
        endDate: endToSend ?? null,
      }),
    [draft, startDate, endToSend],
  );

  // The nearest existing meet by date — only ever offered from the meets LIST.
  // On a meet's own page `lockedMeet` settles it and this never runs.
  const suggestion = useMemo(() => {
    if (lockedMeet || !startDate) return null;
    let best: { meet: MeetOption; distance: number } | null = null;
    for (const meet of meets) {
      const distance = Math.abs(daysBetween(meet.startDate, startDate));
      if (distance > SUGGEST_WITHIN_DAYS) continue;
      if (best === null || distance < best.distance) best = { meet, distance };
    }
    return best?.meet ?? null;
  }, [meets, startDate, lockedMeet]);

  const effectiveTarget =
    lockedMeet?._id ?? (targetTouched ? target : (suggestion?._id ?? ""));
  // `isReplace` is derived from the id this sheet will actually SEND, never from
  // a lookup into `meets`. That list is a separate subscription: while it is
  // still resolving (or has dropped on a reconnect) the lookup returns null
  // even though a locked target is set, and gating on it would render a plain
  // "Add meet" button that quietly replaced a programme. Everything
  // user-visible — the button, the confirmation, the summary — reads this.
  const isReplace = effectiveTarget !== "";
  // The locked row comes from the caller, so a locked target is ALWAYS
  // resolved — there is no loading state to explain and no second subscription
  // to wait on.
  const targetMeet =
    lockedMeet ?? meets.find((m) => m._id === effectiveTarget) ?? null;
  // A replace we cannot describe is a replace we must not offer: without the
  // target's row there is no name and no diff to confirm against.
  const targetUnresolved = isReplace && targetMeet === null;

  // "" means KEEP on a replace and "not known" on a new meet; an untouched
  // control opens on long course only in the second case. See `courseEdit`.
  const course = courseEdit ?? (targetMeet === null ? "LCM" : "");

  // A chosen target that has left the calendar (deleted in another tab) is
  // dropped rather than displayed as a selection the sheet cannot honour —
  // otherwise the picker would read "A new meet" while the button still said
  // "Replace programme".
  if (targetTouched && targetUnresolved && meets.length > 0) {
    setTarget("");
  }

  // Mirrors the guard in `importMeet`: a start date past the target's stored end
  // would leave the meet dated backwards, and `isUpcoming` reads the END date,
  // so a meet still to come would start reading as Past. Caught here so the
  // super-user learns it BEFORE confirming a destructive dialog, not after.
  // The end date this import leaves the meet with: its own when it states one,
  // the target's otherwise (an import that is silent never unsets it).
  const effectiveEnd = endToSend ?? targetMeet?.endDate ?? null;
  const datesConflict =
    effectiveEnd !== null && startDate !== "" && startDate > effectiveEnd;

  /** Exactly what changes on the target meet, so nothing is renamed silently. */
  const changes: Change[] = useMemo(() => {
    if (!targetMeet) return [];
    const out: Change[] = [];
    const nextName = name.trim();
    if (nextName !== "" && targetMeet.name !== nextName) {
      out.push({ label: "Name", from: targetMeet.name, to: nextName });
    }
    // A conflicting date is reported as a blocker below, not as a change.
    if (
      !datesConflict &&
      startDate !== "" &&
      targetMeet.startDate !== startDate
    ) {
      out.push({
        label: "Date",
        from: formatMeetDates(targetMeet),
        // The import never touches `endDate`, so a multi-day meet keeps its
        // span — showing a bare single date here would claim a change the
        // write will not make.
        to: formatMeetDates({ startDate, endDate: effectiveEnd }),
      });
    }
    // Stated separately, because a one-day row becoming a three-day one is a
    // bigger change than the start moving and must not hide inside it.
    if (endToSend !== undefined && (targetMeet.endDate ?? null) !== endToSend) {
      out.push({
        label: "Ends",
        from: targetMeet.endDate ?? "One day",
        to: endToSend,
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
    if (course !== "" && targetMeet.course !== course) {
      out.push({
        label: "Course",
        from: targetMeet.course ? COURSE_LABEL[targetMeet.course] : "Not set",
        to: COURSE_LABEL[course as Course],
      });
    }
    if (draft && targetMeet.eventCount !== draft.events.length) {
      out.push({
        label: "Events",
        from:
          targetMeet.eventCount === 0 ? "None" : String(targetMeet.eventCount),
        to: String(draft.events.length),
      });
    }
    return out;
  }, [
    targetMeet,
    name,
    startDate,
    endToSend,
    effectiveEnd,
    venue,
    course,
    draft,
    datesConflict,
  ]);

  function clearInput() {
    setText("");
    setTruncated(null);
    setReadError(null);
    setDone(null);
    setNameEdit(null);
    setDateEdit(null);
    setEndEdit(null);
    setVenueEdit(null);
    setCourseEdit(null);
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
        const read = await extractPdfText(file);
        setText(read.text);
        // A programme cut short by the page cap must SAY so — a short event
        // list presented as a complete one is the failure this whole sheet is
        // built to prevent.
        if (read.pagesRead < read.totalPages) {
          setTruncated({ read: read.pagesRead, total: read.totalPages, unit: "pages" });
        }
      } else if (/\.xlsx?$|\.xlsm$/i.test(file.name)) {
        // A workbook is a ZIP of XML: unreadable as text, and readable as a
        // table. Its rows become tab-separated lines — the same shape a CSV
        // already arrives in — so the parser below is unchanged. The older
        // binary `.xls` matches too, so that the reader can name it and say
        // which export to take instead.
        const { extractSheetText } = await import("@/lib/sheetText");
        const read = await extractSheetText(file);
        setText(read.text);
        if (read.sheetsRead.length < read.totalSheets) {
          setTruncated({
            read: read.sheetsRead.length,
            total: read.totalSheets,
            unit: "sheets",
          });
        }
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
    !datesConflict &&
    name.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    draft.events.length > 0 &&
    !targetUnresolved;

  /**
   * Commit. `rethrow` is set when the caller is the confirmation dialog, which
   * has its own error slot and must stay open on failure — closing a modal on a
   * failed write loses the context the decision was made in.
   */
  async function runImport(rethrow = false, allowDroppingEntries?: boolean) {
    if (!canImport || importing || draft === null) return;
    setImporting(true);
    try {
      const res = await importMeet({
        meetId: effectiveTarget ? (effectiveTarget as Id<"meets">) : undefined,
        name: name.trim(),
        startDate,
        endDate: endToSend,
        venue: venue.trim() || undefined,
        course: (course || undefined) as Course | undefined,
        allowDroppingEntries,
        // No gala tag: a programme never states one, and the mutation leaves an
        // absent field alone, so importing over an existing meet never silently
        // unsets a detail someone entered by hand. The end date is sent only
        // when this document actually stated one (or a person typed it here).
        events: draft.events,
      });
      setDone({ created: res.created, eventCount: res.eventCount });
      notify.success(
        res.created
          ? `Meet added with ${res.eventCount} events`
          : `Programme replaced — ${res.eventCount} events`,
      );
      setDropWarning(null);
      onImported?.(res.meetId);
    } catch (err) {
      // A programme that no longer lists an event somebody is entered for is a
      // real correction, so the refusal is re-asked as a confirmation carrying
      // the server's own count rather than left as a dead end. An event whose
      // swimmers already have TIMES is refused outright and never gets here.
      const message = errorMessage(err);
      if (message.includes("signed up for")) {
        setDropWarning(message);
        return;
      }
      // The confirmation dialog renders the failure inline, where the decision
      // was made — a toast as well would report the same thing twice.
      if (rethrow) throw err;
      notify.error(message);
    } finally {
      setImporting(false);
    }
  }

  /**
   * Why the commit button is disabled, in the words of the thing to fix. A dead
   * control with no stated reason is the reader's problem to solve twice: work
   * out that it is disabled, then work out why.
   */
  const blockedReason: string | null =
    draft === null
      ? "Choose a file or paste a programme."
      : draft.events.length === 0
        ? "No events were found in this file."
        : datesConflict
          ? "Fix the date conflict above, or save this as a new meet."
          : name.trim() === ""
            ? "Enter a meet name."
            : !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
              ? "Set the meet's date."
              : targetUnresolved
                ? "Choose a meet to replace, or save this as a new meet."
                : null;

  // Replacing is irreversible, so it goes through the app's destructive
  // confirmation. Adding a new meet destroys nothing and commits straight away.
  function onSubmit() {
    if (isReplace) setConfirming(true);
    else void runImport();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>Import a meet programme</SheetTitle>
          <SheetDescription>
            {lockedMeet ? (
              <>
                Loads the programme for{" "}
                <span className="font-medium text-ink">{lockedMeet.name}</span>.
                Nothing is saved until you confirm what was read.
              </>
            ) : (
              <>
                A HY-TEK event list (PDF), an Excel programme, a CSV, or pasted
                text. Nothing is saved until you confirm what was read below.
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
          {/* --- 1. the file ------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-2">
            {/* `disabled`, not just a guard on the Button beside it:
                `sr-only` is `position:absolute;width:1px;clip-path:inset(50%)`
                — it hides a control from SIGHT, not from the tab order. A
                keyboard user could tab straight to this and pick a file,
                `onFile` calls `clearInput()` unconditionally, and a live
                twelve-row review would be gone with no undo. Guarding the
                visible proxy guards nothing. */}
            <input
              ref={fileRef}
              disabled={multi}
              type="file"
              accept=".pdf,application/pdf,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv,.txt,text/plain"
              onChange={onFile}
              aria-label="Choose a programme file"
              className="sr-only"
              id="meet-file"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={reading}
              // Same reason as the textarea below: `onFile` calls
              // `clearInput()` unconditionally, so a second file would discard
              // a review in progress without asking.
              aria-disabled={(multi && !reading) || undefined}
              aria-describedby={multi ? "meet-text-locked" : undefined}
              onClick={() => {
                if (multi) return;
                fileRef.current?.click();
              }}
            >
              <Upload className="size-4" aria-hidden /> Choose a file
            </Button>
            {text !== "" && (
              <button
                type="button"
                onClick={clearInput}
                className="tap inline-flex items-center rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear
              </button>
            )}
          </div>

          {readError && (
            <p
              role="alert"
              className={`rounded-lg px-3 py-2 text-sm ${DANGER_SURFACE}`}
            >
              {readError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="meet-text"
              className="text-sm font-medium text-gray-700"
            >
              …or paste the programme
            </label>
            {/* LOCKED while a season review is on screen.

                `MultiMeetReview` is keyed on this text, so any keystroke here
                remounts it — discarding twelve rows of names, dates, courses
                and replace targets, every skip decision, and the per-row
                record of what was already written, which is the ONLY report a
                season import produces. Mid-import it would also leave the
                write loop running against an unmounted list.

                Not a confirmation dialog: Clear beside the file button is
                already the explicit "start again", it goes through the same
                `clearInput`, and one obvious way out beats a prompt on every
                keypress. */}
            <textarea
              id="meet-text"
              value={text}
              disabled={multi}
              aria-describedby={multi ? "meet-text-locked" : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setDone(null);
                setReadError(null);
                setTruncated(null);
              }}
              spellCheck={false}
              placeholder={
                "HAS 1st Seeded Gala 2026 - 11/9/2026\n101  Mixed 100 Freestyle\n103  Mixed 100 Breaststroke"
              }
              className="h-32 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] placeholder:text-ink-faint hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-ink-faint disabled:hover:border-gray-200"
            />
            {multi && (
              <p id="meet-text-locked" className="text-xs text-warning-ink">
                Locked while you review the {drafts.length} meets below —
                changing the source would discard your decisions. Use Clear to
                start again.
              </p>
            )}
            <p className="text-xs text-ink-muted">
              One event per line, as the programme prints it. A leading event
              number is optional, and a CSV — or a spreadsheet column layout of{" "}
              <span className="font-medium text-ink">
                event number, age group, distance, event
              </span>{" "}
              — works the same way.
            </p>
          </div>

          {/* --- 2. what was read ------------------------------------------ */}
          {/* The parse changes on every keystroke, so what gets ANNOUNCED is one
              short summary, not the whole block re-read each time. It is its own
              element rather than an aria-live wrapper around the sections: a
              wrapper would have to be `display: contents` to keep the layout,
              and that can drop the live region from the accessibility tree. */}
          <p className="sr-only" role="status">
            {multi
              ? `${drafts.length} meets found in this file.`
              : draft
                ? parseSummary(draft, truncated)
                : "No programme loaded."}
          </p>

          {/* A season workbook launched from a MEET's own page has nowhere to
              go: `lockedMeet` pins the import to one fixture, and twelve drafts
              cannot all land on it. Say where to do it instead rather than
              silently importing the first one. */}
          {multi && lockedMeet && (
            <p className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${WARNING_SURFACE}`}>
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                This file holds {drafts.length} meets, but this import is locked
                to {lockedMeet.name}. Import it from the Meets list instead, where
                each meet can be reviewed on its own.
              </span>
            </p>
          )}

          {/* Keyed on the source TEXT. `drafts` is re-derived on every
              keystroke while MultiMeetReview's rows and outcomes are one-shot
              `useState` initialisers, so pasting a second workbook over the
              first left the list showing file A's names, dates and replace
              targets while the import wrote file B's events — and a longer
              file indexed past the end of both arrays and took the sheet
              down. A new source text is a new review. */}
          {multi && !lockedMeet && (
            <MultiMeetReview
              key={text}
              drafts={drafts}
              meets={meets.map((m) => ({
                _id: m._id,
                name: m.name,
                startDate: m.startDate,
                eventCount: m.eventCount,
              }))}
              // Deliberately no `onImported`: that callback navigates to ONE
              // meet, and a season import has no single destination. The list
              // keeps its per-row outcomes on screen and the person closes the
              // sheet when they have read them.
            />
          )}

          <>
            {!multi && draft && !done && (
              <>
                {truncated && (
                  <p className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${WARNING_SURFACE}`}>
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      Only the first {truncated.read} of {truncated.total}{" "}
                      {truncated.unit} were read. Export just the event list, or
                      paste the rest.
                    </span>
                  </p>
                )}
                {datesConflict && targetMeet && (
                  <p
                    role="alert"
                    className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${DANGER_SURFACE}`}
                  >
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      This programme is dated after {targetMeet.name}&rsquo;s
                      end date ({formatMeetDates(targetMeet)}). Fix that
                      meet&rsquo;s dates first, or save this as a new meet.
                    </span>
                  </p>
                )}
                {draft.warnings.length > 0 && (
                  <ul className={`flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-sm ${WARNING_SURFACE}`}>
                    {draft.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0"
                        />
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
                  <DateField
                    id="import-end"
                    label="Ends"
                    hint={
                      draft?.endDate !== null && draft?.endDate !== undefined
                        ? "Read from this programme's own day headings."
                        : "Leave blank for a one-day meet."
                    }
                    value={endDate}
                    onChange={setEndEdit}
                    min={startDate || undefined}
                    // The same 31-day cap `MeetForm` applies. One constraint
                    // enforced in one place and not the other is how a typo'd
                    // year reaches the server to be rejected there instead.
                    max={addDays(startDate, MAX_SPAN_DAYS)}
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
                      aria-label="Course"
                      value={course}
                      onValueChange={setCourseEdit}
                      size="md"
                      options={[
                        {
                          // Absent means KEEP on a replace and "unknown" on a
                          // new meet. One control, two truths, so it says which.
                          value: "",
                          label: targetMeet
                            ? targetMeet.course
                              ? `Keep ${COURSE_LABEL[targetMeet.course].toLowerCase()}`
                              : "Keep unset"
                            : "Not set",
                        },
                        { value: "LCM", label: "Long course (50 m)" },
                        { value: "SCM", label: "Short course (25 m)" },
                      ]}
                    />
                    <p className="text-xs text-ink-muted">
                      A programme doesn&rsquo;t state the course.{" "}
                      {targetMeet
                        ? "Leaving this alone keeps what the meet already has."
                        : "Leave it unset rather than guessing."}
                    </p>
                  </div>
                </div>

                {/* --- 3. new meet, or a correction to an existing one ------ */}
                {lockedMeet ? (
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
                      // The visible label names a `<button>`, which takes its
                      // accessible name from its contents. See SelectField in
                      // MeetForm for the full note.
                      aria-label="Save as"
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
                            <span className="font-medium text-ink">
                              A new meet
                            </span>{" "}
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
                    {previewDays.length > 1 && (
                      <span className="font-normal text-ink-muted">
                        {" "}
                        across {previewDays.length} days
                      </span>
                    )}
                  </p>
                  {/* The day each event lands on is the newest and least-tested
                      thing this parser infers, it reshapes the meet page, and it
                      propagates into every entry's `swimDate`. This sheet flags
                      an ambiguous date and refuses to apply a stated course, so
                      it does not get to apply days unseen either. */}
                  <ul className="custom-scrollbar max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white text-sm">
                    {previewDays.map((group) => (
                      <Fragment key={group.day ?? "unplaced"}>
                        {previewDays.length > 1 && (
                          <li className="bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink">
                            {group.label}
                            <span className="ml-2 font-normal normal-case tracking-normal text-ink-muted">
                              <span className="tabular-nums">
                                {group.events.length}
                              </span>{" "}
                              {group.events.length === 1 ? "event" : "events"}
                            </span>
                          </li>
                        )}
                        {group.events.map((event, i) => (
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
                        {/* An unresolved line is the one a super-user needs to
                            notice, so it is the LOUDER of the two, not quieter. */}
                        <span
                          className={
                            event.distance === undefined
                              ? "shrink-0 text-xs font-medium text-warning-ink"
                              : "shrink-0 text-xs text-ink-muted"
                          }
                        >
                          {event.distance === undefined
                            ? "not tracked"
                            : meetEventLabel(event)}
                        </span>
                      </li>
                        ))}
                      </Fragment>
                    ))}
                  </ul>
                </div>

                {draft.skipped.length > 0 && (
                  <details className="rounded-lg border border-border bg-white px-3 py-2 text-xs">
                    <summary className="cursor-pointer text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {draft.skipped.length} line
                      {draft.skipped.length === 1 ? "" : "s"} were not read as
                      events
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
                          <span className="shrink-0 text-ink-faint">
                            {s.reason}
                          </span>
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
                  {done.eventCount} event{done.eventCount === 1 ? "" : "s"}{" "}
                  loaded.
                </p>
              </div>
            )}
          </>
        </div>

        {/* Not a live region: `blockedReason` below announces this same fact,
            and the footer one is what the submit button points at. Two of them
            read the coach the same sentence twice. */}
        {targetUnresolved && (
          <p className="px-4 pb-1 text-xs text-ink-muted">
            That meet is no longer on the calendar. Choose another, or save this
            as a new meet.
          </p>
        )}

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-border">
          {/* `!multi` because `blockedReason` is derived from the SINGLE
              draft, and a workbook of twelve sets that draft to null - so a
              finished season import rendered "Choose a file or paste a
              programme." under twelve green "Added" lines, and, this being a
              live region, read it out against the summary above announcing
              twelve meets found. The multi path states its own blocked reason
              inside MultiMeetReview.

              Inked as an error, not a hint: it is the reason a primary action
              will not fire, which is the rule MeetForm already wrote down. */}
          {blockedReason && !done && !multi && (
            <p
              id="import-blocked"
              role="status"
              className="mr-auto text-xs text-danger-ink"
            >
              {blockedReason}
            </p>
          )}
          {/* `|| multi` because `done` is set only on the single-draft path:
              the review list writes its own rows and reports per row, and is
              mounted with no completion callback. Without it, twelve green
              "Added" lines left this sheet's only exit reading "Cancel" — the
              word for abandoning an irreversible write that already ran. */}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done || multi ? "Done" : "Cancel"}
          </Button>
          {!done && !multi && (
            // Replacing wears the destructive colour; adding a fixture does not.
            // `aria-disabled`, not `disabled`: a native disabled button is out
            // of the tab order, so the `aria-describedby` below pointed at a
            // reason no keyboard user could ever reach. It also took the
            // shared base's `disabled:opacity-50`, which leaves a blocked
            // primary unreadable (locked in lib/contrast.test.ts).
            <Button
              variant={isReplace ? "danger" : "primary"}
              loading={importing}
              aria-disabled={(!canImport && !importing) || undefined}
              aria-describedby={blockedReason ? "import-blocked" : undefined}
              onClick={() => {
                if (!canImport) return;
                onSubmit();
              }}
            >
              {isReplace ? "Replace programme" : "Add meet"}
            </Button>
          )}
        </SheetFooter>

        {isReplace && targetMeet && (
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
            onConfirm={() => runImport(true)}
          />
        )}

        <ConfirmDialog
          open={dropWarning !== null}
          onOpenChange={(next) => !next && setDropWarning(null)}
          title="Remove those sign-ups?"
          description={
            <>
              <p>{dropWarning}</p>
              <p className="mt-2">
                Their sign-ups go with the events this programme no longer
                lists. No recorded time is affected &mdash; an event whose
                swimmers already have times cannot be removed at all.
              </p>
            </>
          }
          confirmLabel="Remove sign-ups and import"
          onConfirm={async () => {
            setDropWarning(null);
            await runImport(false, true);
          }}
        />
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
 *
 * Deliberately NOT the warning skin the parse warnings above it wear. Those say
 * "the parser struggled with this"; this says "here is what the write will do to
 * your data", and it gates a destructive button — so it takes that button's
 * colour, not the one already on screen meaning something else.
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
    <div className={`flex flex-col gap-2 rounded-lg px-3 py-2.5 ${DANGER_SURFACE}`}>
      <p className="text-sm text-danger-ink">
        Replaces <span className="font-medium">{targetName}</span>&rsquo;s{" "}
        {eventCount === 0 ? "empty programme" : `${eventCount}-event programme`}
        .
      </p>
      {changes.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Its name, date, venue and course stay as they are.
        </p>
      ) : (
        <dl className="flex flex-col gap-0.5 text-xs text-ink">
          {changes.map((c) => (
            <div
              key={c.label}
              className="flex flex-wrap items-baseline gap-1.5"
            >
              <dt className="w-14 shrink-0 font-medium text-ink-muted">
                {c.label}
              </dt>
              <dd className="flex flex-wrap items-baseline gap-1.5">
                {/* No opacity on the old value: it is struck through, which is
                    the signal, and fading it as well drops it below AA. */}
                <span className="text-ink-muted line-through">{c.from}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3 shrink-0 text-ink-faint"
                />
                <span className="font-medium text-ink">{c.to}</span>
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

/**
 * One sentence of what the parse found, for the screen-reader status line.
 *
 * The truncation leads, because it is the one fact that makes the rest
 * misleading: "8 events read" is a true sentence and a false impression when
 * 14 of the file's pages were never opened.
 */
function parseSummary(
  draft: MeetDraft,
  // `unit` too, for the reason the state that carries it gives: "2 of 5 pages"
  // and "2 of 5 sheets" send you to two different places to fix it. The visible
  // paragraph honoured that from the start; this one said "pages" whatever the
  // file was, so a non-sighted importer of a 12-SHEET workbook went looking for
  // pages that do not exist.
  truncated: { read: number; total: number; unit: string } | null,
): string {
  const parts: string[] = [];
  if (truncated) {
    parts.push(
      `Only the first ${truncated.read} of ${truncated.total} ${truncated.unit} were read`,
    );
  }
  parts.push(
    `${draft.events.length} event${draft.events.length === 1 ? "" : "s"} read`,
  );
  // The warnings themselves, not a count: "1 warning" tells a listener nothing
  // about an ambiguous date they are about to accept.
  for (const warning of draft.warnings) parts.push(warning.replace(/\.$/, ""));
  if (draft.skipped.length > 0) {
    parts.push(
      `${draft.skipped.length} line${draft.skipped.length === 1 ? "" : "s"} not read as events`,
    );
  }
  return `${parts.join(". ")}.`;
}

/** Whole days from `a` to `b` (both ISO). Used only for the nearest-meet hint. */
function daysBetween(a: string, b: string): number {
  return (
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}
