"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GALA_FULL, GALA_ORDER, type GalaCode } from "@/lib/galas";
import { errorMessage, notify } from "@/lib/notify";
import type { MeetEvent } from "@/lib/meets";
import type { Course } from "@/lib/swim";
import { ProgrammeEditor } from "./ProgrammeEditor";
import { validateLines } from "./programmeEditing";

/*
  Add or edit one meet (super-user only; convex/meets.ts enforces that regardless
  of what this component renders).

  Two tabs, because a meet is two different kinds of fact. DETAILS is the
  fixture — a name, dates, a venue, which pool. EVENTS is its programme, and
  editing it here is for the meets that have no importable document and for the
  corrections an import cannot make; importing a real gala's own PDF is still
  the fast path and lives on its own button.

  Course PRE-SELECTS long course when adding, rather than opening on "Not set".
  A default the person sees and can change before saving is their decision; the
  importer still never guesses one, because a course inferred from silence is
  how a swim ends up filed in the wrong pool with nothing to flag it.
*/

/** Matches MAX_SPAN_DAYS in convex/meets.ts. */
const MAX_SPAN_DAYS = 31;

/** `iso` + n days, as ISO. Returns "" for an unparseable start. */
function addDays(iso: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type EditableMeet = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  course: Course | null;
  galaCode: GalaCode | null;
  events: MeetEvent[];
};

