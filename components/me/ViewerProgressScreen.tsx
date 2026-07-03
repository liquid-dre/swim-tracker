"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { LineChart as LineChartIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
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
      <ProgressionSection ownSwimmerId={selectedId} />
      <StrokeProfileSection swimmerId={selectedId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progression — one event, the swimmer's own qualifying lines (LCM)
// ---------------------------------------------------------------------------

function ProgressionSection({ ownSwimmerId }: { ownSwimmerId: Id<"swimmers"> }) {
  const events = useQuery(api.events.listActiveEvents, {});
  const roster = useQuery(api.swimmers.listSwimmersForPicker, {});

  // The chart defaults to the viewer's own swimmer; picking another shows that
  // swimmer's PUBLIC progression (the server hides its DOB, so the chart draws
  // no qualifying-cut overlay or projection for anyone but your own).
  const [override, setOverride] = useState<Id<"swimmers"> | null>(null);
  const chartId = override ?? ownSwimmerId;

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
          swimmerIds: [chartId],
          distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
          stroke: event.stroke as Stroke,
          course: event.course as Course,
        }
      : "skip",
  );

  const series = data?.series ?? [];
  const withData = series.filter((s) => s.points.length > 0);
  const chartName = roster?.find((s) => s._id === chartId)?.name;
  // A "public" view means this isn't one of the viewer's own swimmers, so the
  // cut overlay and projection are absent — say why so it doesn't read as a bug.
  const viewingOther = withData[0]?.view === "public";

  return (
    <Section
      title="Progression"
      hint="Every logged time for one event over the season. Long-course qualifying cuts and the time-to-qualify projection show for your own swimmer; pick another to see their times alone."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-56">
            <Select
              aria-label="Swimmer"
              placeholder={roster === undefined ? "Loading swimmers…" : "Select a swimmer"}
              value={chartId}
              onValueChange={(v) => setOverride(v as Id<"swimmers">)}
              disabled={roster === undefined}
              options={(roster ?? []).map((s) => ({
                value: s._id,
                label: `${s.name} · ${s.age}${s.active ? "" : " · inactive"}`,
              }))}
            />
          </div>
          <EventFilter events={events} value={event} onChange={setEvent} />
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
            body={`Nothing has been logged for the ${data.event.label} (${data.event.course}) for ${
              chartName ?? "this swimmer"
            } yet. Pick another event or swimmer.`}
          />
        ) : (
          <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {chartName ? `${chartName} · ` : ""}
                {data.event.label} · {data.event.course}
              </h3>
              <p className="text-xs text-ink-faint">Lower = faster</p>
            </div>
            <ProgressionChart
              series={withData}
              single
              course={data.event.course}
              standards={data.standards}
              projectionTier={null}
            />
            {viewingOther && (
              <p className="text-xs text-ink-faint">
                Qualifying cuts and projections are shown only for your own swimmer.
              </p>
            )}
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
