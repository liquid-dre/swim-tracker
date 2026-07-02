"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Check, Target } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Segmented } from "@/components/ui/Segmented";
import { FilterBar } from "@/components/ui/FilterBar";
import { trailForHref } from "@/lib/nav";
import { formatTime, type Tier } from "@/lib/swim";
import { formatSeconds } from "@/lib/format";
import {
  SingleTierLegend,
  SingleTierProgress,
  type SingleBar,
} from "./QualifyingProgress";
import { AllTierResults } from "./RoadAllResults";

/*
  Road to qualify (Step 12 / R3, BRD §5.10–5.11). For one swimmer at one target,
  two linked LCM-only reads of readiness. The target toggle is L2 / L3 / SANJ /
  All:

    • Gap to cut — the anchor. One horizontal bar per applicable event, closest
      to the cut first, so the low-hanging events surface immediately. Qualified
      events (PB ≤ cut) are flagged in the success green and grouped; events with
      no long-course meet time are listed separately, never drawn as a huge gap.
    • Qualifying progress — single-tier: one bar per event filling toward that
      tier's cut, most-complete first. All: one bar per event with the L2/L3/SANJ
      cuts as fixed calibrated zones, filled to the swimmer's PB and coloured by
      the highest tier met.

  Coverage is automatic (§4.9): SANJ has no 50s, L2 nothing above 200 m — the
  query only returns events the tier covers at the swimmer's EXACT age, so the
  toggle reshapes the whole screen without any client-side event list.
*/

const TIER_FULL: Record<Tier, string> = {
  LEVEL_2: "Level 2",
  LEVEL_3: "Level 3",
  SANJ: "SANJ",
};

// The Road target selector — the three tiers plus an All view. The three real
// tiers stay in the shared/persisted store (so the choice carries to other
// screens); "ALL" is a Road-local overlay that never touches that store, so the
// projection toggle elsewhere (Tier only) is unaffected.
type RoadTarget = Tier | "ALL";

type RoadEvent = {
  distance: number;
  stroke: string;
  label: string;
  cutMs: number;
  pbMs: number | null;
  gapMs: number | null;
  gapPct: number | null;
  pctOfCut: number | null;
  qualified: boolean;
};

export type RoadData = {
  swimmer: { name: string; age: number; active: boolean };
  events: RoadEvent[];
};

