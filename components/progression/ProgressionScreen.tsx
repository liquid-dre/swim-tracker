"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Flag, LineChart as LineChartIcon, Search, Users, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import {
  CountBadge,
  FilterBar,
  toolbarButtonClass,
} from "@/components/ui/FilterBar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TargetTierToggle } from "@/components/qualifying/TargetTierToggle";
import { trailForHref } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { formatTime, type Course, type Stroke, type Tier } from "@/lib/swim";
import { EventFilter } from "@/components/analysis/EventFilter";
import { type EventValue } from "@/components/analysis/EventPicker";
import { ProgressionChart } from "./ProgressionChart";

/*
  Progression view (Step 7, BRD §5.6). One swimmer OR a group (squad or ad-hoc
  multi-select) + an event. The chart plots every logged swim over time on a
  zero-anchored y-axis so a faster time sits lower; one line per swimmer for a group.
  On LCM the chart overlays the applicable L2/L3/SANJ cuts for the swimmer's
  exact age (Step 10, §4.9); SCM shows none.
*/

// One line per swimmer stops being legible past a dozen; cap selection to match
// the server read (analysis.ts MAX_SERIES).
const MAX_SELECTION = 12;

type Mode = "one" | "group";
// The chart either extends a time-to-qualify forecast (§5.6) or shows a clean
// historic record with no projection line. Coaches asked for the latter to read
// a swimmer's raw track record in an event without the forecast in the way.
type ChartView = "projection" | "history";

type PickerRow = {
  _id: Id<"swimmers">;
  name: string;
  age: number;
  squads: { _id: string; name: string }[];
};

