"use client";

import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, ListChecks, Pencil, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatSeconds, formatShortDate } from "@/lib/format";
import {
  MEET_QUALIFYING_PRESETS,
  ageBandLabel,
  dayBefore,
  describeMeetQualifyingBasis,
  findMeetQualifyingPreset,
  tableEvents,
  type MeetCut,
} from "@/lib/meetQualifying";
import { notify } from "@/lib/notify";
import { eventLabel, formatTime, type Distance, type Stroke } from "@/lib/swim";
import { cn } from "@/lib/utils";

/*
  Who has qualified for THIS meet, by its own published table
  (lib/meetQualifying.ts) — e.g. the HAS Championships' per-age entry times.

  One component, both audiences, because it is one question:
    * a family sees their own swimmer(s), event by event — "which races can I
      enter, and how far off am I in the rest";
    * a coach sees their club, qualified swimmers first, one row each, with the
      event-by-event read a click away.

  Renders nothing on a meet with no table (the normal case). The super-user
  attaches one from here, so meet setup stays on the meet's own page.
*/

type EventVerdict = {
  distance: Distance;
  stroke: Stroke;
  cutMs: number | null;
  bestMs: number | null;
  bestDate: string | null;
  bestMeetName: string | null;
  met: boolean;
  gapMs: number | null;
};

type SwimmerVerdict = {
  swimmerId: Id<"swimmers">;
  name: string;
  gender: "M" | "F";
  exactAge: number;
  metCount: number;
  events: EventVerdict[];
};

