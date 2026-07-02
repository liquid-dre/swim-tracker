"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Radar, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { FilterBar } from "@/components/ui/FilterBar";
import { useContainerWidth } from "@/hooks/use-container-width";
import { trailForHref } from "@/lib/nav";
import { StrokeWheel } from "./StrokeWheel";
import { STROKE_META, WHEEL_STROKE_ORDER, type ProfileEvent } from "./strokeProfile";

/*
  Stroke profile (Step 12.5, BRD §5). A radial wheel of a swimmer's events grouped
  by stroke, calibrated per-event against the L2/L3/SANJ cuts (LCM only). A coach
  can place up to four swimmers on the same calibrated scale to read strength
  distributions (e.g. picking medley-relay legs); a viewer sees only their own
  swimmer(s) — no other-swimmer picker, no side-by-side — enforced server-side.

  Layout by count so no wheel is squashed (Step R9): 1 = a single centred wheel;
  2 = a 1×2 row (side by side on desktop, never stacked); 3–4 = a 2×2 grid (3
  leaves one empty cell). Below `sm` every layout collapses to a single stacked
  column, one wheel per row, each sized to its own cell so it stays legible.
*/

const MAX_COMPARE = 4;
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

  const isCompare = selected.length > 1;

  // The single wheel is clamped to the space the panels row actually has, so the
  // fixed SVG never overflows the gutter at ~375px. The row is full-width and
  // stable (its width comes from the page, not the wheel), so measuring it avoids
  // the shrink-to-fit feedback a per-card measurement would hit. In compare mode
  // each wheel instead measures its OWN grid cell (see WheelPanel) — cells have
  // deterministic 1fr widths, so that measurement is feedback-safe and every
  // wheel scales to fit whether it's a 1×2 row, a 2×2 grid, or a mobile stack.
  const [panelsRef, panelsWidth] = useContainerWidth(1024);
  const singleSize = Math.max(240, Math.min(380, Math.floor(panelsWidth) - 40));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stroke profile"
        breadcrumb={trailForHref("/stroke-profile")}
        description="Each bar is one event’s fastest long-course meet time, placed on that event’s own L2/L3/SANJ scale — further out is faster. Bars are grouped into coloured stroke arcs. Trials and practice never count."
      />

      {/* Slim toolbar: who inline; coverage on the right. The wheel leads. */}
      <FilterBar
        primary={
          loading ? (
            <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-2" />
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
          )
        }
        trailing={
          <Segmented
            ariaLabel="Event coverage"
            value={coverage}
            onChange={setCoverage}
            options={[
              { value: "full", label: "Full coverage" },
              { value: "all", label: "Include partial" },
            ]}
          />
        }
      />

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
            ref={panelsRef}
            className={
              isCompare
                ? "grid grid-cols-1 gap-5 sm:grid-cols-2"
                : "flex justify-center"
            }
          >
            {selected.map((id) => (
              <WheelPanel
                key={id}
                swimmerId={id}
                coverage={coverage}
                size={singleSize}
                autoSize={isCompare}
                compact={isCompare}
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
  autoSize,
  compact,
}: {
  swimmerId: Id<"swimmers">;
  coverage: Coverage;
  size: number;
  // Compare mode: measure this wheel's own grid cell and fit the SVG to it, so
  // it scales down cleanly from a desktop 2×2 cell to a full-width mobile row.
  autoSize: boolean;
  compact: boolean;
}) {
  const data = useQuery(api.analysis.getStrokeProfile, { swimmerId });

  // Measure the cell's inner content width (card padding already excluded). Grid
  // cells are 1fr, so this is stable — no wheel→card→wheel feedback. Ignored when
  // autoSize is off (the single wheel gets its size from the row instead).
  const [fitRef, fitWidth] = useContainerWidth(320);
  const wheelSize = autoSize
    ? Math.max(240, Math.min(360, Math.floor(fitWidth)))
    : size;

  const events: ProfileEvent[] = useMemo(() => {
    const all = (data?.events ?? []) as ProfileEvent[];
    return coverage === "full" ? all.filter((e) => e.fullCoverage) : all;
  }, [data, coverage]);

  const partialCount = useMemo(
    () => (data?.events ?? []).filter((e) => !e.fullCoverage).length,
    [data],
  );

  return (
    <section
      ref={fitRef}
      className="flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6"
    >
      {data === undefined ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div
            className="animate-pulse rounded-full bg-surface-2"
            style={{ width: wheelSize, height: wheelSize }}
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
            <StrokeWheel
              events={events}
              size={wheelSize}
              title={data.swimmer.name}
            />
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

  // One wrapping row: the selected-swimmer chips followed by the add control, so
  // the whole picker sits in the slim toolbar.
  return (
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
      <div className="w-52">
        <Select
          aria-label="Add a swimmer to compare"
          placeholder={
            atMax
              ? `Comparing ${MAX_COMPARE} (the maximum)`
              : available.length === 0
                ? "All swimmers added"
                : "Add a swimmer…"
          }
          value=""
          disabled={atMax || available.length === 0}
          onValueChange={(v) => onAdd(v as Id<"swimmers">)}
          options={available.map((s) => ({
            value: s._id,
            label: `${s.name} · ${s.age}`,
          }))}
        />
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
    <div className="w-56">
      <Select
        aria-label="Swimmer"
        placeholder="Swimmer"
        value={value ?? ""}
        onValueChange={(v) => onChange(v as Id<"swimmers">)}
        options={swimmers.map((s) => ({
          value: s._id,
          label: `${s.name} · ${s.age}`,
        }))}
      />
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
