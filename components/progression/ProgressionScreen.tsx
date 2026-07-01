"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { LineChart as LineChartIcon, Search, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { TargetTierToggle } from "@/components/qualifying/TargetTierToggle";
import { useTargetTier } from "@/lib/useTargetTier";
import { trailForHref } from "@/lib/nav";
import { formatTime, type Course, type Stroke } from "@/lib/swim";
import { EventPicker, type EventValue } from "@/components/analysis/EventPicker";
import { ProgressionChart } from "./ProgressionChart";

/*
  Progression view (Step 7, BRD §5.6). One swimmer OR a group (squad or ad-hoc
  multi-select) + an event. The chart plots every logged swim over time with an
  inverted y-axis so improvement reads upward; one line per swimmer for a group.
  On LCM the chart overlays the applicable L2/L3/SANJ cuts for the swimmer's
  exact age (Step 10, §4.9); SCM shows none.
*/

// One line per swimmer stops being legible past a dozen; cap selection to match
// the server read (analysis.ts MAX_SERIES).
const MAX_SELECTION = 12;

type Mode = "one" | "group";

export function ProgressionScreen() {
  const swimmers = useQuery(api.swimmers.listSwimmers, {});
  const squads = useQuery(api.squads.listSquads, {});
  const events = useQuery(api.events.listActiveEvents, {});

  const [mode, setMode] = useState<Mode>("one");
  const [projectionTier, setProjectionTier] = useTargetTier();
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Progression"
        breadcrumb={trailForHref("/progression")}
        description="Chart every logged time for one swimmer or a group. The axis is inverted, so faster times sit higher and improvement reads as a climb."
      />

      {/* Who */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Who</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              A single swimmer, or a group to compare trajectories.
            </p>
          </div>
          <Segmented
            ariaLabel="One swimmer or a group"
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: "one", label: "One swimmer" },
              { value: "group", label: "Group" },
            ]}
          />
        </div>

        <div className="mt-4">
          {mode === "one" ? (
            <SwimmerSelect
              swimmers={(swimmers ?? []).map((s) => ({
                _id: s._id,
                name: s.name,
                age: s.age,
              }))}
              value={singleId}
              onChange={setSingleId}
              loading={swimmers === undefined}
            />
          ) : (
            <GroupPicker
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
        </div>
      </section>

      {/* Event */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <h2 className="text-sm font-semibold text-ink">Event</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Distance, stroke and course. A course is required.
        </p>
        <div className="mt-4">
          <EventPicker events={events} value={event} onChange={setEvent} />
        </div>
      </section>

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
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">
              {data.event.label} · {data.event.course}
            </h2>
            <p className="text-xs text-ink-faint">Higher = faster</p>
          </div>

          {single && <SingleSummary series={withData[0]} />}

          {/* Projection control (§5.6) — single swimmer on LCM only, since the
              qualifying cuts it projects toward are long-course only (§4.9). */}
          {single && data.event.course === "LCM" && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-surface-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  Project time to qualify
                </p>
                <p className="text-xs text-ink-muted">
                  Extend the recent meet trend toward a target cut.
                </p>
              </div>
              <TargetTierToggle
                value={projectionTier}
                onChange={setProjectionTier}
              />
            </div>
          )}

          <ProgressionChart
            series={withData}
            single={single}
            course={data.event.course}
            standards={data.standards}
            projectionTier={
              single && data.event.course === "LCM" ? projectionTier : null
            }
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
// One-swimmer select
// ---------------------------------------------------------------------------

function SwimmerSelect({
  swimmers,
  value,
  onChange,
  loading,
}: {
  swimmers: { _id: Id<"swimmers">; name: string; age: number }[];
  value: Id<"swimmers"> | "";
  onChange: (v: Id<"swimmers">) => void;
  loading: boolean;
}) {
  return (
    <div className="relative max-w-sm">
      <select
        aria-label="Swimmer"
        value={value}
        onChange={(e) => onChange(e.target.value as Id<"swimmers">)}
        disabled={loading}
        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-9 text-base text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50"
      >
        <option value="" disabled>
          {loading ? "Loading swimmers…" : "Select a swimmer"}
        </option>
        {swimmers.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name} · {s.age}
          </option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group picker
// ---------------------------------------------------------------------------

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
}: {
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
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[12rem] flex-1">
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
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
          />
        </div>

        {/* Filter list by squad */}
        <div className="relative">
          <select
            aria-label="Filter by squad"
            value={squadFilter}
            onChange={(e) => onSquadFilter(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
          >
            <option value="ALL">All squads</option>
            {squads.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <Chevron small />
        </div>

        {/* Add a whole squad at once */}
        {squads.length > 0 && (
          <div className="relative">
            <select
              aria-label="Add a whole squad"
              value=""
              onChange={(e) => {
                onAddSquad(e.target.value);
                e.currentTarget.value = "";
              }}
              className="h-9 appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-700 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
            >
              <option value="">Add squad…</option>
              {squads.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Chevron small />
          </div>
        )}
      </div>

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

function Chevron({ small }: { small?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={
        "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-ink-faint " +
        (small ? "right-2.5" : "right-3")
      }
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}
