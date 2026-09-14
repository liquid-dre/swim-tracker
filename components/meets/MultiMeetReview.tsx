"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { notify } from "@/lib/notify";
import { normaliseMeetName } from "@/lib/meets";
import type { MeetDraft } from "@/lib/meetImport";
import type { Course } from "@/lib/swim";
import { courseMismatches } from "./programmeEditing";

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
  startTime: string;
  venue: string;
  /** "" = not chosen yet. Never pre-filled from the programme (§4.2). */
  course: string;
  /** "" = create a new meet; otherwise the id of the meet to replace. */
  target: string;
};

type RowOutcome =
  | { status: "pending" }
  | { status: "saved"; created: boolean; eventCount: number }
  | { status: "failed"; message: string };

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
function impliedCourse(draft: MeetDraft): { course: Course; reason: string } | null {
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
        : (byKey.get(`${normaliseMeetName(draft.name)}|${draft.startDate}`) ?? null);
  }, [meets]);

  const [rows, setRows] = useState<RowEdits[]>(() =>
    drafts.map((d) => ({
      name: d.name,
      startDate: d.startDate ?? "",
      startTime: d.startTime ?? "",
      venue: d.venue ?? "",
      course: "",
      target: matchFor(d)?._id ?? "",
    })),
  );
  const [outcomes, setOutcomes] = useState<RowOutcome[]>(() =>
    drafts.map(() => ({ status: "pending" })),
  );
  const [allowNoCourse, setAllowNoCourse] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState(false);

  const suggestions = useMemo(() => drafts.map(impliedCourse), [drafts]);

  function patchRow(i: number, patch: Partial<RowEdits>) {
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  /** Accept every course this workbook's own events can prove. */
  function acceptAllSuggestions() {
    setRows((prev) =>
      prev.map((r, i) =>
        r.course === "" && suggestions[i] !== null
          ? { ...r, course: suggestions[i]!.course }
          : r,
      ),
    );
  }

  const suggestable = suggestions.filter(
    (s, i) => s !== null && rows[i].course === "",
  ).length;
  const missingCourse = rows.filter((r) => r.course === "").length;
  const rowsValid = rows.every((r) => r.name.trim() !== "" && ISO.test(r.startDate));
  const canImport =
    !importing && !finished && rowsValid && (missingCourse === 0 || allowNoCourse);

  async function runAll() {
    if (!canImport) return;
    setImporting(true);
    const next: RowOutcome[] = [...outcomes];
    let saved = 0;

    // Sequential, not parallel: each row is an independent decision and a
    // failure part-way through must leave the rows before it committed and say
    // exactly which one stopped — not abandon a half-written season with no
    // record of what landed.
    for (let i = 0; i < rows.length; i += 1) {
      if (next[i].status === "saved") continue; // a retry skips what already landed
      const row = rows[i];
      try {
        const res = await importMeet({
          meetId: row.target ? (row.target as Id<"meets">) : undefined,
          name: row.name.trim(),
          startDate: row.startDate,
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
            err instanceof Error ? err.message : "That meet could not be saved.",
        };
      }
      setOutcomes([...next]);
    }

    setImporting(false);
    setFinished(next.every((o) => o.status === "saved"));
    const failed = next.filter((o) => o.status === "failed").length;
    if (failed === 0) {
      notify.success(`${saved} meet${saved === 1 ? "" : "s"} imported`);
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
          Check each one below, then import them together. Nothing is saved until
          you do.
        </p>
      </div>

      {/* Course is the one field with real downstream consequences, so it gets
          its own summary line and a single control for the whole workbook. */}
      {missingCourse > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm">
          <p className="text-warning-700">
            <AlertTriangle aria-hidden className="mr-1.5 inline size-4" />
            {missingCourse} meet{missingCourse === 1 ? " has" : "s have"} no
            course set. A meet without one cannot take times.
          </p>
          {suggestable > 0 && (
            <Button variant="secondary" size="sm" onClick={acceptAllSuggestions}>
              Use suggested course for {suggestable}
            </Button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {drafts.map((draft, i) => (
          <MeetRow
            key={i}
            draft={draft}
            row={rows[i]}
            suggestion={suggestions[i]}
            outcome={outcomes[i]}
            target={meets.find((m) => m._id === rows[i].target) ?? null}
            meets={meets}
            disabled={importing}
            onChange={(patch) => patchRow(i, patch)}
          />
        ))}
      </ul>

      {missingCourse > 0 && (
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-gray-300 text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
            checked={allowNoCourse}
            onChange={(e) => setAllowNoCourse(e.target.checked)}
            disabled={importing}
          />
          <span>
            Save the {missingCourse} meet{missingCourse === 1 ? "" : "s"} without
            a course. They will show &ldquo;Not set&rdquo; and cannot take times
            until one is chosen on the meet itself.
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={runAll}
          disabled={!canImport}
          loading={importing}
        >
          {finished
            ? "Imported"
            : `Import ${drafts.length} meet${drafts.length === 1 ? "" : "s"}`}
        </Button>
        {!rowsValid && (
          <span className="text-sm text-ink-muted">
            Every meet needs a name and a date.
          </span>
        )}
      </div>
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
  onChange,
}: {
  draft: MeetDraft;
  row: RowEdits;
  suggestion: { course: Course; reason: string } | null;
  outcome: RowOutcome;
  target: ExistingMeet | null;
  meets: ExistingMeet[];
  disabled: boolean;
  onChange: (patch: Partial<RowEdits>) => void;
}) {
  const saved = outcome.status === "saved";

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-theme-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-ink">
          {row.name.trim() === "" ? "Untitled meet" : row.name}
        </p>
        <span className="shrink-0 text-xs text-ink-faint tabular-nums">
          {draft.events.length === 0
            ? "No events yet"
            : `${draft.events.length} events`}
        </span>
      </div>

      {/* Two tracks on a phone, four on a laptop: the fields are short and
          belong together, and a one-per-row stack would make twelve meets an
          endless scroll. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Input
          label="Name"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={disabled || saved}
          error={row.name.trim() === "" ? "Required" : undefined}
        />
        <DateField
          label="Date"
          aria-label={`${row.name} date`}
          value={row.startDate}
          onChange={(iso) => onChange({ startDate: iso })}
          disabled={disabled || saved}
        />
        <Input
          label="Starts at"
          type="time"
          value={row.startTime}
          onChange={(e) => onChange({ startTime: e.target.value })}
          disabled={disabled || saved}
        />
        <Input
          label="Venue"
          value={row.venue}
          onChange={(e) => onChange({ venue: e.target.value })}
          disabled={disabled || saved}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Course</label>
          <Select
            value={row.course}
            onValueChange={(v) => onChange({ course: v })}
            disabled={disabled || saved}
            aria-label={`${row.name} course`}
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
              disabled={disabled || saved}
              className="self-start rounded-sm text-left text-2xs text-brand-500 outline-none hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion.reason} — use{" "}
              {suggestion.course === "SCM" ? "short" : "long"} course
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Save as</label>
          <Select
            value={row.target}
            onValueChange={(v) => onChange({ target: v })}
            disabled={disabled || saved}
            aria-label={`${row.name} target`}
            options={[
              { value: "", label: "A new meet" },
              ...meets.map((m) => ({
                value: m._id as string,
                label: `Replace ${m.name}`,
              })),
            ]}
          />
          {target && (
            <p className="text-2xs text-ink-faint">
              <Info aria-hidden className="mr-1 inline size-3" />
              Same name and date — this replaces its programme
              {target.eventCount > 0 && ` (${target.eventCount} events today)`}.
            </p>
          )}
        </div>
      </div>

      {draft.warnings.length > 0 && !saved && (
        <ul className="flex flex-col gap-1 text-2xs text-ink-muted">
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {saved && outcome.status === "saved" && (
        <p className="flex items-center gap-1.5 text-2xs font-medium text-success-600">
          <Check aria-hidden className="size-3.5" />
          {outcome.created ? "Added" : "Programme replaced"} —{" "}
          {outcome.eventCount} event{outcome.eventCount === 1 ? "" : "s"}
        </p>
      )}
      {outcome.status === "failed" && (
        <p className="flex items-start gap-1.5 text-2xs font-medium text-error-600">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          {outcome.message}
        </p>
      )}
    </li>
  );
}
