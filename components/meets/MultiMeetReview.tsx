"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangle, Check, Info, Undo2, X } from "lucide-react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { notify } from "@/lib/notify";
import {
  formatMeetDates,
  groupEventsByDay,
  normaliseMeetName,
} from "@/lib/meets";
import type { MeetDraft } from "@/lib/meetImport";
import type { Course } from "@/lib/swim";
import { courseMismatches } from "./programmeEditing";
import { importPlan } from "./importPlan";
import { WARNING_SURFACE } from "@/components/ui/callout";

/*
  A whole season, reviewed in one pass (§R19).

  A club publishes its fixtures as ONE workbook — a dozen dated meets, each with
  its programme — so `parseMeetWorkbook` hands back many drafts and this screen
  is where a person confirms them. It is a review LIST, not a wizard: twelve
  meets on one surface, each with its own name, date, start time, venue, course
  and create-or-replace target, committed together.

  Three rules it exists to enforce, all of them from §4.2 and §R19:

  NOTHING IS APPLIED SILENTLY. Course starts UNSET on every row. Where a
  programme cannot physically run in long course — a 25 m event only exists in a
  short-course pool — the row says so and offers the answer in one click, but a
  person still makes the choice. A guessed course files every swim at that meet
  in the wrong pool and nothing downstream would ever flag it.

  RE-IMPORTING IS NOT DUPLICATING. The realistic second use of this screen is
  the same workbook in November, because one programme was finally published. A
  row whose normalised name AND start date both match an existing meet therefore
  pre-selects "replace that meet" — an exact match on both is the same fixture,
  not a guess — while everything else defaults to creating a new one. Both stay
  overridable per row.

  NOTHING VANISHES. A fixture with a date but no programme yet is imported as a
  dated meet with an empty programme, because the coach needs it on the calendar
  now and a later re-import fills it in.
*/

/** An existing meet this list may target, as the import sheet already models it. */
export type ExistingMeet = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  eventCount: number;
};

/** Per-row state: only what a person can change about a parsed draft. */
type RowEdits = {
  name: string;
  startDate: string;
  /** "" = one day. Only ever set from a day heading the document itself dated. */
  endDate: string;
  startTime: string;
  venue: string;
  /** "" = not chosen yet. Never pre-filled from the programme (§4.2). */
  course: string;
  /** "" = create a new meet; otherwise the id of the meet to replace. */
  target: string;
  /**
   * Left out of this import.
   *
   * A file is not a decision: a club's season workbook holds every fixture it
   * runs, and a coach importing it may only want half of them — the Seeded
   * Galas but not the Junior League, or the four they have not already entered
   * by hand. Without this the only way to refuse a row was to import it and
   * delete the meet afterwards.
   *
   * A skipped row is dimmed IN PLACE rather than removed from the list. The
   * parser's own rule is that nothing vanishes (`lib/meetImport.ts`) — a row
   * that disappeared would read as something the parser lost, and there would
   * be nothing left to click to change your mind.
   */
  skip: boolean;
};

type RowOutcome =
  | { status: "pending" }
  | { status: "saved"; created: boolean; eventCount: number }
  | { status: "failed"; message: string }
  /** Deliberately left out — a decision, not a failure, and worded as one. */
  | { status: "skipped" };

/**
 * The course a programme's own events imply, when they imply one at all.
 *
 * Derived from `courseMismatches`, the same helper the meet form uses to flag a
 * line that cannot run in the chosen pool: if every resolved line fits short
 * course and at least one cannot fit long course, the programme is short course
 * — a 25 m race has nowhere else to happen. Returns null whenever both courses
 * remain possible, which is most meets and is not a fact worth asserting.
 *
 * This is a SUGGESTION, surfaced with its reason and applied only on a click.
 */