export function RoadScreen() {
  const swimmers = useQuery(api.swimmers.listSwimmers, {});
  // Opens on the all-tiers zoned view by default; the specific-tier choice is a
  // per-session, page-local override (no global default any more).
  const [showAll, setShowAll] = useState(true);
  const [tier, setTier] = useState<Tier>("LEVEL_2");
  const [swimmerId, setSwimmerId] = useState<Id<"swimmers"> | "">("");

  const target: RoadTarget = showAll ? "ALL" : tier;
  const setTarget = (next: RoadTarget) => {
    if (next === "ALL") setShowAll(true);
    else {
      setShowAll(false);
      setTier(next);
    }
  };

  // Single-tier gap/progress read (skipped in All mode).
  const data = useQuery(
    api.analysis.getRoadToQualify,
    swimmerId === "" || showAll ? "skip" : { swimmerId, tier },
  );
  // All-tier read reuses the stroke-profile data (all three cuts + the shared
  // calibrated position + highest tier met, already LCM / exact-age / meet-PB).
  const allData = useQuery(
    api.analysis.getStrokeProfile,
    swimmerId === "" || !showAll ? "skip" : { swimmerId },
  );

  const loadingSwimmers = swimmers === undefined;
  const swimmerChosen = swimmerId !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Road to qualify"
        breadcrumb={trailForHref("/road")}
        description="For one swimmer, the gap from their fastest long-course meet time to each qualifying cut, closest first. Trials and practice never count; standards resolve to the swimmer's exact age."
      />

      {/* Slim toolbar: swimmer + target tier inline, so the gap chart leads. */}
      <FilterBar
        primary={
          <>
            <div className="w-full max-w-xs sm:w-56">
              <Select
                aria-label="Swimmer"
                placeholder={loadingSwimmers ? "Loading swimmers…" : "Select a swimmer"}
                value={swimmerId}
                onValueChange={(v) => setSwimmerId(v as Id<"swimmers">)}
                disabled={loadingSwimmers}
                options={(swimmers ?? []).map((s) => ({
                  value: s._id,
                  label: `${s.name} · ${s.age}`,
                }))}
              />
            </div>
            <Segmented
              ariaLabel="Target qualifying tier"
              value={target}
              onChange={setTarget}
              options={[
                { value: "LEVEL_2", label: "L2" },
                { value: "LEVEL_3", label: "L3" },
                { value: "SANJ", label: "SANJ" },
                { value: "ALL", label: "All" },
              ]}
            />
          </>
        }
      />

      {!swimmerChosen ? (
        <EmptyState
          title="Choose a swimmer"
          body="Select a swimmer above to see how close they are to every Level 2, Level 3 or SANJ cut for their exact age."
        />
      ) : showAll ? (
        allData === undefined ? (
          <RoadSkeleton />
        ) : allData === null ? (
          <EmptyState
            title="Swimmer not found"
            body="That swimmer may have been removed. Pick another from the list above."
          />
        ) : allData.events.length === 0 ? (
          <EmptyState
            title={`No qualifying cuts at age ${allData.swimmer.age}`}
            body={`${allData.swimmer.name} has no long-course qualifying cuts at their exact age yet. This may be an age no tier covers, or the cuts aren’t loaded.`}
          />
        ) : (
          <AllTierResults data={allData} />
        )
      ) : data === undefined ? (
        <RoadSkeleton />
      ) : data === null ? (
        <EmptyState
          title="Swimmer not found"
          body="That swimmer may have been removed. Pick another from the list above."
        />
      ) : data.events.length === 0 ? (
        <EmptyState
          title={`No ${TIER_FULL[tier]} cuts at age ${data.swimmer.age}`}
          body={`${data.swimmer.name} has no ${TIER_FULL[tier]} events at their exact age. This tier may not cover their age group, or the cuts aren’t loaded. Try another target tier.`}
        />
      ) : (
        <RoadResults data={data} tier={tier} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results — presentational (fed by the query, or by the preview harness)
// ---------------------------------------------------------------------------

export function RoadResults({ data, tier }: { data: RoadData; tier: Tier }) {
  const events = data.events;

  // Three groups the BRD calls for: still chasing (the closest-first anchor),
  // already qualified (grouped, green), and no long-course meet time yet.
  const chasing = useMemo(
    () => events.filter((e) => e.pbMs !== null && !e.qualified),
    [events],
  );
  const qualified = useMemo(() => events.filter((e) => e.qualified), [events]);
  const noTime = useMemo(() => events.filter((e) => e.pbMs === null), [events]);

  // The gap bars are normalised against the widest gap in the chasing set, so
  // the closest events read as slivers and the farthest fill the track.
  const maxGapPct = useMemo(
    () => chasing.reduce((m, e) => Math.max(m, e.gapPct ?? 0), 0),
    [chasing],
  );

  // Qualifying progress: every event WITH a meet time (qualified + chasing).
  // SingleTierProgress orders them most-complete first.
  const progressBars = useMemo<SingleBar[]>(
    () =>
      events
        .filter((e) => e.pbMs !== null)
        .map((e) => ({
          key: `${e.distance}|${e.stroke}`,
          label: e.label,
          pbMs: e.pbMs as number,
          cutMs: e.cutMs,
          gapMs: e.gapMs as number,
          qualified: e.qualified,
        })),
    [events],
  );

  return (
    <div className="flex flex-col gap-5">
      <SummaryBar
        name={data.swimmer.name}
        age={data.swimmer.age}
        active={data.swimmer.active}
        tier={tier}
        applicable={events.length}
        qualified={qualified.length}
        chasing={chasing.length}
        noTime={noTime.length}
      />

      {/* Gap to cut — the closest-first anchor */}
      <section className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Gap to the cut</h2>
          <p className="text-xs text-ink-faint">
            Shorter bar = closer · {TIER_FULL[tier]}
          </p>
        </div>

        {chasing.length > 0 ? (
          <GapGroup
            heading="Closest to the cut"
            count={chasing.length}
            rows={chasing}
            maxGapPct={maxGapPct}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            No events left to chase at this tier — every applicable event is
            either qualified or has no time yet.
          </p>
        )}

        {qualified.length > 0 && <QualifiedGroup rows={qualified} />}

        {noTime.length > 0 && <NoTimeGroup rows={noTime} />}
      </section>

      {/* Qualifying progress — one bar per event filling toward this tier's cut */}
      {progressBars.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Qualifying progress</h2>
            <p className="text-xs text-ink-faint">
              Full bar = qualified · {TIER_FULL[tier]}
            </p>
          </div>
          <SingleTierProgress bars={progressBars} />
          <SingleTierLegend tierLabel={TIER_FULL[tier]} />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function SummaryBar({
  name,
  age,
  active,
  tier,
  applicable,
  qualified,
  chasing,
  noTime,
}: {
  name: string;
  age: number;
  active: boolean;
  tier: Tier;
  applicable: number;
  qualified: number;
  chasing: number;
  noTime: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-theme-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">{name}</span>
        <span className="text-ink-faint tabular-nums">age {age}</span>
        {!active && <span className="text-ink-faint">· inactive</span>}
      </div>
      <span aria-hidden className="h-3.5 w-px bg-border" />
      <Stat label="Target" value={TIER_FULL[tier]} />
      <Stat label="Applicable" value={String(applicable)} />
      <Stat
        label="Qualified"
        value={String(qualified)}
        // Green only when there's something to celebrate — a green 0 would read
        // as success where there is none.
        accent={qualified > 0 ? "success" : undefined}
        muted={qualified === 0}
      />
      <Stat label="To go" value={String(chasing)} />
      <Stat label="No time" value={String(noTime)} muted />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: "success";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-muted">{label}</span>
      <span
        className={
          "font-medium tabular-nums " +
          (accent === "success"
            ? "text-success-ink"
            : muted
              ? "text-ink-faint"
              : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gap groups
// ---------------------------------------------------------------------------

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </h3>
      <span className="text-xs tabular-nums text-ink-faint">{count}</span>
    </div>
  );
}

function GapGroup({
  heading,
  count,
  rows,
  maxGapPct,
}: {
  heading: string;
  count: number;
  rows: RoadEvent[];
  maxGapPct: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading label={heading} count={count} />
      {/* Flush divider rows, not a bordered inner box — no card-in-card. */}
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((e) => (
          <GapRow key={`${e.distance}|${e.stroke}`} e={e} maxGapPct={maxGapPct} />
        ))}
      </ul>
    </div>
  );
}

function GapRow({ e, maxGapPct }: { e: RoadEvent; maxGapPct: number }) {
  const gapMs = e.gapMs as number;
  const gapPct = e.gapPct as number;
  // Sliver floor so the closest events are still a visible mark, not nothing.
  const width = maxGapPct > 0 ? Math.max(4, (gapPct / maxGapPct) * 100) : 4;

  return (
    <li className="flex items-center gap-4 py-3">
      <div className="w-24 shrink-0 sm:w-28">
        <div className="font-medium text-ink">{e.label}</div>
        <div className="time tnum mt-0.5 text-xs text-ink-faint">
          {formatTime(e.pbMs as number)} → {formatTime(e.cutMs)}
        </div>
      </div>
      <div
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-gray-100"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] [transition-duration:var(--dur-2)]"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right sm:w-24">
        <div className="font-medium tabular-nums text-ink">
          +{formatSeconds(gapMs)}s
        </div>
        <div className="tabular-nums text-xs text-ink-faint">
          +{gapPct.toFixed(1)}%
        </div>
      </div>
    </li>
  );
}

function QualifiedGroup({ rows }: { rows: RoadEvent[] }) {
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading label="Qualified" count={rows.length} />
      {/* A soft green fill (no border/shadow) sets the "done" group apart without
          becoming a nested card; the check + green figures carry the meaning. */}
      <ul className="flex flex-col gap-1 rounded-lg bg-success-subtle/50 px-3 py-1.5">
        {rows.map((e) => {
          const underMs = -(e.gapMs as number); // gapMs ≤ 0 when qualified
          return (
            <li
              key={`${e.distance}|${e.stroke}`}
              className="flex items-center gap-3 py-1.5"
            >
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-success-fg"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink">{e.label}</span>
                <span className="time tnum ml-2 text-xs text-ink-faint">
                  {formatTime(e.pbMs as number)} ≤ {formatTime(e.cutMs)}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-medium tabular-nums text-success-ink">
                  {formatSeconds(underMs)}s under
                </div>
                <div className="tabular-nums text-xs text-ink-faint">
                  {(e.pctOfCut as number).toFixed(1)}% of cut
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NoTimeGroup({ rows }: { rows: RoadEvent[] }) {
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading label="No time yet" count={rows.length} />
      {/* Flush muted rows — the heading already says "no time", so each row only
          carries the cut a long-course meet time would have to beat. */}
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((e) => (
          <li
            key={`${e.distance}|${e.stroke}`}
            className="flex items-center justify-between gap-4 py-2.5"
          >
            <span className="font-medium text-ink-muted">{e.label}</span>
            <span className="time tnum text-xs text-ink-faint">
              cut {formatTime(e.cutMs)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Target aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function RoadSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-14 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