export function MeetForm({
  open,
  onOpenChange,
  today,
  meet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Absent = add a new meet. Present = edit that one. */
  meet?: EditableMeet;
}) {
  const createMeet = useMutation(api.meets.createMeet);
  const updateMeet = useMutation(api.meets.updateMeet);
  const editing = meet !== undefined;

  const [name, setName] = useState(meet?.name ?? "");
  const [startDate, setStartDate] = useState(meet?.startDate ?? today);
  const [endDate, setEndDate] = useState(meet?.endDate ?? "");
  const [venue, setVenue] = useState(meet?.venue ?? "");
  // Adding: open on long course. Editing: show what is stored, including the
  // "Not set" a meet imported before anyone chose one still legitimately has.
  const [course, setCourse] = useState<string>(
    meet === undefined ? "LCM" : (meet.course ?? ""),
  );
  const [galaCode, setGalaCode] = useState<string>(meet?.galaCode ?? "");
  const [events, setEvents] = useState<MeetEvent[]>(meet?.events ?? []);
  const [tab, setTab] = useState("details");
  // The line the blocked reason is about, so the footer can take the coach to
  // it instead of naming an event number they then have to hunt for.
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Set when the server refuses because the edit would clear sign-ups; holds
  // the refusal's own wording so the confirmation says exactly what it costs.
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Sign-ups per line, across EVERY club — the super-user owns the programme,
  // so the warning beside a line has to match the refusal the server would
  // raise, which counts every club's entries and not just one's.
  const counts = useQuery(
    api.meetEntries.getLineEntryCounts,
    meet === undefined ? "skip" : { meetId: meet._id },
  );
  // `undefined` means NOT YET KNOWN, and the editor draws that differently
  // from "nobody is entered" — a coach must never see an empty warning slot
  // and read it as permission to delete. A meet being CREATED is known
  // immediately: it cannot have sign-ups, so it gets an empty map, not a wait.
  const entryCounts = useMemo(() => {
    if (meet === undefined) return new Map<string, number>();
    if (counts === undefined) return undefined;
    return new Map(counts.map((c) => [c.lineId, c.entered]));
  }, [counts, meet]);

  // A meet that runs one day has no end date at all — "same as the start" and
  // "not set" must not be two ways of saying the same thing (the server drops a
  // matching end date for the same reason).
  const multiDay = endDate !== "" && endDate !== startDate;
  // The server caps a meet at 31 days (a typo'd end year is not a 3-year gala).
  // The picker enforces the same bound so the rule is visible, not discovered
  // by being rejected after filling the form in.
  const latestEnd = addDays(startDate, MAX_SPAN_DAYS);
  const datesValid =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    (endDate === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate));
  const programmeProblem = validateLines(
    events,
    (course || null) as Course | null,
  );
  const valid = name.trim() !== "" && datesValid && programmeProblem === null;
  const blockedReason =
    name.trim() === ""
      ? "Enter a meet name."
      : !datesValid
        ? "Check the dates: an end date cannot be before the start."
        : (programmeProblem?.message ?? null);

  // Building a forty-line programme by hand is an hour's work, and this sheet
  // is keyed on its open state, so closing it throws that away. Anything the
  // coach has changed therefore has to be worth asking about before it goes.
  const dirty =
    name !== (meet?.name ?? "") ||
    startDate !== (meet?.startDate ?? today) ||
    endDate !== (meet?.endDate ?? "") ||
    venue !== (meet?.venue ?? "") ||
    course !== (meet === undefined ? "LCM" : (meet.course ?? "")) ||
    galaCode !== (meet?.galaCode ?? "") ||
    JSON.stringify(events) !== JSON.stringify(meet?.events ?? []);

  function requestClose(next: boolean) {
    if (next) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  async function onSave(allowDroppingEntries?: boolean) {
    if (!valid || saving) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      startDate,
      endDate: multiDay ? endDate : undefined,
      venue: venue.trim() || undefined,
      course: (course || undefined) as Course | undefined,
      galaCode: (galaCode || undefined) as GalaCode | undefined,
      events,
    };
    try {
      await notify.promise(
        editing
          ? updateMeet({ meetId: meet._id, ...fields, allowDroppingEntries })
          : createMeet(fields),
        {
          loading: editing ? "Saving meet…" : "Adding meet…",
          success: editing ? "Meet saved" : "Meet added",
        },
      );
      setDropWarning(null);
      onOpenChange(false);
    } catch (error) {
      // Removing an event somebody is entered for is a real thing to want to
      // do, so the refusal is an offer rather than a dead end: it is re-asked
      // as a confirmation carrying the server's own count. A line whose entry
      // has a RECORDED TIME is refused outright and never reaches here.
      const message = errorMessage(error);
      if (message.includes("signed up for")) setDropWarning(message);
      // notify.promise has already surfaced the server's own message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      {/* No `onPointerDownOutside` guard: swallowing the click would make the
          overlay silently inert. The dismissal is allowed to reach
          `requestClose`, which asks before discarding anything. */}
      <SheetContent className="flex w-full flex-col sm:max-w-2xl" side="right">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit meet" : "Add a meet"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "The fixture and its programme."
              : "Add a fixture to the season calendar, and list what is being swum."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-1">
          <Tabs
            ariaLabel="Meet"
            value={tab}
            onValueChange={setTab}
            items={[
              {
                value: "details",
                label: "Details",
                content: (
                  <div className="flex flex-col gap-4 pt-4">
                    <Input
                      id="meet-name"
                      label="Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="HAS 1st Seeded Gala 2026"
                      maxLength={120}
                    />

                    <DateField
                      id="meet-start"
                      label="Starts"
                      value={startDate}
                      onChange={setStartDate}
                    />

                    <DateField
                      id="meet-end"
                      label="Ends"
                      hint="Leave blank for a one-day meet."
                      value={endDate}
                      onChange={setEndDate}
                      min={startDate}
                      max={latestEnd}
                    />

                    <Input
                      id="meet-venue"
                      label="Venue"
                      hint="Optional."
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="Les Brown Pool"
                      maxLength={120}
                    />

                    <SelectField
                      id="meet-course"
                      label="Course"
                      hint="Leave unset if you don't know. A guessed course would compare times against the wrong table."
                    >
                      <Select
                        id="meet-course"
                        value={course}
                        onValueChange={setCourse}
                        size="md"
                        options={[
                          { value: "", label: "Not set" },
                          { value: "LCM", label: "Long course (50 m)" },
                          { value: "SCM", label: "Short course (25 m)" },
                        ]}
                      />
                    </SelectField>

                    <SelectField
                      id="meet-gala"
                      label="Gala tour"
                      hint="Marks this meet as a championship's tour. A label only — the qualifying screens still read the tour date set in Admin › Galas."
                    >
                      <Select
                        id="meet-gala"
                        value={galaCode}
                        onValueChange={setGalaCode}
                        size="md"
                        options={[
                          { value: "", label: "Not a gala tour" },
                          ...GALA_ORDER.map((code) => ({
                            value: code,
                            label: GALA_FULL[code],
                          })),
                        ]}
                      />
                    </SelectField>
                  </div>
                ),
              },
              {
                value: "events",
                // The badge counts events, always, because "1 problem" and "1
                // event" are indistinguishable in a pill. That a problem exists
                // is carried by the label instead, which is a channel a count
                // cannot compete for.
                label:
                  programmeProblem === null ? "Events" : "Events · needs a fix",
                badge: events.length,
                content: (
                  <div className="pt-4">
                    <ProgrammeEditor
                      lines={events}
                      course={(course || null) as Course | null}
                      onChange={setEvents}
                      entryCounts={entryCounts}
                      problem={programmeProblem}
                      focusLine={focusLine}
                      onFocused={() => setFocusLine(null)}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-border">
          {/* A blocked save is an error, not a hint: it is announced, inked as
              one, and where the problem is a specific programme line it is the
              way TO that line. `aria-describedby` on the disabled button below
              cannot carry it — a disabled button is not focusable — so the live
              region is how a screen-reader user learns why Save is unavailable. */}
          <p
            id="meet-form-blocked"
            role="status"
            className="mr-auto min-w-0 text-xs text-danger-ink"
          >
            {blockedReason && programmeProblem?.index != null ? (
              <button
                type="button"
                className="text-left underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={() => {
                  setTab("events");
                  setFocusLine(programmeProblem.index);
                }}
              >
                {blockedReason} Go to it.
              </button>
            ) : (
              blockedReason
            )}
          </p>
          <Button variant="ghost" onClick={() => requestClose(false)}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!valid}
            aria-describedby={blockedReason ? "meet-form-blocked" : undefined}
            onClick={() => onSave()}
          >
            {editing ? "Save meet" : "Add meet"}
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard these changes?"
        description={
          // On an EDIT the saved meet is untouched — only the edits go. Saying
          // "this meet's 12 events will be lost" would read as though the
          // stored programme were about to be deleted.
          editing
            ? "Your unsaved changes to this meet will be lost. Nothing already saved is affected."
            : events.length > 0
              ? `The ${events.length === 1 ? "event" : `${events.length} events`} you have listed, and everything else you have entered, will be lost.`
              : "Everything you have entered here will be lost."
        }
        confirmLabel="Discard changes"
        onConfirm={async () => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />

      <ConfirmDialog
        open={dropWarning !== null}
        onOpenChange={(next) => !next && setDropWarning(null)}
        title="Remove those sign-ups?"
        description={
          <>
            <p>{dropWarning}</p>
            <p className="mt-2">
              Their sign-ups go with the events you removed. No recorded time is
              affected &mdash; an event whose swimmers already have times cannot
              be removed at all.
            </p>
          </>
        }
        confirmLabel="Remove sign-ups and save"
        onConfirm={async () => {
          setDropWarning(null);
          await onSave(true);
        }}
      />
    </Sheet>
  );
}

/** A label + hint wrapper for `Select`, which (unlike Input/DateField) has none. */
function SelectField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