function impliedCourse(
  draft: MeetDraft,
): { course: Course; reason: string } | null {
  const longBad = courseMismatches(draft.events, "LCM").length;
  const shortBad = courseMismatches(draft.events, "SCM").length;
  if (longBad > 0 && shortBad === 0) {
    return {
      course: "SCM",
      reason: `${longBad} event${longBad === 1 ? "" : "s"} can only be swum in a short-course pool`,
    };
  }
  if (shortBad > 0 && longBad === 0) {
    return {
      course: "LCM",
      reason: `${shortBad} event${shortBad === 1 ? "" : "s"} can only be swum in a long-course pool`,
    };
  }
  return null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function MultiMeetReview({
  drafts,
  meets,
  onDone,
}: {
  drafts: MeetDraft[];
  meets: ExistingMeet[];
  onDone?: () => void;
}) {
  const importMeet = useMutation(api.meets.importMeet);

  // An exact match on BOTH the normalised name and the start date is the same
  // fixture — the one case where auto-targeting is a fact rather than a guess.
  const matchFor = useMemo(() => {
    const byKey = new Map<string, ExistingMeet>();
    for (const m of meets) {
      byKey.set(`${normaliseMeetName(m.name)}|${m.startDate}`, m);
    }
    return (draft: MeetDraft): ExistingMeet | null =>
      draft.startDate === null
        ? null
        : (byKey.get(`${normaliseMeetName(draft.name)}|${draft.startDate}`) ??
          null);
  }, [meets]);

  const [rows, setRows] = useState<RowEdits[]>(() =>
    drafts.map((d) => ({
      name: d.name,
      startDate: d.startDate ?? "",
      endDate: d.endDate ?? "",
      startTime: d.startTime ?? "",
      venue: d.venue ?? "",
      course: "",
      target: matchFor(d)?._id ?? "",
      skip: false,
    })),
  );
  const [outcomes, setOutcomes] = useState<RowOutcome[]>(() =>
    drafts.map(() => ({ status: "pending" })),
  );
  const [allowNoCourse, setAllowNoCourse] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const suggestions = useMemo(() => drafts.map(impliedCourse), [drafts]);

  function patchRow(i: number, patch: Partial<RowEdits>) {
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  /** Accept every course this workbook's own events can prove. */
  function acceptAllSuggestions() {
    setRows((prev) =>
      prev.map((r, i) =>
        !r.skip && r.course === "" && suggestions[i] !== null
          ? { ...r, course: suggestions[i]!.course }
          : r,
      ),
    );
  }

  /*
    ONE model, and the only place an index is read.

    This component holds three arrays with three different lifetimes — `drafts`
    (the parent's, re-derived from the pasted text), `rows` (the edits) and
    `outcomes` (what each write did) — and every count, label, guard and dialog
    used to correlate them by position. One of those correlations was made
    against `included`, which is a FILTERED array: a single skipped row shifted
    every lookup after it, so a retry could name the wrong meet in the
    confirmation, or find no replacement at all and destroy a programme with no
    dialog. Three separate defects, all the same decision.

    So position is resolved exactly once, here, and everything below is a
    projection of the result. A count and the dialog beside it cannot disagree
    if neither is allowed to do its own arithmetic.
  */
  const view = drafts.map((draft, index) => {
    const edits = rows[index];
    const outcome = outcomes[index];
    return {
      index,
      draft,
      edits,
      outcome,
      suggestion: suggestions[index],
      target:
        edits.target === ""
          ? null
          : (meets.find((m) => m._id === edits.target) ?? null),
      /** `runAll` writes this row on the next press: not skipped, not already in. */
      willWrite: !edits.skip && outcome.status !== "saved",
    };
  });

  // A skipped row must never hold the import up: being blocked on a missing
  // course for a meet you have just said you do not want would make skipping
  // it pointless.
  const included = view.filter((v) => !v.edits.skip);
  const skipped = view.length - included.length;

  /*
    What the next press writes, and what that destroys — from `importPlan`,
    which is pure and tested, and which indexes the ORIGINAL rows rather than a
    filtered copy of them. The previous version of these four lines did its own
    arithmetic over `included`, whose indices do not address `outcomes`.
  */
  const plan = importPlan(rows, outcomes);
  const outstanding = plan.write.map((i) => view[i]);
  const replacing = plan.replaces.length;
  const replaceTargets = plan.replaceIds
    .map((id) => meets.find((m) => m._id === id) ?? null)
    .filter((m): m is ExistingMeet => m !== null);
  const duplicateTarget =
    plan.duplicateId === null
      ? null
      : (meets.find((m) => m._id === plan.duplicateId)?.name ?? null);

  /** Undo every exclusion at once — a mis-click on row nine is cheap to fix. */
  function includeAll() {
    setRows((prev) => prev.map((r) => ({ ...r, skip: false })));
  }

  const suggestable = included.filter(
    (v) => v.suggestion !== null && v.edits.course === "",
  ).length;
  const missingCourse = included.filter((v) => v.edits.course === "").length;
  const rowsValid = included.every(
    (v) => v.edits.name.trim() !== "" && ISO.test(v.edits.startDate),
  );

  /** Why the import cannot run, in the words of the thing to fix. */
  const blockedReason: string | null =
    included.length === 0
      ? "Every meet is left out — put at least one back to import."
      : !rowsValid
        ? "Every meet needs a name and a date."
        : missingCourse > 0 && !allowNoCourse
          ? `${missingCourse} ${missingCourse === 1 ? "meet needs" : "meets need"} a course before they can be imported.`
          : duplicateTarget !== null
            ? `Two meets are both set to replace ${duplicateTarget}. Only one can.`
            : null;
  const canImport =
    !importing &&
    !finished &&
    included.length > 0 &&
    rowsValid &&
    duplicateTarget === null &&
    (missingCourse === 0 || allowNoCourse);

  async function runAll() {
    if (!canImport) return;
    setImporting(true);
    const next: RowOutcome[] = [...outcomes];
    // Seeded from what a previous pass committed, not 0: the loop below skips
    // those rows, so counting from zero made a retry report "2 imported" after
    // ten had landed.
    let saved = next.filter((o) => o.status === "saved").length;

    // Sequential, not parallel: each row is an independent decision and a
    // failure part-way through must leave the rows before it committed and say
    // exactly which one stopped — not abandon a half-written season with no
    // record of what landed.
    for (let i = 0; i < rows.length; i += 1) {
      if (next[i].status === "saved") continue; // a retry skips what already landed
      const row = rows[i];
      if (row.skip) {
        next[i] = { status: "skipped" };
        continue;
      }
      try {
        const res = await importMeet({
          meetId: row.target ? (row.target as Id<"meets">) : undefined,
          name: row.name.trim(),
          startDate: row.startDate,
          // Only when the document dated a later day of its own. The course is
          // held back for a person to answer because a workbook states none;
          // this one it states, in the heading above the Sunday events.
          endDate:
            row.endDate !== "" && row.endDate > row.startDate
              ? row.endDate
              : undefined,
          startTime: row.startTime.trim() || undefined,
          venue: row.venue.trim() || undefined,
          course: (row.course || undefined) as Course | undefined,
          events: drafts[i].events,
        });
        next[i] = {
          status: "saved",
          created: res.created,
          eventCount: res.eventCount,
        };
        saved += 1;
      } catch (err) {
        next[i] = {
          status: "failed",
          message:
            err instanceof Error
              ? err.message
              : "That meet could not be saved.",
        };
      }
      setOutcomes([...next]);
    }

    setImporting(false);
    // Done means nothing is left to write — a row deliberately left out counts
    // as settled, not as outstanding work. Checking only for "saved" here would
    // leave the button offering to import again the moment anything was
    // skipped, which is the one case this screen now exists to support.
    const left = next.filter((o) => o.status === "skipped").length;
    const failed = next.filter((o) => o.status === "failed").length;
    setFinished(failed === 0);

    if (failed === 0) {
      notify.success(
        `${saved} meet${saved === 1 ? "" : "s"} imported` +
          (left > 0 ? `, ${left} left out` : ""),
      );
      onDone?.();
    } else {
      notify.error(
        `${saved} imported, ${failed} could not be saved — see the rows below.`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-muted">
        <p>
          This file holds{" "}
          <span className="font-medium text-ink">{drafts.length} meets</span>.
          Check each one below, then import them together. Nothing is saved
          until you do — and a meet you don&rsquo;t want can be left out.
        </p>
        {skipped > 0 && (
          <p className="mt-1">
            <span className="font-medium text-ink">{skipped} left out</span>,{" "}
            {included.length} will be imported.{" "}
            <button
              type="button"
              onClick={includeAll}
              disabled={importing || finished}
              className="tap inline-flex items-center rounded-sm font-medium text-brand-600 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Put them all back
            </button>
          </p>
        )}
      </div>

      {/* Course is the one field with real downstream consequences, so it gets
          its own summary line and a single control for the whole workbook. */}
      {missingCourse > 0 && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${WARNING_SURFACE}`}>
          <p className="text-warning-ink">
            <AlertTriangle aria-hidden className="mr-1.5 inline size-4" />
            {missingCourse} meet{missingCourse === 1 ? " has" : "s have"} no
            course set. A meet without one cannot take times.
          </p>
          {suggestable > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={acceptAllSuggestions}
            >
              Use suggested course for {suggestable}
            </Button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {view.map((v) => (
          <MeetRow
            key={v.index}
            draft={v.draft}
            row={v.edits}
            suggestion={v.suggestion}
            outcome={v.outcome}
            target={v.target}
            meets={meets}
            disabled={importing}
            frozen={finished}
            onChange={(patch) => patchRow(v.index, patch)}
          />
        ))}
      </ul>

      {missingCourse > 0 && (
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-gray-300 accent-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
            checked={allowNoCourse}
            onChange={(e) => setAllowNoCourse(e.target.checked)}
            disabled={importing}
          />
          <span>
            Save the {missingCourse} meet{missingCourse === 1 ? "" : "s"}{" "}
            without a course. They will show &ldquo;Not set&rdquo; and cannot
            take times until one is chosen on the meet itself.
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          // `aria-disabled` so the reason beside it is reachable by tab, and
          // so the button does not take `disabled:opacity-50`, which leaves a
          // blocked primary unreadable (locked in lib/contrast.test.ts).
          // Not while it is RUNNING: a busy button is not a blocked one, and
          // both states at once compounded their two treatments.
          aria-disabled={(!canImport && !importing) || undefined}
          aria-describedby={
            !canImport && blockedReason !== null
              ? "multi-import-blocked"
              : undefined
          }
          onClick={() => {
            if (!canImport) return;
            if (replacing > 0) setConfirmReplace(true);
            else void runAll();
          }}
          loading={importing}
        >
          {/* What will actually be WRITTEN — so leaving a meet out is visible
              on the button before it is pressed, and a retry after a partial
              failure says the two rows left rather than the twelve it started
              with, which is what the dialog it opens has always said. */}
          {finished
            ? "Imported"
            : `Import ${outstanding.length} meet${outstanding.length === 1 ? "" : "s"}`}
        </Button>
        {/* The count that is not on the button, because the button's count is
            what will be WRITTEN and this is what will be LOST. */}
        {!finished && replacing > 0 && (
          <span className="text-sm text-warning-ink">
            {replacing === 1
              ? "1 replaces an existing programme"
              : `${replacing} replace existing programmes`}
          </span>
        )}
        {/* An error, not a hint: it is the reason a primary action will not
            fire. MeetForm wrote that rule down; this said the same thing in
            muted ink. */}
        {blockedReason !== null && (
          <span
            id="multi-import-blocked"
            role="status"
            className="text-sm text-danger-ink"
          >
            {blockedReason}
          </span>
        )}
      </div>

      {/* The same gate the single-meet path uses, for the same write. It names
          the meets rather than the count, because "3 replace existing
          programmes" does not tell a coach WHICH three, and a season workbook
          re-imported in November targets whatever is already on the calendar
          by name and date. The rows that only ADD are not listed: nothing of
          theirs is at stake. */}
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title={
          replacing === 1
            ? "Replace 1 programme?"
            : `Replace ${replacing} programmes?`
        }
        // `span`s, not `p`/`ul`: Radix renders `description` inside
        // `Dialog.Description`, which IS a `<p>`, so a paragraph or a list
        // here nests block elements in a `<p>` — invalid DOM, a React
        // `validateDOMNesting` error on every open, and unparseable if this
        // ever renders server-side. ImportMeetSheet builds the same shape out
        // of `span.block` for exactly this reason; this is that spelling.
        description={
          <>
            <span className="block">
              Importing writes {outstanding.length} meet
              {outstanding.length === 1 ? "" : "s"}.{" "}
              {replacing === 1 ? "One of them" : `${replacing} of them`}{" "}
              {replacing === 1 ? "replaces" : "replace"} a programme already on
              the calendar, wholesale. This cannot be undone.
            </span>
            <span className="mt-2 flex flex-col gap-1">
              {replaceTargets.map((m) => (
                <span key={m._id} className="block text-ink">
                  {m.name}{" "}
                  <span className="text-ink-muted">
                    ({formatMeetDates(m)}
                    {m.eventCount > 0
                      ? `, ${m.eventCount} event${m.eventCount === 1 ? "" : "s"} today`
                      : ", empty programme"}
                    )
                  </span>
                </span>
              ))}
            </span>
          </>
        }
        confirmLabel={replacing === 1 ? "Replace it" : "Replace them"}
        onConfirm={async () => {
          await runAll();
        }}
      />
    </div>
  );
}

function MeetRow({
  draft,
  row,
  suggestion,
  outcome,
  target,
  meets,
  disabled,
  frozen,
  onChange,
}: {
  draft: MeetDraft;
  row: RowEdits;
  suggestion: { course: Course; reason: string } | null;
  outcome: RowOutcome;
  target: ExistingMeet | null;
  meets: ExistingMeet[];
  disabled: boolean;
  /** The import has finished; the list is a record now, not a form. */
  frozen: boolean;
  onChange: (patch: Partial<RowEdits>) => void;
}) {
  const saved = outcome.status === "saved";
  const locked = disabled || saved || row.skip;
  // Twelve of these render at once, so the label/control pairs below need ids
  // unique to the ROW, not to the field.
  const rowId = useId();
  const title = row.name.trim() === "" ? "Untitled meet" : row.name;
  // Banded against the dates this row will actually be SAVED with, so editing
  // the end date re-bands the summary rather than describing a meet the write
  // will not produce.
  const dayBands = groupEventsByDay(draft.events, {
    startDate: row.startDate,
    endDate:
      row.endDate !== "" && row.endDate > row.startDate ? row.endDate : null,
  });

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-theme-sm transition-colors [transition-duration:var(--dur-1)] ${
        row.skip ? "border-dashed border-gray-300" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* A heading, so a twelve-meet workbook can be navigated by meet
            rather than tabbed through sixty identically-labelled fields. */}
        <h3
          className={`min-w-0 truncate text-sm font-medium ${
            row.skip ? "text-ink-muted line-through" : "text-ink"
          }`}
        >
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-3">
          {/* The day split is stated, not applied unseen. A whole-season
              workbook is exactly where a multi-day gala arrives, and this
              sheet's discipline is to hold every inference up before it
              commits — it does that for the course, so it does it for the
              days the parser read out of the programme's own headings. */}
          <span
            className="text-xs tabular-nums text-ink-faint"
            title={
              dayBands.length > 1
                ? dayBands
                    .map((g) => `${g.events.length} on ${g.label}`)
                    .join(", ")
                : undefined
            }
          >
            {draft.events.length === 0
              ? "No events yet"
              : dayBands.length > 1
                ? `${dayBands.length} days · ${dayBands
                    .map((g) => g.events.length)
                    .join(" / ")}`
                : `${draft.events.length} events`}
          </span>
          {/* Leaving a meet out is reversible and costs nothing, so it is a
              plain toggle rather than a destructive-looking delete: the file is
              not being edited, only this import's scope. Gone once the import
              has run, when the row is a record of what happened. */}
          {!saved && !frozen && (
            <button
              type="button"
              onClick={() => onChange({ skip: !row.skip })}
              disabled={disabled}
              className="tap-box rounded-md p-1.5 text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label={
                row.skip
                  ? `Include ${title} in this import`
                  : `Leave ${title} out of this import`
              }
            >
              {row.skip ? (
                <Undo2 aria-hidden className="size-4" />
              ) : (
                <X aria-hidden className="size-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {row.skip && (
        <p className="text-xs text-ink-muted">
          Left out — this meet won&rsquo;t be imported. Nothing in the file
          changes; use the arrow to put it back.
        </p>
      )}

      {/* The fields stay on screen while a row is skipped, dimmed and disabled:
          what you are declining is the point, and hiding it would leave a bare
          strikethrough to judge the decision by. They are not `aria-hidden`
          either, for the same reason — `disabled` already announces them as
          unavailable, whereas hiding them told a screen-reader user the one
          thing this block exists to say. */}
      <div
        className={
          // 60%, not 40%: the point is to show WHAT is being declined, and
          // 40% composites the labels past unreadable (locked in
          // lib/contrast.test.ts, along with what a field's own `opacity-50`
          // then did inside this one). The dashed
          // border, the struck title and the "Left out" sentence carry the
          // state; the opacity only needs to recede it.
          row.skip ? "pointer-events-none select-none opacity-60" : undefined
        }
      >
        {/* Two tracks, matching the Course / Save-as grid below. NOT four:
          `lg:` is a viewport breakpoint and this grid lives in a fixed-width
          sheet, so a wide screen bought nothing and split the sheet's ~576px
          into 119px fields — narrower than the date they hold. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            aria-label={`${title}: Name`}
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={locked}
            // Not on a skipped row: `rowsValid` counts only included rows, so this
            // blocked nothing — it just put danger ink under a struck-through,
            // disabled field whose border reads disabled, not error.
            error={
              !row.skip && row.name.trim() === "" ? "Required" : undefined
            }
          />
          <DateField
            label="Date"
            aria-label={`${title}: Date`}
            value={row.startDate}
            onChange={(iso) => onChange({ startDate: iso })}
            disabled={locked}
          />
          {/* Always, not only for a row the parser dated twice. Conditional,
              it gave one row in twelve a fifth field and wrapped that row's
              Venue onto a second grid line, breaking the Date column a
              reviewer scans down — and it left no way to make a row multi-day
              when the parser missed its day heading. */}
          <DateField
            label="Ends"
            hint="Blank for one day."
            aria-label={`${title}: Ends`}
            value={row.endDate}
            onChange={(iso) => onChange({ endDate: iso })}
            min={row.startDate}
            disabled={locked}
          />
          <Input
            label="Starts at"
            aria-label={`${title}: Starts at`}
            type="time"
            value={row.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            disabled={locked}
          />
          <Input
            label="Venue"
            aria-label={`${title}: Venue`}
            value={row.venue}
            onChange={(e) => onChange({ venue: e.target.value })}
            disabled={locked}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* `htmlFor`/`id` as well as the `aria-label`: the label carried
                neither and wrapped nothing, so clicking the word "Course"
                focused nothing at all. The name was fine; the affordance was
                not. */}
            <label
              htmlFor={`${rowId}-course`}
              className="text-sm font-medium text-gray-700"
            >
              Course
            </label>
            <Select
              id={`${rowId}-course`}
              value={row.course}
              onValueChange={(v) => onChange({ course: v })}
              disabled={locked}
              aria-label={`${title}: Course`}
              options={[
                { value: "", label: "Not set" },
                { value: "LCM", label: "Long course (50 m)" },
                { value: "SCM", label: "Short course (25 m)" },
              ]}
            />
            {/* The suggestion states its REASON and stays a button: the programme
              proves the pool, but a person still decides (§4.2). */}
            {row.course === "" && suggestion && (
              <button
                type="button"
                onClick={() => onChange({ course: suggestion.course })}
                disabled={locked}
                // `text-xs`, not `2xs` — that token is documented for
                // micro-labels (chart annotations), not interactive copy — and
                // a real height, because CLAUDE.md names this as how the
                // multi-meet path resolves an unset course, and it was the
                // smallest tap target on a twelve-row review.
                className="tap inline-flex items-center self-start rounded-lg py-1 text-left text-xs text-brand-600 outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {suggestion.reason} — use{" "}
                {suggestion.course === "SCM" ? "short" : "long"} course
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor={`${rowId}-target`}
              className="text-sm font-medium text-gray-700"
            >
              Save as
            </label>
            <Select
              id={`${rowId}-target`}
              value={row.target}
              onValueChange={(v) => onChange({ target: v })}
              disabled={locked}
              aria-label={`${title}: Save as`}
              options={[
                { value: "", label: "A new meet" },
                // Dated, as the single-meet picker is: this is the screen
                // built for a club's whole season, where "HAS 2nd Seeded Gala"
                // arrives twice, and the date is the only thing telling them
                // apart on the one control that destroys a programme.
                // `textValue` so typeahead still matches the name.
                ...meets.map((m) => ({
                  value: m._id as string,
                  label: `Replace — ${m.name} (${formatMeetDates(m)})`,
                  textValue: m.name,
                })),
              ]}
            />
            {/* Only claim the match when there IS one. `target` is whatever
                is selected, not what the auto-match found, so after a coach
                picks another fixture or edits the row's name — which is what
                this screen is for — the sentence asserted a fact nothing
                checked. */}
            {target && (
              <p className="text-xs text-ink-muted">
                <Info aria-hidden className="mr-1 inline size-3" />
                {normaliseMeetName(target.name) ===
                  normaliseMeetName(row.name) &&
                target.startDate === row.startDate
                  ? "Same name and date — this replaces its programme"
                  : "This replaces its programme"}
                {target.eventCount > 0 &&
                  ` (${target.eventCount} events today)`}
                .
              </p>
            )}
          </div>
        </div>
      </div>

      {draft.warnings.length > 0 && !saved && !row.skip && (
        <ul className="flex flex-col gap-1 text-xs text-ink-muted">
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {saved && outcome.status === "saved" && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-success-ink">
          <Check aria-hidden className="size-3.5" />
          {outcome.created ? "Added" : "Programme replaced"} —{" "}
          {outcome.eventCount} event{outcome.eventCount === 1 ? "" : "s"}
        </p>
      )}
      {outcome.status === "skipped" && (
        <p className="text-xs font-medium text-ink-muted">
          Left out of this import.
        </p>
      )}
      {outcome.status === "failed" && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger-ink">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          {outcome.message}
        </p>
      )}
    </li>
  );
}
