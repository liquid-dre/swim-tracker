"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { LineChart as LineChartIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { useContainerWidth } from "@/hooks/use-container-width";
import { type Course, type Stroke } from "@/lib/swim";
import { EventFilter } from "@/components/analysis/EventFilter";
import { type EventValue } from "@/components/analysis/EventPicker";
import { ProgressionChart } from "@/components/progression/ProgressionChart";
import { StrokeWheel } from "@/components/profile/StrokeWheel";
import { STROKE_META, WHEEL_STROKE_ORDER, type ProfileEvent } from "@/components/profile/strokeProfile";
import { useViewer } from "./ViewerContext";
import { MiniEmpty, ReadOnlyChip, Section } from "./viewerShared";

/*
  Viewer Progress (/me/progress, Step R6). Two focused reads of the selected
  swimmer's trajectory, each the hero of its own card: the progression chart for
  one event (with their qualifying cuts on long course), and the calibrated
  stroke-profile wheel. Reuses the already-built ProgressionChart and StrokeWheel
  — no chart is rebuilt here.

  Everything is scoped to the viewer's OWN linked swimmer(s): a parent with more
  than one child can overlay them in a group progression, but no swimmer they
  aren't coach-approved to see is ever selectable, named, or timed here.
*/

export function ViewerProgressScreen() {
  const { selectedId } = useViewer();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Progress"
        breadcrumb={[{ label: "Overview", href: "/me" }, { label: "Progress" }]}
        description="Your times over the season for one event, and your strength across strokes. Trials and practice are shown but never set a PB."
        actions={<ReadOnlyChip tone="onWater" />}
      />
      <ProgressionSection />
      <StrokeProfileSection swimmerId={selectedId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progression — one event, the viewer's own swimmer(s) and their cut lines (LCM)
// ---------------------------------------------------------------------------

type ProgMode = "one" | "group";

function ProgressionSection() {
  // Only the viewer's own linked swimmers — the switcher above already picks the
  // single one; the group option appears solely for a parent with more than one.
  const { swimmers, selectedId } = useViewer();
  const events = useQuery(api.events.listActiveEvents, {});
  const multi = swimmers.length > 1;

  const ownIds = useMemo(() => swimmers.map((s) => s._id), [swimmers]);

  // "one" charts the swimmer chosen in the shared switcher; "group" overlays a
  // subset of the viewer's own swimmers (defaults to all of them).
  const [mode, setMode] = useState<ProgMode>("one");
  const [groupIds, setGroupIds] = useState<Id<"swimmers">[]>(ownIds);

  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });

  // Never send an id the viewer isn't linked to (a revoked link would otherwise
  // make the whole read fail server-side): intersect with the current own set.
  const chartIds = useMemo(() => {
    if (!multi || mode === "one") return [selectedId];
    const own = new Set(ownIds);
    return groupIds.filter((id) => own.has(id));
  }, [multi, mode, selectedId, ownIds, groupIds]);

  const eventComplete =
    event.distance !== null && event.stroke !== null && event.course !== null;
  const ready = eventComplete && chartIds.length > 0;

  const data = useQuery(
    api.analysis.getProgression,
    ready
      ? {
          swimmerIds: chartIds,
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          course: event.course as Course,
        }
      : "skip",
  );

  const series = data?.series ?? [];
  const withData = series.filter((s) => s.points.length > 0);
  const single = withData.length === 1;

  function toggle(id: Id<"swimmers">) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Section
      title="Progression"
      hint="Every logged time for one event over the season, with your long-course qualifying cuts overlaid. Trials and practice are shown but never set a PB."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {multi && (
            <Segmented
              ariaLabel="One swimmer or a group"
              value={mode}
              onChange={(m) => setMode(m)}
              options={[
                { value: "one", label: "One swimmer" },
                { value: "group", label: "Group" },
              ]}
            />
          )}
          <EventFilter events={events} value={event} onChange={setEvent} />
        </div>

        {multi && mode === "group" && (
          <div
            role="group"
            aria-label="Choose which of your swimmers to chart"
            className="flex flex-wrap gap-2"
          >
            {swimmers.map((s) => {
              const active = chartIds.includes(s._id);
              return (
                <button
                  key={s._id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(s._id)}
                  className={
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
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
        )}

        {!eventComplete ? (
          <MiniEmpty
            icon={<LineChartIcon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title="Pick an event"
            body="Choose a distance, stroke and course above to chart the times."
          />
        ) : chartIds.length === 0 ? (
          <MiniEmpty
            icon={<LineChartIcon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
            title="Choose a swimmer"
            body="Select at least one of your swimmers above to chart their times."
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
            body={`Nothing has been logged for the ${data.event.label} (${data.event.course}) ${
              chartIds.length === 1 ? "for this swimmer" : "for these swimmers"
            } yet. Pick another event.`}
          />
        ) : (
          <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {single ? `${withData[0].name} · ` : ""}
                {data.event.label} · {data.event.course}
              </h3>
              <p className="text-xs text-ink-faint">Lower = faster</p>
            </div>
            <ProgressionChart
              series={withData}
              single={single}
              distance={data.event.distance}
              stroke={data.event.stroke}
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
// Stroke profile — the calibrated radial wheel for the swimmer
// ---------------------------------------------------------------------------

type Coverage = "full" | "all";

function StrokeProfileSection({ swimmerId }: { swimmerId: Id<"swimmers"> }) {
  const data = useQuery(api.analysis.getStrokeProfile, { swimmerId });
  const [coverage, setCoverage] = useState<Coverage>("full");

  const events = useMemo<ProfileEvent[]>(() => {
    const all = (data?.events ?? []) as ProfileEvent[];
    return coverage === "full" ? all.filter((e) => e.fullCoverage) : all;
  }, [data, coverage]);

  const partialCount = useMemo(
    () => (data?.events ?? []).filter((e) => !e.fullCoverage).length,
    [data],
  );

  // Clamp the wheel to the card width so the fixed SVG never overflows on phones.
  const [wrapRef, wrapWidth] = useContainerWidth(1024);
  const size = Math.max(240, Math.min(380, Math.floor(wrapWidth) - 48));

  return (
    <Section
      title="Stroke profile"
      hint="Each bar is one event’s fastest long-course meet time on that event’s own L2 → L3 → SANJ scale — further out is faster. Bars group into coloured stroke arcs."
    >
      <div className="flex flex-col gap-5">
        <div className="flex justify-end">
          <Segmented
            ariaLabel="Event coverage"
            value={coverage}
            onChange={setCoverage}
            options={[
              { value: "full", label: "Full coverage" },
              { value: "all", label: "Include partial" },
            ]}
          />
        </div>

        <div
          ref={wrapRef}
          className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6"
        >
          {data === undefined ? (
            <div
              className="animate-pulse rounded-full bg-surface-2"
              style={{ width: size, height: size }}
              aria-busy
            />
          ) : data === null ? (
            <p className="py-12 text-sm text-ink-muted">This swimmer is unavailable.</p>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <p className="text-sm font-medium text-ink">Nothing to plot yet</p>
              <p className="max-w-[32ch] text-xs text-ink-muted">
                {coverage === "full" && partialCount > 0
                  ? "No full-coverage events at your age — switch to “Include partial” to see the rest."
                  : "No long-course qualifying cuts apply at your exact age."}
              </p>
            </div>
          ) : (
            <StrokeWheel events={events} size={size} title="Stroke profile" />
          )}

          {data && data !== null && events.length > 0 && coverage === "full" && partialCount > 0 && (
            <p className="text-xs text-ink-faint">
              {partialCount} partial-coverage {partialCount === 1 ? "event" : "events"} hidden
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-theme-sm">
          <span className="text-xs font-medium text-ink-muted">Stroke</span>
          {WHEEL_STROKE_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-sm">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: STROKE_META[s].color }}
              />
              <span className="text-ink">{STROKE_META[s].label}</span>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}
