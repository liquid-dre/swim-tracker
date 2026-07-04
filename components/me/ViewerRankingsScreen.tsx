"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { BarChart3 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { formatTime, type Course, type Stroke, type Tier } from "@/lib/swim";
import { formatSeconds, formatShortDate } from "@/lib/format";
import { EventFilter } from "@/components/analysis/EventFilter";
import { type EventValue } from "@/components/analysis/EventPicker";
import {
  ComparisonBarChart,
  ComparisonTierLegend,
  type ComparisonCut,
} from "@/components/compare/ComparisonBarChart";
import { useViewer } from "./ViewerContext";
import { MiniEmpty, ReadOnlyChip } from "./viewerShared";

/*
  Viewer Rankings (/me/rankings, Phase 3 of docs/access-control.md). The
  read-only counterpart to the coach Comparison: any signed-in user may see the
  whole club ranked on one event by fastest MEET time, so a swimmer/parent can
  answer "where do I stand — against my age, older, younger, and across genders".

  It reuses the coach ComparisonBarChart and the public getEventComparison read
  (no DOB/notes — every field here is public). What's viewer-specific: the
  swimmer's OWN linked swimmer(s) are highlighted in the board, a personal
  "you stand" callout surfaces their rank at a glance, and names are plain text
  (a viewer has no swimmer-profile route to link into).
*/

type GenderFilter = "ALL" | "M" | "F";
type AgeFilter = "ALL" | number;

export function ViewerRankingsScreen() {
  const { swimmers, selected } = useViewer();
  const events = useQuery(api.events.listActiveEvents, {});

  // The viewer's own swimmer ids — highlighted in the board so they can find
  // themselves without scanning.
  const mine = useMemo(() => new Set(swimmers.map((s) => s._id)), [swimmers]);

  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });
  const [gender, setGender] = useState<GenderFilter>("ALL");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("ALL");

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

  const allRows = useMemo(() => data?.rows ?? [], [data]);

  const ages = useMemo(
    () => [...new Set(allRows.map((r) => r.age))].sort((a, b) => a - b),
    [allRows],
  );
  const effectiveAge: AgeFilter =
    ageFilter !== "ALL" && ages.includes(ageFilter) ? ageFilter : "ALL";

  // Fastest first — the board is read-only (no interactive sort), so the order
  // is always the ranking that matters.
  const rows = useMemo(() => {
    const filtered =
      effectiveAge === "ALL"
        ? allRows
        : allRows.filter((r) => r.age === effectiveAge);
    return [...filtered].sort(
      (a, b) =>
        a.timeMs - b.timeMs ||
        (a.swimDate < b.swimDate ? -1 : a.swimDate > b.swimDate ? 1 : 0) ||
        a.name.localeCompare(b.name),
    );
  }, [allRows, effectiveAge]);

  const leaderMs = rows.length > 0 ? rows[0].timeMs : 0;

  // The selected swimmer's own standing in the current view — the direct answer
  // to "where do I stand". Null when they have no time here (or are filtered out).
  const myStanding = useMemo(() => {
    const idx = rows.findIndex((r) => r.swimmerId === selected._id);
    if (idx === -1) return null;
    return { rank: idx + 1, total: rows.length, row: rows[idx] };
  }, [rows, selected._id]);

  // Vertical cut lines: LCM, one pinned exact age AND gender (a single line is
  // only unambiguous then). Standards are public reference data.
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
      [
        ...new Set(
          rows.map((r) => r.highestTier).filter((t): t is Tier => t !== null),
        ),
      ],
    [rows],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rankings"
        breadcrumb={[{ label: "Overview", href: "/me" }, { label: "Rankings" }]}
        description="See where you stand. Every swimmer ranked on one event by their fastest meet time, with your own highlighted. Trials and practice never count."
        actions={<ReadOnlyChip tone="onWater" />}
      />

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
        <MiniEmpty
          icon={<BarChart3 aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
          title="Pick an event to see the rankings"
          body="Choose a distance, stroke and course above. Short-course and long-course times are never ranked together."
        />
      ) : data === undefined ? (
        <RankingsSkeleton />
      ) : rows.length === 0 ? (
        <MiniEmpty
          icon={<BarChart3 aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
          title="No meet times yet"
          body={`No swimmer has a meet time for the ${data.event.label} (${data.event.course}) that matches these filters. Try widening them.`}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {myStanding && (
            <StandingCallout
              name={selected.name}
              rank={myStanding.rank}
              total={myStanding.total}
              timeMs={myStanding.row.timeMs}
              gapMs={myStanding.row.timeMs - leaderMs}
            />
          )}

          {/* Chart */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                {data.event.label} · {data.event.course}
              </h2>
              <p className="text-xs text-ink-faint">Shorter bar = faster</p>
            </div>
            <ComparisonBarChart rows={rows} cuts={showLines ? cuts : []} overlay={isLcm} />
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
                        Swimmer
                      </th>
                      <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                        Age
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        Best time
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
                    {rows.map((r, i) => {
                      const gap = r.timeMs - leaderMs;
                      const isMine = mine.has(r.swimmerId);
                      return (
                        <tr
                          key={r.swimmerId}
                          className={
                            "border-t border-border transition-colors [transition-duration:var(--dur-1)] " +
                            (isMine
                              ? "bg-brand-50/60 hover:bg-brand-50"
                              : "hover:bg-surface-2")
                          }
                        >
                          <td className="px-4 py-3 text-right text-sm text-ink-faint tabular-nums sm:px-6">
                            {i + 1}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                            {r.name}
                            {isMine && (
                              <span className="ml-2 rounded-full bg-brand-500 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-white">
                                You
                              </span>
                            )}
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
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Where you stand" callout — the selected swimmer's own rank, up front
// ---------------------------------------------------------------------------

function StandingCallout({
  name,
  rank,
  total,
  timeMs,
  gapMs,
}: {
  name: string;
  rank: number;
  total: number;
  timeMs: number;
  gapMs: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm md:px-5">
      <span className="font-semibold text-brand-500">{name}</span>
      <span className="text-ink-muted">
        ranks{" "}
        <span className="font-semibold text-ink">
          {ordinal(rank)}
        </span>{" "}
        of {total} here
      </span>
      <span aria-hidden className="h-3.5 w-px bg-brand-100" />
      <span className="time tnum font-medium text-ink">{formatTime(timeMs)}</span>
      <span className="text-ink-muted">
        {gapMs === 0 ? "fastest in this view" : `+${formatSeconds(gapMs)}s off the lead`}
      </span>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function RankingsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
