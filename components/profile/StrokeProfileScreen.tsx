"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Radar, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { trailForHref } from "@/lib/nav";
import { StrokeWheel } from "./StrokeWheel";
import { STROKE_META, WHEEL_STROKE_ORDER, type ProfileEvent } from "./strokeProfile";

/*
  Stroke profile (Step 12.5, BRD §5). A radial wheel of a swimmer's events grouped
  by stroke, calibrated per-event against the L2/L3/SANJ cuts (LCM only). A coach
  can place up to three swimmers side by side on the same scale to read strength
  distributions (e.g. picking medley-relay legs); a viewer sees only their own
  swimmer(s) — no other-swimmer picker, no side-by-side — enforced server-side.
*/

const MAX_COMPARE = 3;
type Coverage = "full" | "all";

export function StrokeProfileScreen() {
  const data = useQuery(api.swimmers.listForProfile, {});
  const [picked, setPicked] = useState<Id<"swimmers">[]>([]);
  const [coverage, setCoverage] = useState<Coverage>("full");

  const role = data?.role;
  const swimmers = useMemo(() => data?.swimmers ?? [], [data]);
  const isCoach = role === "COACH";
  const canCompare = isCoach;

  // Effective selection is derived, not stored: raw picks filtered to swimmers
  // that still exist, defaulting to the first swimmer when nothing valid is
  // chosen yet. This keeps the default without a state-syncing effect, and the
  // list self-heals if a swimmer disappears underneath the selection.
  const selected = useMemo(() => {
    const valid = picked.filter((id) => swimmers.some((s) => s._id === id));
    if (valid.length > 0) return valid;
    return swimmers.length > 0 ? [swimmers[0]._id] : [];
  }, [picked, swimmers]);

  const nameById = useMemo(
    () => new Map(swimmers.map((s) => [s._id, s.name] as const)),
    [swimmers],
  );

  function addSwimmer(id: Id<"swimmers">) {
    if (selected.includes(id) || selected.length >= MAX_COMPARE) return;
    setPicked([...selected, id]);
  }
  function removeSwimmer(id: Id<"swimmers">) {
    if (selected.length <= 1) return;
    setPicked(selected.filter((x) => x !== id));
  }
  function pickSingle(id: Id<"swimmers">) {
    setPicked([id]);
  }

  const loading = data === undefined;
  const wheelSize = selected.length > 1 ? 300 : 380;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stroke profile"
        breadcrumb={trailForHref("/stroke-profile")}
        description="Each bar is one event’s fastest long-course meet time, placed on that event’s own L2/L3/SANJ scale — further out is faster. Bars are grouped into coloured stroke arcs. Trials and practice never count."
      />

      {/* Controls: who + coverage */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">
              {canCompare ? "Swimmers" : "Swimmer"}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {canCompare
                ? `Compare up to ${MAX_COMPARE} on one shared scale — for reading strength across strokes.`
                : "Your linked swimmer’s profile."}
            </p>
            <div className="mt-3">
              {loading ? (
                <div className="h-11 w-64 animate-pulse rounded-lg bg-surface-2" />
              ) : swimmers.length === 0 ? (
                <p className="text-sm text-ink-muted">No swimmers available.</p>
              ) : canCompare ? (
                <CoachPicker
                  swimmers={swimmers}
                  selected={selected}
                  onAdd={addSwimmer}
                  onRemove={removeSwimmer}
                  nameById={nameById}
                />
              ) : (
                <ViewerPicker
                  swimmers={swimmers}
                  value={selected[0]}
                  onChange={pickSingle}
                />
              )}
            </div>
          </div>

          <div className="md:text-right">
            <h2 className="text-sm font-semibold text-ink">Events</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Partial events show only the rings they have.
            </p>
            <div className="mt-3 md:flex md:justify-end">
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
          </div>
        </div>
      </section>

      {loading ? (
        <WheelSkeleton />
      ) : selected.length === 0 ? (
        <EmptyState
          title="Choose a swimmer"
          body="Pick a swimmer above to draw their stroke profile."
        />
      ) : (
        <>
          <div
            className={
              selected.length > 1
                ? "grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                : "flex justify-center"
            }
          >
            {selected.map((id) => (
              <WheelPanel
                key={id}
                swimmerId={id}
                coverage={coverage}
                size={wheelSize}
                compact={selected.length > 1}
              />
            ))}
          </div>

          <Legend />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One swimmer's wheel — its own authorised read (compare = N of these)
// ---------------------------------------------------------------------------

function WheelPanel({
  swimmerId,
  coverage,
  size,
  compact,
}: {
  swimmerId: Id<"swimmers">;
  coverage: Coverage;
  size: number;
  compact: boolean;
}) {
  const data = useQuery(api.analysis.getStrokeProfile, { swimmerId });

  const events: ProfileEvent[] = useMemo(() => {
    const all = (data?.events ?? []) as ProfileEvent[];
    return coverage === "full" ? all.filter((e) => e.fullCoverage) : all;
  }, [data, coverage]);

  const partialCount = useMemo(
    () => (data?.events ?? []).filter((e) => !e.fullCoverage).length,
    [data],
  );

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      {data === undefined ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div
            className="animate-pulse rounded-full bg-surface-2"
            style={{ width: size, height: size }}
          />
        </div>
      ) : data === null ? (
        <PanelMessage
          name="Swimmer unavailable"
          body="This swimmer may have been removed."
        />
      ) : (
        <>
          <header className="flex w-full items-baseline justify-between gap-3">
            <h3 className="truncate text-sm font-semibold text-ink">
              {data.swimmer.name}
            </h3>
            <span className="shrink-0 text-xs text-ink-faint tabular-nums">
              age {data.swimmer.age}
              {!data.swimmer.active && " · inactive"}
            </span>
          </header>

          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <p className="text-sm font-medium text-ink">Nothing to plot yet</p>
              <p className="max-w-[32ch] text-xs text-ink-muted">
                {coverage === "full" && partialCount > 0
                  ? "No full-coverage events at this age — switch to “Include partial” to see the rest."
                  : "No long-course qualifying cuts apply at this swimmer’s exact age."}
              </p>
            </div>
          ) : (
            <StrokeWheel events={events} size={size} title={data.swimmer.name} />
          )}

          {events.length > 0 && coverage === "full" && partialCount > 0 && (
            <p className="text-xs text-ink-faint">
              {partialCount} partial-coverage {partialCount === 1 ? "event" : "events"}{" "}
              hidden
            </p>
          )}
          {!compact && events.length > 0 && (
            <p className="text-2xs leading-tight text-ink-faint">
              Hover or focus a bar for the PB and every cut.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

type SwimmerLite = { _id: Id<"swimmers">; name: string; age: number };

function CoachPicker({
  swimmers,
  selected,
  onAdd,
  onRemove,
  nameById,
}: {
  swimmers: SwimmerLite[];
  selected: Id<"swimmers">[];
  onAdd: (id: Id<"swimmers">) => void;
  onRemove: (id: Id<"swimmers">) => void;
  nameById: Map<Id<"swimmers">, string>;
}) {
  const available = swimmers.filter((s) => !selected.includes(s._id));
  const atMax = selected.length >= MAX_COMPARE;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-2 py-1 pl-3 pr-1.5 text-sm text-ink"
          >
            {nameById.get(id) ?? "—"}
            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(id)}
                aria-label={`Remove ${nameById.get(id) ?? "swimmer"}`}
                className="flex size-5 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-gray-200 hover:text-ink"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="relative max-w-sm">
        <select
          aria-label="Add a swimmer to compare"
          value=""
          disabled={atMax || available.length === 0}
          onChange={(e) => e.target.value && onAdd(e.target.value as Id<"swimmers">)}
          className="h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-9 text-sm text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50"
        >
          <option value="">
            {atMax
              ? `Comparing ${MAX_COMPARE} (the maximum)`
              : available.length === 0
                ? "All swimmers added"
                : "Add a swimmer…"}
          </option>
          {!atMax &&
            available.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} · {s.age}
              </option>
            ))}
        </select>
        <Chevron />
      </div>
    </div>
  );
}

function ViewerPicker({
  swimmers,
  value,
  onChange,
}: {
  swimmers: SwimmerLite[];
  value: Id<"swimmers"> | undefined;
  onChange: (id: Id<"swimmers">) => void;
}) {
  // A single linked swimmer needs no control — just name the swimmer.
  if (swimmers.length === 1) {
    return (
      <p className="text-sm text-ink">
        {swimmers[0].name}
        <span className="ml-1.5 text-ink-faint tabular-nums">· age {swimmers[0].age}</span>
      </p>
    );
  }
  return (
    <div className="relative max-w-sm">
      <select
        aria-label="Swimmer"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as Id<"swimmers">)}
        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-9 text-base text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
      >
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
// Legend + states
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-theme-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
      <p className="border-t border-border pt-2.5 text-xs text-ink-muted">
        The three dashed grey rings are the{" "}
        <span className="text-ink">L2</span>, <span className="text-ink">L3</span> and{" "}
        <span className="text-ink">SANJ</span> cuts. <span className="text-ink">Outward = faster</span>{" "}
        — a bar reaching past a ring beat that cut. Partial-coverage events show only the rings that
        exist for them.
      </p>
    </div>
  );
}

function PanelMessage({ name, body }: { name: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-ink">{name}</p>
      <p className="max-w-[32ch] text-xs text-ink-muted">{body}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Radar aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function WheelSkeleton() {
  return (
    <div className="flex justify-center" aria-busy>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
        <div className="size-80 animate-pulse rounded-full bg-surface-2" />
      </div>
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