export function MeetQualifying({
  meetId,
  meetStartDate,
  canEdit,
}: {
  meetId: Id<"meets">;
  meetStartDate: string;
  /** The super-user: may attach, change or remove the table. */
  canEdit: boolean;
}) {
  const table = useQuery(api.meetQualifying.getMeetQualifyingTable, { meetId });
  const result = useQuery(api.meetQualifying.getMeetQualifiers, { meetId });
  const remove = useMutation(api.meetQualifying.removeMeetQualifying);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (table === undefined || result === undefined) {
    // Holds the section's place while loading, so the programme below does
    // not jump down when the verdicts arrive.
    return <div aria-hidden className="h-24 animate-pulse rounded-2xl bg-gray-100" />;
  }

  const sheet = canEdit && (
    <QualifyingTableSheet
      key={sheetOpen ? "open" : "closed"}
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      meetId={meetId}
      meetStartDate={meetStartDate}
      current={
        table === null
          ? null
          : { presetKey: table.presetKey, qualifyingFrom: table.qualifyingFrom }
      }
    />
  );

  if (table === null) {
    if (!canEdit) return null;
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-300 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Qualifying times</h2>
          <p className="text-sm text-ink-muted">
            This meet has no entry standards. Add them if it publishes its own,
            and coaches and families will see who qualified.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)}>
          <ListChecks className="size-4" aria-hidden />
          Add qualifying times
        </Button>
        {sheet}
      </section>
    );
  }

  const basis = describeMeetQualifyingBasis(
    { course: table.course, qualifyingFrom: table.qualifyingFrom },
    meetStartDate,
  );

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="meet-qualifying">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="meet-qualifying" className="text-sm font-semibold text-ink">
            Qualifying times
          </h2>
          <p className="text-sm text-ink-muted">{table.title}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)}>
              <Pencil className="size-4" aria-hidden />
              Change
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRemove(true)}
              aria-label="Remove qualifying times"
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          </div>
        )}
      </div>

      {/* The basis, said once — the same job `QualifyingBasis` does for the
          galas: a coach comparing this to an all-time PB must be able to see
          why the two differ. */}
      <p className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-muted">
        {basis}
      </p>

      {result === null || result.swimmers.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white px-5 py-6 text-center text-sm text-ink-muted shadow-theme-sm">
          {result?.viewer
            ? "No swimmer is linked to your account yet."
            : "There are no active swimmers to check yet."}
        </p>
      ) : result.viewer ? (
        <div className="flex flex-col gap-3">
          {result.swimmers.map((s) => (
            <ViewerCard key={s.swimmerId} swimmer={s} />
          ))}
        </div>
      ) : (
        <CoachTable swimmers={result.swimmers} />
      )}

      <PublishedTimes cuts={table.cuts} />

      {sheet}
      {canEdit && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Remove the qualifying times?"
          description="Coaches and families will stop seeing who qualified for this meet. No swim is changed, and you can add the table again at any time."
          confirmLabel="Remove"
          onConfirm={async () => {
            await remove({ meetId });
            notify.success("Qualifying times removed");
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A family's view — one card per linked swimmer
// ---------------------------------------------------------------------------

function ViewerCard({ swimmer }: { swimmer: SwimmerVerdict }) {
  const total = swimmer.events.filter((e) => e.cutMs !== null).length;
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">
          {swimmer.name}
          <span className="ml-2 font-normal text-ink-muted">
            Age {swimmer.exactAge} on day 1
          </span>
        </h3>
        <p
          className={cn(
            "text-sm tabular-nums",
            swimmer.metCount > 0 ? "font-medium text-success-ink" : "text-ink-muted",
          )}
        >
          {swimmer.metCount === 0
            ? "Not qualified in any event yet"
            : `Qualified in ${swimmer.metCount} of ${total} events`}
        </p>
      </div>
      <EventTable events={swimmer.events} />
    </div>
  );
}

/** Event | qualifying time | best this season | verdict. */
function EventTable({ events }: { events: EventVerdict[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-2xs font-semibold uppercase tracking-wide text-ink-faint">
            <th scope="col" className="px-3 py-2 font-semibold sm:px-4">Event</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">
              <span className="sm:hidden">Cut</span>
              <span className="hidden sm:inline">Qualifying time</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">
              <span className="sm:hidden">Best</span>
              <span className="hidden sm:inline">Best this season</span>
            </th>
            <th scope="col" className="px-3 py-2 font-semibold sm:px-4">
              <span className="sr-only">Result</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map((e) => (
            <tr key={`${e.distance}-${e.stroke}`}>
              <th scope="row" className="whitespace-nowrap px-3 py-2.5 sm:px-4 text-left font-medium text-ink">
                {eventLabel(e.distance, e.stroke)}
              </th>
              <td className="whitespace-nowrap px-3 py-2.5 sm:px-4 text-right tabular-nums text-ink-muted">
                {e.cutMs === null ? "—" : formatTime(e.cutMs)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sm:px-4 text-right tabular-nums text-ink">
                {e.bestMs === null ? (
                  <span className="text-ink-faint">—</span>
                ) : (
                  <>
                    {formatTime(e.bestMs)}
                    {/* Where it was swum: the first thing a coach checks
                        when a verdict surprises them. */}
                    {e.bestDate && (
                      <span className="hidden text-xs text-ink-faint sm:block">
                        {e.bestMeetName ? `${e.bestMeetName}, ` : ""}
                        {formatShortDate(e.bestDate)}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                <Verdict event={e} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Never colour-only: every state is a word. */
function Verdict({ event }: { event: EventVerdict }) {
  if (event.cutMs === null) {
    return <span className="text-ink-faint">No cut for this age</span>;
  }
  if (event.met) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-success-ink">
        <Check className="size-3.5" aria-hidden />
        Qualified
      </span>
    );
  }
  if (event.gapMs === null) {
    return <span className="text-ink-faint">No long-course meet swim</span>;
  }
  return (
    <span className="tabular-nums text-ink-muted">{formatSeconds(event.gapMs)}s off</span>
  );
}

// ---------------------------------------------------------------------------
// A coach's view — the club, qualified swimmers first
// ---------------------------------------------------------------------------

type Filter = "QUALIFIED" | "ALL";

function CoachTable({ swimmers }: { swimmers: SwimmerVerdict[] }) {
  const qualified = swimmers.filter((s) => s.metCount > 0);
  const [filter, setFilter] = useState<Filter>(qualified.length > 0 ? "QUALIFIED" : "ALL");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = filter === "QUALIFIED" ? qualified : swimmers;
  const swims = qualified.reduce((n, s) => n + s.metCount, 0);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <p className="text-sm tabular-nums text-ink-muted">
          <span className="font-medium text-ink">
            {qualified.length} of {swimmers.length} swimmers
          </span>{" "}
          qualified, across {swims} {swims === 1 ? "event" : "events"}
        </p>
        <Segmented<Filter>
          ariaLabel="Which swimmers to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "QUALIFIED", label: `Qualified (${qualified.length})` },
            { value: "ALL", label: `Everyone (${swimmers.length})` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">
          Nobody has a qualifying time yet. Switch to Everyone to see who is closest.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-2 font-semibold">Swimmer</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Age</th>
                <th scope="col" className="px-4 py-2 font-semibold">Qualified in</th>
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => {
                const isOpen = open.has(s.swimmerId);
                const detailId = `q-${s.swimmerId}`;
                return (
                  <Fragment key={s.swimmerId}>
                    <tr className="align-top">
                      <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-ink">
                        {/* The name opens the detail too: a far bigger
                            target than the chevron, poolside on a phone. */}
                        <button
                          type="button"
                          onClick={() => toggle(s.swimmerId)}
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          className="rounded text-left outline-none hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {s.name}
                        </button>
                      </th>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                        {s.exactAge}
                      </td>
                      <td className="px-4 py-2.5">
                        <QualifiedSummary swimmer={s} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(s.swimmerId)}
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          aria-label={`${isOpen ? "Hide" : "Show"} every event for ${s.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-gray-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring touch:size-11"
                        >
                          <ChevronDown
                            className={cn(
                              "size-4 transition-transform motion-reduce:transition-none",
                              isOpen && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={detailId}>
                        <td colSpan={4} className="bg-gray-50 p-0">
                          <EventTable events={s.events} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** "100 Free · 200 IM", or — when there is none — how close the nearest is. */
function QualifiedSummary({ swimmer }: { swimmer: SwimmerVerdict }) {
  const met = swimmer.events.filter((e) => e.met);
  if (met.length > 0) {
    return (
      <span className="text-ink">
        {met.map((e, i) => (
          <Fragment key={`${e.distance}-${e.stroke}`}>
            {i > 0 && " · "}
            <span className="whitespace-nowrap">{eventLabel(e.distance, e.stroke)}</span>
          </Fragment>
        ))}
      </span>
    );
  }
  const nearest = swimmer.events
    .filter((e) => e.gapMs !== null)
    .sort((a, b) => a.gapMs! - b.gapMs!)[0];
  if (nearest === undefined) {
    return <span className="text-ink-faint">No long-course meet swims this season</span>;
  }
  return (
    <span className="text-ink-muted">
      None yet · closest {eventLabel(nearest.distance, nearest.stroke)},{" "}
      <span className="tabular-nums">{formatSeconds(nearest.gapMs!)}s</span> off
    </span>
  );
}

// ---------------------------------------------------------------------------
// The published grid, for anyone who wants to read the source
// ---------------------------------------------------------------------------

function PublishedTimes({ cuts }: { cuts: ReadonlyArray<MeetCut> }) {
  const [gender, setGender] = useState<"F" | "M">("F");
  const events = useMemo(() => tableEvents(cuts), [cuts]);
  const columns = useMemo(() => {
    const seen = new Map<string, Pick<MeetCut, "age" | "band">>();
    for (const c of cuts) {
      if (c.gender === gender) seen.set(`${c.band}|${c.age}`, c);
    }
    return [...seen.values()].sort((a, b) => a.age - b.age);
  }, [cuts, gender]);

  function cutFor(distance: Distance, stroke: Stroke, col: Pick<MeetCut, "age" | "band">) {
    return cuts.find(
      (c) =>
        c.gender === gender &&
        c.distance === distance &&
        c.stroke === stroke &&
        c.age === col.age &&
        c.band === col.band,
    );
  }

  return (
    <details className="group min-w-0 rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        The published qualifying times
        <ChevronDown
          className="size-4 text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3">
        <div className="self-start">
          <Segmented<"F" | "M">
            ariaLabel="Girls or boys"
            value={gender}
            onChange={setGender}
            options={[
              { value: "F", label: "Girls" },
              { value: "M", label: "Boys" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 pr-4 font-semibold">Event</th>
                {columns.map((col) => (
                  <th key={`${col.band}${col.age}`} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                    {ageBandLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((e) => (
                <tr key={`${e.distance}-${e.stroke}`}>
                  <th scope="row" className="whitespace-nowrap py-2 pr-4 text-left font-medium text-ink">
                    {eventLabel(e.distance, e.stroke)}
                  </th>
                  {columns.map((col) => {
                    const cut = cutFor(e.distance, e.stroke, col);
                    return (
                      <td key={`${col.band}${col.age}`} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-muted">
                        {cut ? formatTime(cut.timeMs) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Super-user: attach or change the table
// ---------------------------------------------------------------------------

function QualifyingTableSheet({
  open,
  onOpenChange,
  meetId,
  meetStartDate,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetId: Id<"meets">;
  meetStartDate: string;
  current: { presetKey: string | null; qualifyingFrom: string | null } | null;
}) {
  const apply = useMutation(api.meetQualifying.applyMeetQualifyingPreset);
  const [presetKey, setPresetKey] = useState(
    current?.presetKey ?? MEET_QUALIFYING_PRESETS[0]?.key ?? "",
  );
  const preset = findMeetQualifyingPreset(presetKey);
  const [from, setFrom] = useState(current?.qualifyingFrom ?? preset?.defaultFrom ?? "");
  const [saving, setSaving] = useState(false);
  const lastDay = dayBefore(meetStartDate);
  const fromError = from !== "" && from > lastDay ? "Pick a day before the meet starts." : undefined;

  async function onSave() {
    if (preset === null || fromError) return;
    setSaving(true);
    try {
      await notify.promise(
        apply({ meetId, presetKey, qualifyingFrom: from || undefined }),
        { loading: "Saving qualifying times…", success: "Qualifying times saved" },
      );
      onOpenChange(false);
    } catch {
      // notify.promise has already shown the server's message.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Qualifying times</SheetTitle>
          <SheetDescription>
            Use this meet&rsquo;s own entry standards. Swimmers qualify on their
            fastest official meet swim from the day you pick to the day before
            the meet. The meet itself, time trials and practice swims never count.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mq-preset" className="text-sm font-medium text-ink">
              Published table
            </label>
            <Select
              id="mq-preset"
              size="md"
              value={presetKey}
              onValueChange={(key) => {
                setPresetKey(key);
                const next = findMeetQualifyingPreset(key);
                if (next) setFrom(next.defaultFrom);
              }}
              options={MEET_QUALIFYING_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            />
            {preset && (
              <p className="text-xs text-ink-muted">
                {preset.course === "LCM" ? "Long course" : "Short course"} ·{" "}
                {tableEvents(preset.cuts).length} events · ages{" "}
                {ageBandLabel(preset.cuts[0])} to {ageBandLabel(preset.cuts[preset.cuts.length - 1])}
              </p>
            )}
          </div>
          <DateField
            label="Swims count from"
            value={from}
            onChange={setFrom}
            max={lastDay}
            hint={`Up to ${formatShortDate(lastDay)}, the day before the meet.`}
            error={fromError}
          />
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || preset === null || !!fromError}>
            {current ? "Save changes" : "Add qualifying times"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
