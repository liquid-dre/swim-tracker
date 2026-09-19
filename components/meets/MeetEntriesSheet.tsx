"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";
import { GALA_FULL } from "@/lib/galas";
import {
  DAY_NOT_LISTED,
  MEET_GENDER_LABEL,
  formatMeetDay,
  genderAllowsSwimmer,
} from "@/lib/meets";
import { EntryRosterTable, type EntryRow } from "./EntryRosterTable";

/*
  Sign swimmers up for one event, and record what they went.

  Deliberately a sheet over the meet rather than a page of its own: a coach
  typing up results moves down the programme event by event, and a navigation
  per event would be thirty round trips through a page they already had open.

  One subscription (`getMeetSignups`) feeds both this and the Swimmers column on
  the programme behind it, so opening a different event costs nothing and the
  count on the row updates the moment a swimmer is added here.
*/

export function MeetEntriesSheet({
  meetId,
  lineId,
  onOpenChange,
}: {
  meetId: Id<"meets">;
  /** The programme line being worked on; null closes the sheet. */
  lineId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const signups = useQuery(api.meetEntries.getMeetSignups, { meetId });
  const roster = useQuery(api.swimmers.listSwimmers, { activeOnly: true });
  const addEntries = useMutation(api.meetEntries.addEntries);
  const removeEntry = useMutation(api.meetEntries.removeEntry);
  const setEntryDay = useMutation(api.meetEntries.setEntryDay);
  const recordEntryTime = useMutation(api.meetEntries.recordEntryTime);

  const [search, setSearch] = useState("");
  const [squadFilter, setSquadFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const line = signups?.lines.find((l) => l.lineId === lineId) ?? null;
  const days = signups?.days ?? [];
  // The programme moved after these swimmers were entered. Counted here so the
  // sheet says it once at the top rather than leaving it to be discovered by
  // scrolling a thirty-row roster.
  const mismatchedDays = (line?.entries ?? []).filter(
    (e) => e.dayMismatch !== null,
  ).length;
  const sheetNotice: { text: string; tone: "warn" | "muted" } | null =
    signups !== undefined && !signups.courseKnown
      ? {
          tone: "warn",
          text: "This meet has no course set, so times can't be recorded yet. A time in the wrong pool can never be compared with anything. Set it on the meet's Details tab.",
        }
      : line !== null && !line.resolved
        ? {
            tone: "muted",
            text: "This isn't an event the app tracks, so no time can be recorded against it. A relay time belongs to the team.",
          }
        : mismatchedDays > 0
          ? {
              tone: "warn",
              text: `${
                mismatchedDays === 1
                  ? "One swimmer is still entered for a different day"
                  : `${mismatchedDays} swimmers are still entered for a different day`
              } than the programme now swims this event on. Their rows say which, and move them in one click.`,
            }
          : null;
  const entered = useMemo(
    () => new Set((line?.entries ?? []).map((e) => String(e.swimmerId))),
    [line],
  );

  const squads = useMemo(() => {
    const byId = new Map<string, string>();
    for (const swimmer of roster ?? []) {
      for (const squad of swimmer.squads) byId.set(squad._id, squad.name);
    }
    return [...byId].map(([_id, name]) => ({ _id, name }));
  }, [roster]);

  // Who can still be added: this coach's own swimmers, of the event's category,
  // not already on the sheet. A swimmer excluded by the event's category is
  // left out rather than shown disabled — the sex scope is a fact about the
  // race, not a state of theirs to be explained on every row.
  const candidates = useMemo(() => {
    if (roster === undefined || line === null) return [];
    const needle = search.trim().toLowerCase();
    return roster.filter(
      (s) =>
        s.editable &&
        !entered.has(String(s._id)) &&
        genderAllowsSwimmer(line.gender ?? undefined, s.gender) &&
        (squadFilter === "" || s.squads.some((q) => q._id === squadFilter)) &&
        (needle === "" || s.name.toLowerCase().includes(needle)),
    );
  }, [roster, line, entered, search, squadFilter]);

  const [selected, setSelected] = useState<Id<"swimmers">[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<EntryRow | null>(null);

  /**
   * Whether the add-picker is open. `null` = nobody has said, so it follows the
   * event: an event with NOBODY entered exists to be filled, and making that
   * first add a second click would be worse than the crowding this collapse
   * exists to fix. Once somebody is entered the roster is the thing you came
   * for, so the picker folds away and the list takes the panel.
   */
  const [addOpenChoice, setAddOpenChoice] = useState<boolean | null>(null);
  const addOpen = addOpenChoice ?? entered.size === 0;

  // Everything in this sheet is about ONE event, so a new event starts clean.
  // Without this a selection made on event 101 and never committed is still
  // sitting in the picker when event 103 is opened, one click from entering
  // three swimmers in the wrong race.
  //
  // Done during render rather than in an effect: this is React's "adjust state
  // when a prop changes" pattern, which re-renders before anything is painted —
  // an effect would show one frame of the previous event's selection first.
  const [lastLineId, setLastLineId] = useState(lineId);
  if (lineId !== lastLineId) {
    setLastLineId(lineId);
    setSelected([]);
    setSearch("");
    setSquadFilter("");
    setAddOpenChoice(null);
  }

  function toggle(id: Id<"swimmers">) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onAdd() {
    if (selected.length === 0 || lineId === null || adding) return;
    setAdding(true);
    try {
      const result = await notify.promise(
        addEntries({ meetId, lineId, swimmerIds: selected }),
        {
          loading: "Adding swimmers…",
          success: (r) =>
            r.added === 0
              ? "Everyone selected was already entered"
              : `${r.added === 1 ? "1 swimmer" : `${r.added} swimmers`} entered`,
        },
      );
      if (result.added > 0) {
        setSelected([]);
        setSearch("");
        // Hand the panel back to the roster: the swimmers just added are now in
        // it, and seeing them land is the confirmation that the toast only
        // describes. `null` rather than `false` so the rule above decides.
        setAddOpenChoice(null);
      }
    } catch {
      // notify.promise has already surfaced the server's own message.
    } finally {
      setAdding(false);
    }
  }

  async function run<T>(
    entryId: string,
    work: Promise<T>,
    loading: string,
    success: string,
  ) {
    setBusyId(entryId);
    try {
      await notify.promise(work, { loading, success });
    } catch {
      // notify.promise has already surfaced the server's own message.
    } finally {
      setBusyId(null);
    }
  }

  const title = line === null ? "Event" : line.label;

  return (
    <Sheet open={lineId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>
            {line?.eventNumber !== null && line?.eventNumber !== undefined
              ? `Event ${line.eventNumber} · ${title}`
              : title}
          </SheetTitle>
          <SheetDescription>
            {line === null
              ? "Loading this event."
              : // The DAY belongs in the description on a multi-day meet: it is
                // what every swimmer added here is dated with, and a coach
                // working down thirty events should be able to see that
                // without opening the day column on each row.
                `${line.rawLabel}${
                  line.gender ? ` · ${MEET_GENDER_LABEL[line.gender]}` : ""
                }${
                  days.length > 1
                    ? ` · ${
                        line.day !== null && days[line.day - 1] !== undefined
                          ? formatMeetDay(
                              { startDate: days[0], endDate: days[days.length - 1] },
                              line.day,
                            )
                          : DAY_NOT_LISTED
                      }`
                    : ""
                }`}
          </SheetDescription>
        </SheetHeader>

        {/* The body does NOT scroll. Exactly one thing in this panel does — the
            entered roster — so it can take every pixel the banners and the add
            control leave behind. Scrolling here as well (which this sheet used
            to do) is what let a ~400px add block push the roster out of view;
            SquadMembersSheet has always been arranged this way. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-2">
          {/* ONE banner, ranked, for the same reason the programme editor has
              one strip: three full-width warning cards of equal weight above a
              roster say nothing about which to act on. Blocking first — no
              course means no time can be recorded at all — then the line being
              untimeable, then the entries that merely need moving. */}
          {sheetNotice !== null && (
            <p
              className={
                "shrink-0 rounded-xl px-3 py-2 text-sm " +
                (sheetNotice.tone === "warn"
                  ? "border border-warning-500/30 bg-warning-50 text-warning-ink"
                  : "border border-gray-200 bg-gray-50 text-ink-muted")
              }
            >
              {sheetNotice.text}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <EntryRosterTable
              rows={(line?.entries ?? []).map((e) => ({
                ...e,
                _id: String(e._id),
                resultId: e.resultId === null ? null : String(e.resultId),
              }))}
              days={days}
              courseKnown={signups?.courseKnown ?? false}
              resolved={line?.resolved ?? false}
              busyId={busyId}
              onRecordTime={(entryId, timeInput) =>
                run(
                  entryId,
                  recordEntryTime({
                    entryId: entryId as Id<"meetEntries">,
                    timeInput,
                  }).then((r) => {
                    // Same distinction the log form makes: only `newlyMetGala` is
                    // a qualification. A cut beaten outside the window is said
                    // plainly as the near-miss it is (§4.9).
                    if (r.newlyMetGala !== null) {
                      notify.success(
                        `That time qualifies for ${GALA_FULL[r.newlyMetGala]}.`,
                      );
                    } else if (r.cutBeatenOutsideWindow !== null) {
                      notify.success(
                        `That time is under the ${GALA_FULL[r.cutBeatenOutsideWindow]} cut, but was swum outside this season's qualifying window.`,
                      );
                    }
                    return r;
                  }),
                  "Saving time…",
                  "Time saved",
                )
              }
              onSetDay={(entryId, swimDate) =>
                run(
                  entryId,
                  setEntryDay({
                    entryId: entryId as Id<"meetEntries">,
                    swimDate,
                  }),
                  "Moving…",
                  "Day changed",
                )
              }
              onRemove={(entryId) =>
                setConfirmRemove(
                  (line?.entries ?? [])
                    .map((e) => ({
                      ...e,
                      _id: String(e._id),
                      resultId: e.resultId === null ? null : String(e.resultId),
                    }))
                    .find((e) => e._id === entryId) ?? null,
                )
              }
            />
          </div>

          {/* Below the roster, and closed by default once anyone is entered:
              adding is the occasional job, reading who is in is the constant
              one. `shrink-0` so opening it squeezes the roster rather than
              itself — open, the picker IS the task. */}
          <Collapsible
            open={addOpen}
            onOpenChange={setAddOpenChoice}
            className="shrink-0 rounded-xl border border-gray-200 bg-white"
          >
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex-1 text-left">Add swimmers</span>
              {!addOpen && roster !== undefined && (
                <span className="text-xs font-normal tabular-nums text-ink-faint">
                  {candidates.length === 0
                    ? "none available"
                    : `${candidates.length} available`}
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={`size-4 shrink-0 text-ink-faint transition-transform [transition-duration:var(--dur-1)] ${
                  addOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>

            <CollapsibleContent className="flex flex-col gap-3 px-3 pb-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[10rem] flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    type="search"
                    aria-label="Find a swimmer"
                    placeholder="Find a swimmer"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-2 text-sm text-gray-800 lg:h-9 placeholder:text-gray-500 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
                  />
                </div>
                {squads.length > 0 && (
                  <Select
                    aria-label="Filter by squad"
                    value={squadFilter}
                    onValueChange={setSquadFilter}
                    size="sm"
                    options={[
                      { value: "", label: "Any squad" },
                      ...squads.map((q) => ({ value: q._id, label: q.name })),
                    ]}
                  />
                )}
              </div>

              {roster === undefined ? (
                <p className="text-sm text-ink-muted">Loading the roster…</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {entered.size > 0
                    ? "Everyone who can swim this event is already entered."
                    : "No swimmer matches. Check the search, or the squad filter."}
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {candidates.map((swimmer) => (
                    <li key={swimmer._id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors [transition-duration:var(--dur-1)] hover:bg-accent hover:text-primary">
                        <input
                          type="checkbox"
                          checked={selected.includes(swimmer._id)}
                          onChange={() => toggle(swimmer._id)}
                          className="size-4 rounded border-gray-300 text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span className="min-w-0 flex-1">{swimmer.name}</span>
                        <span className="tabular-nums text-xs text-ink-faint">
                          {swimmer.age}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* The counter and the Add button belong to the picker, so they come
            and go with it. A closed picker leaving a permanently disabled
            "Add to this event" in the footer would read as something broken. */}
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-border">
          {addOpen && selected.length > 0 && (
            <p className="mr-auto text-xs text-ink-muted">
              {selected.length === 1
                ? "1 swimmer"
                : `${selected.length} swimmers`}{" "}
              selected
            </p>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          {addOpen && (
            <Button
              loading={adding}
              disabled={selected.length === 0}
              onClick={onAdd}
            >
              Add to this event
            </Button>
          )}
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(next) => !next && setConfirmRemove(null)}
        title="Take this swimmer off the event?"
        description={
          <>
            {confirmRemove?.name} comes off {title}. Their other events are not
            affected, and you can add them back at any time.
          </>
        }
        confirmLabel="Take off event"
        onConfirm={async () => {
          const target = confirmRemove;
          setConfirmRemove(null);
          if (target === null) return;
          await run(
            target._id,
            removeEntry({ entryId: target._id as Id<"meetEntries"> }),
            "Removing…",
            `${target.name} taken off`,
          );
        }}
      />
    </Sheet>
  );
}
