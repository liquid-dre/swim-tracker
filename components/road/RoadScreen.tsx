"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Check, Target } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Segmented } from "@/components/ui/Segmented";
import { FilterBar } from "@/components/ui/FilterBar";
import { AgeUpNote } from "@/components/qualifying/AgeUpNote";
import { StandardsMissing } from "@/components/ui/StandardsMissing";
import { trailForHref } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { usePickerSwimmers } from "@/lib/usePickerSwimmers";
import { formatTime, type Course, type CourseMode } from "@/lib/swim";
import { GALA_FULL, GALA_MEDIUM, GALA_ORDER, type GalaCode } from "@/lib/galas";
import { formatSeconds, formatShortDate } from "@/lib/format";
import {
  SingleTierLegend,
  SingleTierProgress,
  type SingleBar,
} from "./QualifyingProgress";
import { AllTierResults } from "./RoadAllResults";

/*
  Road to qualify (Step 12 / R3, BRD §5.10–5.11). For one swimmer at one target,
  two linked reads of readiness. The target is any of the five galas, or All:

    • Gap to cut — the anchor. One horizontal bar per applicable event, closest
      to the cut first, so the low-hanging events surface immediately. Qualified
      events (PB ≤ cut) are flagged in the success green and grouped; events with
      no meet time are listed separately, never drawn as a huge gap.
    • Qualifying progress — single-gala: one bar per event filling toward that
      gala's cut, most-complete first. All: one bar per event with the age-graded
      cuts as fixed calibrated zones, filled to the swimmer's PB and coloured by
      the highest gala met.

  Both courses qualify (§4.2), so each row is measured in whichever course the
  swimmer is CLOSEST in and says which one that was; the course selector pins it
  to one course when you want an unambiguous single-course read.

  Coverage is automatic (§4.9): SANJ has no 50s, L2 nothing above 200 m — the
  query only returns events the gala covers at the swimmer's EXACT age, so the
  target reshapes the whole screen without any client-side event list.

  With five galas a segmented control no longer fits, so the target uses the
  shared styled picker (CLAUDE.md's one-dropdown rule) with All alongside it.
*/

type RoadTarget = GalaCode | "ALL";

