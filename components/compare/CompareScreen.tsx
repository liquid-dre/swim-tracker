"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { trailForHref } from "@/lib/nav";
import { formatTime, DEFAULT_AGE_BANDS, type Course, type Stroke } from "@/lib/swim";
import { formatShortDate, formatSeconds } from "@/lib/format";
import { EventPicker, type EventValue } from "@/components/analysis/EventPicker";
import { ComparisonBarChart } from "./ComparisonBarChart";

/*
  Comparison view (Step 7, BRD §5.5). Pick an event (distance + stroke + course —
  course required, §4.8), optionally filter by gender and age band, and see every
  swimmer's headline MEET PB as a sortable leaderboard and a horizontal bar chart.
  Fastest first. Standards overlays are Step 10 — no qualifying lines here yet.
*/

type GenderFilter = "ALL" | "M" | "F";
type SortField = "time" | "name" | "age";
type SortDir = "asc" | "desc";

export function CompareScreen() {
  const events = useQuery(api.events.listActiveEvents, {});

  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });
  const [gender, setGender] = useState<GenderFilter>("ALL");
  const [ageGroup, setAgeGroup] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const complete =
    event.distance !== null && event.stroke !== null && event.course !== null;

  const data = useQuery(
    api.analysis.getEventComparison,
    complete
      ? {
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          course: event.course as Course,
          gender: gender === "ALL" ? undefined : gender,
          ageGroup: ageGroup === "ALL" ? undefined : ageGroup,
        }
      : "skip",
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      let cmp: number;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "age") cmp = a.age - b.age || a.timeMs - b.timeMs;
      else cmp = a.timeMs - b.timeMs;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortField, sortDir]);

  // Leader time drives the "+x.xx s" gap column — the coach's real question is
  // "how far off the fastest is each swimmer", not the absolute number alone.
  const leaderMs = rows.length > 0 ? Math.min(...rows.map((r) => r.timeMs)) : 0;

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "asc");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comparison"
        breadcrumb={trailForHref("/compare")}
        description="Rank swimmers on one event and course by their fastest meet time. Trials and practice never count."
      />

      {/* Event selection */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <h2 className="text-sm font-semibold text-ink">Event</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Choose a distance, stroke and course to build the leaderboard.
        </p>
        <div className="mt-4">
          <EventPicker events={events} value={event} onChange={setEvent} />
        </div>
      </section>

      {!complete ? (
        <EmptyState
          title="Pick an event to compare"
          body="Select a distance, stroke and course above. A course is required — you can’t rank short-course and long-course times together."
        />
      ) : data === undefined ? (
        <ResultsSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <AgeSelect value={ageGroup} onChange={setAgeGroup} />
            <div className="ml-auto">
              <Segmented
                ariaLabel="Filter by gender"
                value={gender}
                onChange={setGender}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "F", label: "Female" },
                  { value: "M", label: "Male" },
                ]}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No meet times yet"
              body={`No swimmer has a meet time for the ${data.event.label} (${data.event.course}) that matches these filters. Log a meet swim, or widen the filters.`}
            />
          ) : (
            <>
              {/* Chart */}
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">
                    {data.event.label} · {data.event.course}
                  </h2>
                  <p className="text-xs text-ink-faint">Shorter bar = faster</p>
                </div>
                <ComparisonBarChart rows={sorted} />
              </section>

              {/* Leaderboard */}
              <section className="flex flex-col gap-3">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-base">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-6">
                            #
                          </th>
                          <th scope="col" className="px-4 py-2.5 font-medium">
                            <SortHeader
                              label="Swimmer"
                              active={sortField === "name"}
                              dir={sortDir}
                              onClick={() => toggleSort("name")}
                            />
                          </th>
                          <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                            <SortHeader
                              label="Age"
                              active={sortField === "age"}
                              dir={sortDir}
                              onClick={() => toggleSort("age")}
                            />
                          </th>
                          <th scope="col" className="px-4 py-2.5 text-right font-medium">
                            <SortHeader
                              label="Best time"
                              align="right"
                              active={sortField === "time"}
                              dir={sortDir}
                              onClick={() => toggleSort("time")}
                            />
                          </th>
                          <th scope="col" className="hidden px-4 py-2.5 text-right font-medium md:table-cell">
                            Gap
                          </th>
                          <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">
                            Set at
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r, i) => {
                          const gap = r.timeMs - leaderMs;
                          const rank =
                            sortField === "time" && sortDir === "asc" ? i + 1 : null;
                          return (
                            <tr
                              key={r.swimmerId}
                              className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
                            >
                              <td className="px-4 py-3 text-right text-sm text-ink-faint tabular-nums sm:px-6">
                                {rank ?? "·"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                                <Link
                                  href={`/swimmers/${r.swimmerId}`}
                                  className="rounded-sm outline-none hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {r.name}
                                </Link>
                                {!r.active && (
                                  <span className="ml-2 text-xs text-ink-faint">Inactive</span>
                                )}
                              </td>
                              <td className="hidden px-4 py-3 text-ink-muted tabular-nums sm:table-cell">
                                {r.age}
                              </td>
                              <td className="time tnum px-4 py-3 text-right font-medium text-ink">
                                {formatTime(r.timeMs)}
                              </td>
                              <td className="hidden px-4 py-3 text-right text-ink-muted tabular-nums md:table-cell">
                                {gap === 0 ? (
                                  <span className="text-success-ink">Leader</span>
                                ) : (
                                  `+${formatSeconds(gap)}s`
                                )}
                              </td>
                              <td className="hidden max-w-[24ch] truncate px-4 py-3 text-ink-muted lg:table-cell">
                                {formatShortDate(r.swimDate)}
                                {r.meetName ? ` · ${r.meetName}` : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="px-1 text-xs text-ink-faint">
                  {rows.length} {rows.length === 1 ? "swimmer" : "swimmers"} with a meet
                  time for this event.
                </p>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function AgeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        aria-label="Filter by age group"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
      >
        <option value="ALL">All ages</option>
        {DEFAULT_AGE_BANDS.map((b) => (
          <option key={b.label} value={b.label}>
            {b.label}
          </option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "right";
  onClick: () => void;
}) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
      className={
        "inline-flex items-center gap-1 rounded-sm font-medium uppercase tracking-wide outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring " +
        (active ? "text-ink" : "text-gray-500") +
        (align === "right" ? " flex-row-reverse" : "")
      }
    >
      {label}
      <Arrow
        aria-hidden
        className={"size-3 " + (active ? "opacity-100" : "opacity-0")}
        strokeWidth={2.25}
      />
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <BarChart3 aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-9 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
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