export function ProgressionScreen() {
  const pathname = usePathname();
  // Role-scoped list: a coach charts any swimmer (with squad tools); a viewer
  // charts only their linked swimmer(s) — still one-vs-group, but with no squad
  // concepts. Never fire the coach-only listSwimmers/listSquads for a viewer.
  const profile = useCurrentProfile();
  const role = profile?.role;
  const isViewer = role === "VIEWER";
  const coachSwimmers = useQuery(
    api.swimmers.listSwimmers,
    role !== undefined && !isViewer ? {} : "skip",
  );
  const viewerData = useQuery(
    api.swimmers.listForProfile,
    isViewer ? {} : "skip",
  );
  const squads = useQuery(
    api.squads.listSquads,
    role !== undefined && !isViewer ? {} : "skip",
  );
  const events = useQuery(api.events.listActiveEvents, {});

  const swimmers = useMemo<PickerRow[] | undefined>(() => {
    if (role === undefined) return undefined;
    if (isViewer) {
      return viewerData?.swimmers.map((s) => ({
        _id: s._id,
        name: s.name,
        age: s.age,
        squads: [],
      }));
    }
    return coachSwimmers;
  }, [role, isViewer, viewerData, coachSwimmers]);

  const [mode, setMode] = useState<Mode>("one");
  // The projection needs one cut to aim at, so it owns its target tier locally
  // (default SANJ — the hardest, so the line reaches the furthest goal).
  const [projectionTier, setProjectionTier] = useState<Tier>("SANJ");
  // History (every logged swim + the cuts, no forecast) is the default view —
  // the honest, unembellished read; Projection is opt-in.
  const [chartView, setChartView] = useState<ChartView>("history");
  // Training-note markers (§R16) — on by default so a single swimmer's phases
  // are discoverable, but toggleable since they're a secondary, quiet overlay.
  const [showNotes, setShowNotes] = useState(true);
  const [singleId, setSingleId] = useState<Id<"swimmers"> | "">("");
  const [groupIds, setGroupIds] = useState<Id<"swimmers">[]>([]);
  const [squadFilter, setSquadFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });

  const selectedIds: Id<"swimmers">[] =
    mode === "one" ? (singleId === "" ? [] : [singleId]) : groupIds;

  const eventComplete =
    event.distance !== null && event.stroke !== null && event.course !== null;
  const ready = eventComplete && selectedIds.length > 0;

  const data = useQuery(
    api.analysis.getProgression,
    ready
      ? {
          swimmerIds: selectedIds,
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          course: event.course as Course,
        }
      : "skip",
  );

  // Swimmers shown in the group picker: squad filter + name search.
  const shown = useMemo(() => {
    if (!swimmers) return [];
    const needle = search.trim().toLowerCase();
    return swimmers.filter((s) => {
      const inSquad =
        squadFilter === "ALL" || s.squads.some((sq) => sq._id === squadFilter);
      const inSearch = !needle || s.name.toLowerCase().includes(needle);
      return inSquad && inSearch;
    });
  }, [swimmers, squadFilter, search]);

  function toggle(id: Id<"swimmers">) {
    setGroupIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_SELECTION
          ? prev
          : [...prev, id],
    );
  }

  function addSquad(squadId: string) {
    if (squadId === "ALL" || !swimmers) return;
    const members = swimmers
      .filter((s) => s.squads.some((sq) => sq._id === squadId))
      .map((s) => s._id);
    setGroupIds((prev) => {
      const next = [...prev];
      for (const id of members) {
        if (!next.includes(id) && next.length < MAX_SELECTION) next.push(id);
      }
      return next;
    });
  }

  const atCap = groupIds.length >= MAX_SELECTION;
  const series = data?.series ?? [];
  const withData = series.filter((s) => s.points.length > 0);
  const single = withData.length === 1;

  // Training-note markers (§R16): only for a single charted swimmer. The read is
  // role-scoped server-side (a viewer sees only their own linked swimmer's notes).
  const singleSwimmerId = single
    ? (withData[0].swimmerId as Id<"swimmers">)
    : null;
  const notesData = useQuery(
    api.trainingNotes.getSwimmerTrainingNotes,
    singleSwimmerId ? { swimmerId: singleSwimmerId } : "skip",
  );
  const noteMarkers = useMemo(
    () =>
      (notesData?.notes ?? []).map((n) => ({
        noteDate: n.noteDate,
        focus: n.focus,
        scopeLabel: n.scopeLabel,
      })),
    [notesData],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Progression"
        breadcrumb={trailForHref(pathname)}
        description="Chart every logged time for one swimmer or a group. Faster times sit lower and the axis zooms to just under the world record, so improvement reads as a descent toward the cut."
      />

      {/* Slim toolbar: who + event inline. The group builder lives in a popover
          so the chart stays the hero. */}
      <FilterBar
        primary={
          <>
            <Segmented
              ariaLabel="One swimmer or a group"
              value={mode}
              onChange={(m) => setMode(m)}
              options={[
                { value: "one", label: "One swimmer" },
                { value: "group", label: "Group" },
              ]}
            />
            {mode === "one" ? (
              <div className="w-56">
                <Select
                  aria-label="Swimmer"
                  placeholder={
                    swimmers === undefined ? "Loading swimmers…" : "Select a swimmer"
                  }
                  value={singleId}
                  onValueChange={(v) => setSingleId(v as Id<"swimmers">)}
                  disabled={swimmers === undefined}
                  options={(swimmers ?? []).map((s) => ({
                    value: s._id,
                    label: `${s.name} · ${s.age}`,
                  }))}
                />
              </div>
            ) : (
              <GroupPopover
                shown={shown}
                selected={groupIds}
                onToggle={toggle}
                onClear={() => setGroupIds([])}
                search={search}
                onSearch={setSearch}
                squadFilter={squadFilter}
                onSquadFilter={setSquadFilter}
                squads={squads ?? []}
                onAddSquad={addSquad}
                atCap={atCap}
                loading={swimmers === undefined}
              />
            )}
            <EventFilter events={events} value={event} onChange={setEvent} />
          </>
        }
      />

      {/* Results */}
      {!ready ? (
        <EmptyState
          title={
            selectedIds.length === 0 ? "Choose who to chart" : "Pick an event"
          }
          body={
            selectedIds.length === 0
              ? "Select a swimmer or build a group above, then choose an event to see the trajectory."
              : "Select a distance, stroke and course above to plot the times."
          }
        />
      ) : data === undefined ? (
        <ChartSkeleton />
      ) : withData.length === 0 ? (
        <EmptyState
          title="No swims for this event"
          body={`Nothing has been logged for the ${data.event.label} (${data.event.course}) for ${
            selectedIds.length === 1 ? "this swimmer" : "these swimmers"
          } yet. Log a time, or pick another event.`}
        />
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-sm font-semibold text-ink">
              {data.event.label} · {data.event.course}
            </h2>
            <div className="flex items-center gap-3">
              {single && noteMarkers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNotes((v) => !v)}
                  aria-pressed={showNotes}
                  className={
                    "inline-flex h-11 lg:h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
                    (showNotes
                      ? "border-brand-200 bg-brand-50 text-brand-600"
                      : "border-gray-200 bg-white text-ink-muted hover:bg-surface-2")
                  }
                >
                  <Flag className="size-3.5" strokeWidth={2} />
                  Training notes
                </button>
              )}
              <p className="text-xs text-ink-faint">Lower = faster</p>
            </div>
          </div>

          {single && <SingleSummary series={withData[0]} />}

          {/* Projection control (§5.6) — single swimmer on LCM only, since the
              qualifying cuts it projects toward are long-course only (§4.9).
              Projections are coach-only (docs/access-control.md), so the server
              tells us via canSeeProjections whether to show the control at all. */}
          {single && data.event.course === "LCM" && data.canSeeProjections && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-surface-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {chartView === "projection"
                    ? "Project time to qualify"
                    : "Historic record"}
                </p>
                <p className="text-xs text-ink-muted">
                  {chartView === "projection"
                    ? "Extend the recent meet trend toward a target cut."
                    : "Every logged swim and the qualifying cuts — no forecast."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  ariaLabel="Chart view"
                  value={chartView}
                  onChange={(v) => setChartView(v)}
                  options={[
                    { value: "projection", label: "Projection" },
                    { value: "history", label: "History" },
                  ]}
                />
                {chartView === "projection" && (
                  <TargetTierToggle
                    value={projectionTier}
                    onChange={setProjectionTier}
                  />
                )}
              </div>
            </div>
          )}

          <ProgressionChart
            series={withData}
            single={single}
            distance={data.event.distance}
            stroke={data.event.stroke}
            course={data.event.course}
            standards={data.standards}
            projectionTier={
              chartView === "projection" &&
              single &&
              data.event.course === "LCM" &&
              data.canSeeProjections
                ? projectionTier
                : null
            }
            noteMarkers={single && showNotes ? noteMarkers : undefined}
          />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-swimmer summary strip
// ---------------------------------------------------------------------------

function SingleSummary({
  series,
}: {
  series: { pbTimeMs: number | null; points: { isMeet: boolean }[] };
}) {
  const swims = series.points.length;
  const meets = series.points.filter((p) => p.isMeet).length;
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-1.5 text-ink-muted">
        <dt>PB</dt>
        <dd className="time tnum font-medium text-ink">
          {series.pbTimeMs !== null ? formatTime(series.pbTimeMs) : "—"}
        </dd>
      </div>
      <Divider />
      <div className="flex items-center gap-1.5 text-ink-muted">
        <dt>Swims</dt>
        <dd className="tnum font-medium text-ink">{swims}</dd>
      </div>
      <Divider />
      <div className="flex items-center gap-1.5 text-ink-muted">
        <dt>Meets</dt>
        <dd className="tnum font-medium text-ink">{meets}</dd>
      </div>
    </dl>
  );
}

