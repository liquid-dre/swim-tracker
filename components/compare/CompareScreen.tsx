"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { trailForHref } from "@/lib/nav";
import { formatTime, type Course, type Stroke, type Tier } from "@/lib/swim";
import { formatShortDate, formatSeconds } from "@/lib/format";
import { EventFilter } from "@/components/analysis/EventFilter";
import { type EventValue } from "@/components/analysis/EventPicker";
import {
  ComparisonBarChart,
  ComparisonTierLegend,
  type ComparisonCut,
} from "./ComparisonBarChart";

/*
  Comparison view (Step 7, BRD §5.5). Pick an event (distance + stroke + course —
  course required, §4.8), optionally filter by gender and exact age, and see every
  swimmer's headline MEET PB as a sortable leaderboard and a horizontal bar chart.
  Fastest first.

  Step 10 overlay (LCM only, §4.9): pin one exact age + gender to draw the
  L2/L3/SANJ cuts as vertical threshold lines; on "all ages" the lines are
  suppressed and every bar is coloured by the hardest tier its PB meets. Standards
  are exact-single-year (never the two-year band) and long-course only.
*/

type GenderFilter = "ALL" | "M" | "F";
type AgeFilter = "ALL" | number;
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
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("ALL");
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
        }
      : "skip",
  );

  // Every matching row (one gender filter applied server-side). Exact-age
  // filtering is client-side so the age menu can list only the ages present.
  const allRows = useMemo(() => data?.rows ?? [], [data]);

  const ages = useMemo(
    () => [...new Set(allRows.map((r) => r.age))].sort((a, b) => a - b),
    [allRows],
  );

  // A stale age (e.g. after switching gender) falls back to "all ages".
  const effectiveAge: AgeFilter =
    ageFilter !== "ALL" && ages.includes(ageFilter) ? ageFilter : "ALL";

  const rows = useMemo(
    () =>
      effectiveAge === "ALL"
        ? allRows
        : allRows.filter((r) => r.age === effectiveAge),
    [allRows, effectiveAge],
  );

  // Vertical cut lines: LCM, one pinned exact age AND one gender (a single cut
  // is only unambiguous then — cuts differ by both). Uses the exact-age resolver.
  const isLcm = event.course === "LCM";
  const showLines = isLcm && effectiveAge !== "ALL" && gender !== "ALL";
  const applicable = useQuery(
    api.standards.getApplicableStandards,
    showLines && complete
      ? {
          gender: gender as "M" | "F",
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          age: effectiveAge as number,
        }
      : "skip",
  );

  const cuts: ComparisonCut[] = useMemo(() => {
    if (!showLines || !applicable) return [];
    const out: ComparisonCut[] = [];
    (["LEVEL_2", "LEVEL_3", "SANJ"] as const).forEach((tier) => {
      const timeMs = applicable[tier];
      if (timeMs !== undefined) out.push({ tier, timeMs });
    });
    return out;
  }, [showLines, applicable]);

  const barTiers: Tier[] = useMemo(
    () =>
      [...new Set(rows.map((r) => r.highestTier).filter((t): t is Tier => t !== null))],
    [rows],
  );

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

      {/* Slim toolbar: event inline; gender + age behind the Filters popover. */}
      <FilterBar
        primary={<EventFilter events={events} value={event} onChange={setEvent} />}
        filters={
          complete ? (
            <>
              <FilterField label="Gender">
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
              </FilterField>
              <FilterField label="Age">
                <Select
                  aria-label="Filter by exact age"
                  value={effectiveAge === "ALL" ? "ALL" : String(effectiveAge)}
                  onValueChange={(v) =>
                    setAgeFilter(v === "ALL" ? "ALL" : Number(v))
                  }
                  options={[
                    { value: "ALL", label: "All ages" },
                    ...ages.map((a) => ({ value: String(a), label: `Age ${a}` })),
                  ]}
                />
              </FilterField>
            </>
          ) : undefined
        }
        filterCount={
          complete
            ? (effectiveAge !== "ALL" ? 1 : 0) + (gender !== "ALL" ? 1 : 0)
            : 0
        }
        onClear={() => {
          setAgeFilter("ALL");
          setGender("ALL");
        }}
      />

      {!complete ? (
        <EmptyState
          title="Pick an event to compare"
          body="Choose a distance, stroke and course in the toolbar. A course is required — you can’t rank short-course and long-course times together."
        />
      ) : data === undefined ? (
        <ResultsSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
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
                <ComparisonBarChart
                  rows={sorted}
                  cuts={showLines ? cuts : []}
                  overlay={isLcm}
                />
                {isLcm && (barTiers.length > 0 || (effectiveAge !== "ALL" && !showLines)) && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
                    <ComparisonTierLegend tiers={barTiers} />
                    {effectiveAge !== "ALL" && !showLines && (
                      <p className="text-xs text-ink-faint">
                        Pick a gender to draw the cut lines for age {effectiveAge}.
                      </p>
                    )}
                  </div>
                )}
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
      <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
