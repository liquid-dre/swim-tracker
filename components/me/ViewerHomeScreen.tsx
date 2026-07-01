"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  CalendarClock,
  Eye,
  LineChart as LineChartIcon,
  UserRound,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { TargetTierToggle } from "@/components/qualifying/TargetTierToggle";
import { useTargetTier } from "@/lib/useTargetTier";
import { formatShortDate } from "@/lib/format";
import { type Course, type Stroke, type Tier } from "@/lib/swim";
import { EventPicker, type EventValue } from "@/components/analysis/EventPicker";
import { ProgressionChart } from "@/components/progression/ProgressionChart";
import { RoadResults } from "@/components/road/RoadScreen";
import { PbBoard } from "@/components/swimmers/PbBoard";
import { ImprovementSummary } from "@/components/swimmers/ImprovementSummary";
import { HistoryTable } from "@/components/swimmers/HistoryTable";

/*
  Viewer home (Step 15, BRD §5.9). A swimmer or parent lands here and sees ONLY
  the swimmer(s) their account is linked to: personal bests, progression with
  their own qualifying lines, road-to-qualify, and full history — all read-only.
  There is no coach chrome: no edit/delete, no roster, no cross-roster anything.
  Every read below is scoped server-side to the linked swimmer(s); this screen
  only chooses among the ones the server already returned (`listForProfile`).
*/
export function ViewerHomeScreen() {
  const data = useQuery(api.swimmers.listForProfile, {});
  const swimmers = useMemo(() => data?.swimmers ?? [], [data]);

  // The selected swimmer is derived (not stored), so it self-heals if a link is
  // revoked underneath the selection — falling back to the first linked swimmer.
  const [picked, setPicked] = useState<Id<"swimmers"> | null>(null);
  const selectedId = useMemo<Id<"swimmers"> | null>(() => {
    if (picked && swimmers.some((s) => s._id === picked)) return picked;
    return swimmers[0]?._id ?? null;
  }, [picked, swimmers]);

  // The shared target tier for road-to-qualify (§5.10). Persisted across visits.
  const [tier, setTier] = useTargetTier();

  const loading = data === undefined;
  const selected = swimmers.find((s) => s._id === selectedId) ?? null;
  const multiple = swimmers.length > 1;

  // The page's subject is the swimmer, so their name IS the title once known —
  // no generic label competing above it. "My swimmer" only stands in while the
  // link is loading or when several swimmers share one switcher.
  const title = selected && !multiple ? selected.name : "My swimmer";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={title}
        breadcrumb={[{ label: "My swimmer" }]}
        description="Your personal bests, progression, and how close you are to each qualifying cut. Your coach keeps the times up to date."
        actions={<ReadOnlyChip />}
      />

      {loading ? (
        <HomeSkeleton />
      ) : swimmers.length === 0 ? (
        <NoLinkState />
      ) : (
        <>
          {multiple && selectedId && (
            <SwimmerSwitch
              swimmers={swimmers}
              selectedId={selectedId}
              onSelect={setPicked}
            />
          )}
          {selectedId && (
            <div key={selectedId} className="flex flex-col gap-10">
              <ViewerProfile swimmerId={selectedId} />
              <ViewerProgression swimmerId={selectedId} />
              <ViewerRoad swimmerId={selectedId} tier={tier} onTier={setTier} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReadOnlyChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
      <Eye aria-hidden className="size-3.5 text-ink-faint" />
      Read-only
    </span>
  );
}

// ---------------------------------------------------------------------------
// Swimmer switch — only when a viewer is linked to more than one swimmer
// ---------------------------------------------------------------------------

type SwimmerLite = {
  _id: Id<"swimmers">;
  name: string;
  age: number;
  active: boolean;
};

function SwimmerSwitch({
  swimmers,
  selectedId,
  onSelect,
}: {
  swimmers: SwimmerLite[];
  selectedId: Id<"swimmers">;
  onSelect: (id: Id<"swimmers">) => void;
}) {
  return (
    <div role="group" aria-label="Choose a swimmer" className="flex flex-wrap gap-2">
      {swimmers.map((s) => {
        const active = s._id === selectedId;
        return (
          <button
            key={s._id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(s._id)}
            className={
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
              (active
                ? "border-brand-500 bg-brand-50 text-brand-500"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900")
            }
          >
            {s.name}
            <span className="text-xs tabular-nums text-ink-faint">age {s.age}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile — identity + PB board + improvement + read-only history
// ---------------------------------------------------------------------------

function ViewerProfile({ swimmerId }: { swimmerId: Id<"swimmers"> }) {
  const data = useQuery(api.personalBests.getSwimmerProfile, { swimmerId });

  if (data === undefined) return <ProfileSkeleton />;

  const { swimmer, personalBests, history } = data;

  return (
    <div className="flex flex-col gap-10">
      <IdentityStrip
        age={swimmer.age}
        gender={swimmer.gender}
        active={swimmer.active}
        inSystemSince={swimmer.inSystemSince}
        resultCount={swimmer.resultCount}
      />

      <Section
        title="Personal bests"
        hint="Fastest meet time per event and course. Trials and practice never set a PB."
      >
        <PbBoard pbs={personalBests} />
      </Section>

      <Section
        title="Improvement"
        hint="First logged swim to the current PB, per event."
      >
        <ImprovementSummary pbs={personalBests} />
      </Section>

      <Section title="History" hint="Every logged swim. Filter and sort to explore.">
        <HistoryTable rows={history} />
      </Section>
    </div>
  );
}

function IdentityStrip({
  age,
  gender,
  active,
  inSystemSince,
  resultCount,
}: {
  age: number;
  gender: "M" | "F";
  active: boolean;
  inSystemSince: string;
  resultCount: number;
}) {
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <Stat label="Age" value={`${age}`} />
      <Divider />
      <Stat label="Gender" value={gender === "F" ? "Female" : "Male"} />
      <Divider />
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Status</dt>
        <dd>
          {active ? (
            <span className="inline-flex items-center gap-1.5 text-success-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-success" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" /> Inactive
            </span>
          )}
        </dd>
      </div>
      <Divider />
      <div className="flex items-center gap-1.5 text-ink-muted">
        <CalendarClock aria-hidden className="size-4 text-ink-faint" />
        <dt className="sr-only">In system since</dt>
        <dd>
          In system since{" "}
          <span className="text-ink">{formatShortDate(inSystemSince)}</span>
        </dd>
      </div>
      <Divider />
      <Stat label="Results" value={`${resultCount}`} />
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Progression — one swimmer, one event, with their own qualifying lines
// ---------------------------------------------------------------------------

function ViewerProgression({ swimmerId }: { swimmerId: Id<"swimmers"> }) {
  const events = useQuery(api.events.listActiveEvents, {});
  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });

  const eventComplete =
    event.distance !== null && event.stroke !== null && event.course !== null;

  const data = useQuery(
    api.analysis.getProgression,
    eventComplete
      ? {
          swimmerIds: [swimmerId],
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          course: event.course as Course,
        }
      : "skip",
  );

  const series = data?.series ?? [];
  const withData = series.filter((s) => s.points.length > 0);

  return (
    <Section
      title="Progression"
      hint="Every logged time for one event over the season, with your qualifying cuts drawn in on long course. The axis is inverted, so faster sits higher and improvement reads as a climb."
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
          <h3 className="text-sm font-semibold text-ink">Event</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Distance, stroke and course. A course is required.
          </p>
          <div className="mt-4">
            <EventPicker events={events} value={event} onChange={setEvent} />
          </div>
        </div>

        {!eventComplete ? (
          <MiniEmpty
            icon={<LineChartIcon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title="Pick an event"
            body="Choose a distance, stroke and course above to chart the times."
          />
        ) : data === undefined ? (
          <div
            className="h-[26rem] animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
            aria-busy
          />
        ) : withData.length === 0 ? (
          <MiniEmpty
            icon={<LineChartIcon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title="No swims for this event"
            body={`Nothing has been logged for the ${data.event.label} (${data.event.course}) yet. Pick another event.`}
          />
        ) : (
          <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {data.event.label} · {data.event.course}
              </h3>
              <p className="text-xs text-ink-faint">Higher = faster</p>
            </div>

            <ProgressionChart
              series={withData}
              single
              course={data.event.course}
              standards={data.standards}
              projectionTier={null}
            />
          </section>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Road to qualify — one swimmer at the shared target tier
// ---------------------------------------------------------------------------

function ViewerRoad({
  swimmerId,
  tier,
  onTier,
}: {
  swimmerId: Id<"swimmers">;
  tier: Tier;
  onTier: (t: Tier) => void;
}) {
  const data = useQuery(api.analysis.getRoadToQualify, { swimmerId, tier });

  return (
    <Section
      title="Road to qualify"
      hint="How close your fastest long-course meet time is to each qualifying cut, closest first. Standards resolve to your exact age."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:flex-row md:items-center md:justify-between md:p-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">Target tier</h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              Reframes every event to this meet. Long course only.
            </p>
          </div>
          <TargetTierToggle value={tier} onChange={onTier} />
        </div>

        {data === undefined ? (
          <div className="flex flex-col gap-5" aria-busy>
            <div className="h-14 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
            <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
          </div>
        ) : data === null ? (
          <MiniEmpty
            icon={<UserRound aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title="Swimmer unavailable"
            body="This swimmer may have been removed. Ask your coach to check the link."
          />
        ) : data.events.length === 0 ? (
          <MiniEmpty
            icon={<UserRound aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title={`No cuts at age ${data.swimmer.age}`}
            body="This tier has no events at your exact age. Try another target tier."
          />
        ) : (
          <RoadResults data={data} tier={tier} />
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-muted">
      <dt>{label}</dt>
      <dd className="tnum font-medium text-ink">{value}</dd>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-3.5 w-px bg-border" />;
}

function MiniEmpty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function NoLinkState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-theme-sm">
      <UserRound aria-hidden className="size-7 text-ink-faint" strokeWidth={1.6} />
      <div className="space-y-1">
        <p className="text-base font-medium text-ink">No swimmer linked yet</p>
        <p className="mx-auto max-w-[46ch] text-sm text-ink-muted">
          Your account isn&rsquo;t linked to a swimmer. Ask your coach to link you
          with the email you signed up with, and your bests will appear here.
        </p>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <div className="h-4 w-72 animate-pulse rounded-sm bg-surface-2" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      ))}
    </div>
  );
}

function HomeSkeleton() {
  return <ProfileSkeleton />;
}