function Divider() {
  return <span aria-hidden className="h-3.5 w-px bg-border" />;
}

// ---------------------------------------------------------------------------
// Group picker (inside a toolbar popover)
// ---------------------------------------------------------------------------

type GroupPickerProps = {
  shown: { _id: Id<"swimmers">; name: string; age: number }[];
  selected: Id<"swimmers">[];
  onToggle: (id: Id<"swimmers">) => void;
  onClear: () => void;
  search: string;
  onSearch: (v: string) => void;
  squadFilter: string;
  onSquadFilter: (v: string) => void;
  squads: { _id: Id<"squads">; name: string }[];
  onAddSquad: (squadId: string) => void;
  atCap: boolean;
  loading: boolean;
};

function GroupPopover(props: GroupPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={toolbarButtonClass}
          aria-label={`Choose swimmers, ${props.selected.length} selected`}
        >
          <Users className="size-4 text-ink-faint" strokeWidth={1.75} />
          Swimmers
          <CountBadge count={props.selected.length} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <GroupPicker {...props} />
      </PopoverContent>
    </Popover>
  );
}

function GroupPicker({
  shown,
  selected,
  onToggle,
  onClear,
  search,
  onSearch,
  squadFilter,
  onSquadFilter,
  squads,
  onAddSquad,
  atCap,
  loading,
}: GroupPickerProps) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          aria-label="Search swimmers"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search swimmers"
          className="h-11 lg:h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
        />
      </div>

      {/* Squad filter + bulk-add — a coach concept; hidden when there are no
          squads (e.g. a viewer, who only ever sees their own linked swimmers). */}
      {squads.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <Select
              aria-label="Filter by squad"
              value={squadFilter}
              onValueChange={(v) => onSquadFilter(v)}
              options={[
                { value: "ALL", label: "All squads" },
                ...squads.map((s) => ({ value: s._id, label: s.name })),
              ]}
            />
          </div>

          <div className="flex-1">
            <Select
              aria-label="Add a whole squad"
              placeholder="Add squad…"
              value=""
              onValueChange={(v) => onAddSquad(v)}
              options={squads.map((s) => ({ value: s._id, label: s.name }))}
            />
          </div>
        </div>
      )}

      {/* Checkbox list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 custom-scrollbar">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-ink-muted">
            Loading swimmers…
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-muted">
            No swimmers match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map((s) => {
              const checked = selectedSet.has(s._id);
              const disabled = !checked && atCap;
              return (
                <li key={s._id}>
                  <label
                    className={
                      "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 " +
                      (disabled ? "cursor-not-allowed opacity-50" : "")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggle(s._id)}
                      className="size-4 rounded border-gray-300 text-brand-500 accent-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="ml-auto text-xs text-ink-faint tabular-nums">
                      {s.age}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selection summary */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-ink-muted">
          {selected.length === 0
            ? "No swimmers selected"
            : `${selected.length} of ${MAX_SELECTION} selected`}
          {atCap && (
            <span className="text-ink-faint"> · limit reached for a legible chart</span>
          )}
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// States + bits
// ---------------------------------------------------------------------------

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <LineChartIcon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="h-[26rem] animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
      aria-busy
    />
  );
}