type RoadEvent = {
  distance: number;
  stroke: string;
  label: string;
  /** The course this row is measured in (§4.2). */
  course: Course;
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
  const pathname = usePathname();
  // Role-scoped picker: coaches pick any swimmer, a viewer only their linked
  // swimmer(s). The gap/progress reads are already scoped server-side.
  const swimmers = usePickerSwimmers();
  // Opens on the all-tiers zoned view by default; the specific-tier choice is a
  // per-session, page-local override (no global default any more).
  const [showAll, setShowAll] = useState(true);
  const [gala, setGala] = useState<GalaCode>("LEVEL_2");
  const [courseMode, setCourseMode] = useState<CourseMode>("BEST");
  const [swimmerId, setSwimmerId] = useState<Id<"swimmers"> | "">("");

  const target: RoadTarget = showAll ? "ALL" : gala;
  const setTarget = (next: RoadTarget) => {
    if (next === "ALL") setShowAll(true);
    else {
      setShowAll(false);
      setGala(next);
    }
  };

  // Single-gala gap/progress read (skipped in All mode).
  const data = useQuery(
    api.analysis.getRoadToQualify,
    swimmerId === "" || showAll ? "skip" : { swimmerId, gala, courseMode },
  );
  // All-gala read reuses the stroke-profile data (the three age-graded cuts + the
  // shared calibrated position + highest gala met, exact-age / meet-PB).
  const allData = useQuery(
    api.analysis.getStrokeProfile,
    swimmerId === "" || !showAll ? "skip" : { swimmerId },
  );

  const loadingSwimmers = swimmers === undefined;
  const swimmerChosen = swimmerId !== "";

  // Staff get the "import standards" pointer; a viewer can't reach that screen.
  // While the profile is in flight, hold the skeleton rather than flashing the
  // viewer copy at a coach.
  const profile = useCurrentProfile();
  const profileLoading = profile === undefined;
  const isStaff =
    profile !== undefined && profile !== null && profile.role !== "VIEWER";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Road to qualify"
        breadcrumb={trailForHref(pathname)}
        description="For one swimmer, the gap from their fastest meet time to each qualifying cut, closest first. Either course can qualify them, so each row is measured in the course they're nearest in. Trials and practice never count; standards resolve to the swimmer's exact age."
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
            <div className="w-full max-w-xs sm:w-44">
              <Select
                aria-label="Target gala"
                value={target}
                onValueChange={(v) => setTarget(v as RoadTarget)}
                options={[
                  ...GALA_ORDER.map((code) => ({
                    value: code as string,
                    label: GALA_MEDIUM[code],
                  })),
                  // Not "All galas": this view is the calibrated zoned scale,
                  // which only the three age-graded galas sit on (SANS/SANY are
                  // open standards). The label must not overclaim.
                  { value: "ALL", label: "All age-graded" },
                ]}
              />
            </div>
            {!showAll && (
              <Segmented
                ariaLabel="Which course to measure"
                value={courseMode}
                onChange={setCourseMode}
                options={[
                  { value: "BEST", label: "Best of both" },
                  { value: "LCM", label: "Long" },
                  { value: "SCM", label: "Short" },
                ]}
              />
            )}
          </>
        }
      />

      {!swimmerChosen ? (
        <EmptyState
          title="Choose a swimmer"
          body="Select a swimmer above to see how close they are to every gala cut for their exact age, in whichever course they're nearest in."
        />
      ) : showAll ? (
        allData === undefined ? (
          <RoadSkeleton />
        ) : allData === null ? (
          <EmptyState
            title="Swimmer not found"
            body="That swimmer may have been removed. Pick another from the list above."
          />
        ) : !allData.hasStandards ? (
          profileLoading ? (
            <RoadSkeleton />
          ) : (
            <StandardsMissing isStaff={isStaff} />
          )
        ) : allData.events.length === 0 ? (
          <EmptyState
            title={`No qualifying cuts at age ${allData.swimmer.age}`}
            body={`${allData.swimmer.name} has no qualifying cuts at their exact age yet. This may be an age no gala covers.`}
          />
        ) : (
          <>
            {allData.agedUpAt && (
              <AgeUpNote
                name={allData.swimmer.name}
                age={allData.swimmer.age}
                date={allData.agedUpAt}
                pinnedTiers={GALA_ORDER.filter(
                  (code) => allData.tourDates[code] !== undefined,
                ).map((code) => GALA_FULL[code])}
              />
            )}
            <AllTierResults data={allData} />
          </>
        )
      ) : data === undefined ? (
        <RoadSkeleton />
      ) : data === null ? (
        <EmptyState
          title="Swimmer not found"
          body="That swimmer may have been removed. Pick another from the list above."
        />
      ) : !data.hasStandards ? (
        profileLoading ? (
          <RoadSkeleton />
        ) : (
          <StandardsMissing isStaff={isStaff} />
        )
      ) : data.ineligible ? (
        // Outside the gala's entry window there is no road at all — say why,
        // rather than showing an empty list that reads as "nothing imported".
        <EmptyState
          title={`Age ${data.swimmer.age} can't enter ${data.displayName}`}
          body={`${data.swimmer.name} is outside this gala's entry age range, so none of its cuts apply to them. Pick another target, or correct the range under Admin › Galas.`}
        />
      ) : data.events.length === 0 ? (
        <EmptyState
          title={`No ${GALA_MEDIUM[gala]} cuts at age ${data.swimmer.age}`}
          body={`${data.swimmer.name} has no ${GALA_MEDIUM[gala]} events at their exact age. This gala may not cover their age group. Try another target.`}
        />
      ) : (
        <>
          {data.tour && (
            <p className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-muted">
              {data.tour.name ?? `${GALA_FULL[gala]} tour`} ·{" "}
              {formatShortDate(data.tour.date)} — every cut here is the one{" "}
              {data.swimmer.name} must meet at age {data.tour.ageAtTour}, their
              age on tour day.
            </p>
          )}
          {data.agedUpAt && (
            <AgeUpNote
              name={data.swimmer.name}
              age={data.swimmer.age}
              date={data.agedUpAt}
            />
          )}
          <RoadResults data={data} gala={gala} courseMode={courseMode} />
        </>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Results — presentational (fed by the query, or by the preview harness)
// ---------------------------------------------------------------------------

export function RoadResults({
  data,
  gala,
  courseMode = "BEST",
}: {
  data: RoadData;
  gala: GalaCode;
  courseMode?: CourseMode;
}) {
  const events = data.events;
  // Only worth tagging each row when more than one course is in play.
  const showCourse = courseMode === "BEST";

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
          course: e.course,
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
        gala={gala}
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
            Shorter bar = closer · {GALA_MEDIUM[gala]}
          </p>
        </div>

        {chasing.length > 0 ? (
          <GapGroup
            heading="Closest to the cut"
            count={chasing.length}
            rows={chasing}
            maxGapPct={maxGapPct}
            showCourse={showCourse}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            No events left to chase at this gala — every applicable event is
            either qualified or has no time yet.
          </p>
        )}

        {qualified.length > 0 && (
          <QualifiedGroup rows={qualified} showCourse={showCourse} />
        )}

        {noTime.length > 0 && (
          <NoTimeGroup rows={noTime} showCourse={showCourse} />
        )}
      </section>

      {/* Qualifying progress — one bar per event filling toward this gala's cut */}
      {progressBars.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Qualifying progress</h2>
            <p className="text-xs text-ink-faint">
              Full bar = qualified · {GALA_MEDIUM[gala]}
            </p>
          </div>
          <SingleTierProgress bars={progressBars} />
          <SingleTierLegend tierLabel={GALA_MEDIUM[gala]} />
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
  gala,
  applicable,
  qualified,
  chasing,
  noTime,
}: {
  name: string;
  age: number;
  active: boolean;
  gala: GalaCode;
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
      <Stat label="Target" value={GALA_MEDIUM[gala]} />
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

/*
  Which course a row is measured in. In "best of both" mode different events can
  legitimately resolve in different courses, so every row has to say which one —
  otherwise "1.0s to SANJ" silently hides whether that is the 50 m or the 25 m
  cut. Suppressed on a pinned single-course view, where the toolbar already
  answers it and a tag on every row would be noise.
*/
const COURSE_TAG: Record<Course, { short: string; full: string }> = {
  LCM: { short: "LC", full: "long course" },
  SCM: { short: "SC", full: "short course" },
};

function CourseTag({ course, show }: { course: Course; show: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded border border-border px-1 text-2xs font-medium leading-[1.4] text-ink-faint">
      {COURSE_TAG[course].short}
      <span className="sr-only"> ({COURSE_TAG[course].full})</span>
    </span>
  );
}

function GapGroup({
  heading,
  count,
  rows,
  maxGapPct,
  showCourse,
}: {
  heading: string;
  count: number;
  rows: RoadEvent[];
  maxGapPct: number;
  showCourse: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading label={heading} count={count} />
      {/* Flush divider rows, not a bordered inner box — no card-in-card. */}
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((e) => (
          <GapRow
            key={`${e.distance}|${e.stroke}`}
            e={e}
            maxGapPct={maxGapPct}
            showCourse={showCourse}
          />
        ))}
      </ul>
    </div>
  );
}

function GapRow({
  e,
  maxGapPct,
  showCourse,
}: {
  e: RoadEvent;
  maxGapPct: number;
  showCourse: boolean;
}) {
  const gapMs = e.gapMs as number;
  const gapPct = e.gapPct as number;
  // Sliver floor so the closest events are still a visible mark, not nothing.
  const width = maxGapPct > 0 ? Math.max(4, (gapPct / maxGapPct) * 100) : 4;

  return (
    <li className="flex items-center gap-4 py-3">
      <div className="w-24 shrink-0 sm:w-28">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-ink">{e.label}</span>
          <CourseTag course={e.course} show={showCourse} />
        </div>
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

function QualifiedGroup({
  rows,
  showCourse,
}: {
  rows: RoadEvent[];
  showCourse: boolean;
}) {
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
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-ink">{e.label}</span>
                <CourseTag course={e.course} show={showCourse} />
                <span className="time tnum text-xs text-ink-faint">
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

function NoTimeGroup({
  rows,
  showCourse,
}: {
  rows: RoadEvent[];
  showCourse: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading label="No time yet" count={rows.length} />
      {/* Flush muted rows — the heading already says "no time", so each row only
          carries the cut a meet time would have to beat. */}
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((e) => (
          <li
            key={`${e.distance}|${e.stroke}`}
            className="flex items-center justify-between gap-4 py-2.5"
          >
            <span className="flex items-center gap-1.5 font-medium text-ink-muted">
              {e.label}
              <CourseTag course={e.course} show={showCourse} />
            </span>
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
