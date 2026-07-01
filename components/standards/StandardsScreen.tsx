"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Plus, Ruler, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { TierBadge } from "@/components/ui/TierBadge";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import {
  DISTANCE_ORDER,
  STROKE_LABEL,
  STROKE_ORDER,
  eventLabel,
  findAgeInversions,
  tierCoversEvent,
  type Stroke,
  type Tier,
} from "@/lib/swim";
import { EditableTimeCell } from "./EditableTimeCell";
import { AddCutSheet, type AddCutPrefill } from "./AddCutSheet";
import { ImportStandardsSheet } from "./ImportStandardsSheet";
import {
  TIER_COLUMNS,
  ageKey,
  ageKindOf,
  ageLabel,
  ageSort,
  type StandardRow,
} from "./model";

type TierFilter = "ALL" | Tier;

export function StandardsScreen() {
  const profile = useCurrentProfile();
  const isCoach = profile?.role === "COACH";

  // Every underlying query is coach-gated server-side; only ask when allowed.
  const all = useQuery(api.standards.listStandards, isCoach ? {} : "skip");
  const events = useQuery(api.events.listActiveEvents, isCoach ? {} : "skip");
  const updateStandard = useMutation(api.standards.updateStandard);
  const deleteStandard = useMutation(api.standards.deleteStandard);

  const [gender, setGender] = useState<"F" | "M">("F");
  const [distanceSel, setDistanceSel] = useState<number | null>(null);
  const [strokeSel, setStrokeSel] = useState<Stroke | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");

  const [addTarget, setAddTarget] = useState<AddCutPrefill | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    id: Id<"standards">;
    newMs: number;
    message: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: Id<"standards">;
    label: string;
  } | null>(null);

  // Long-course events only — standards are LCM (§4.9).
  const lcmEvents = useMemo(
    () => (events ?? []).filter((e) => e.allowedCourses.includes("LCM")),
    [events],
  );
  const distances = useMemo(
    () => DISTANCE_ORDER.filter((d) => lcmEvents.some((e) => e.distance === d)),
    [lcmEvents],
  );

  // Effective selection is DERIVED, not stored: fall back to 100 Free (or the
  // nearest available), and keep the stroke valid as the distance changes —
  // no effects, no cascading setState.
  const distance =
    distanceSel ?? (distances.includes(100) ? 100 : (distances[0] ?? null));
  const strokesForDistance = useMemo(
    () =>
      distance === null
        ? []
        : STROKE_ORDER.filter((s) =>
            lcmEvents.some((e) => e.distance === distance && e.stroke === s),
          ),
    [lcmEvents, distance],
  );
  const stroke: Stroke | null =
    strokeSel && strokesForDistance.includes(strokeSel)
      ? strokeSel
      : strokesForDistance.includes("FREE")
        ? "FREE"
        : (strokesForDistance[0] ?? null);

  // ---- Build the age × tier grid for the selected event -------------------
  const grid = useMemo(() => {
    const columns = TIER_COLUMNS.filter(
      (t) => tierFilter === "ALL" || t === tierFilter,
    );

    const byTier = new Map<Tier, StandardRow[]>();
    for (const t of TIER_COLUMNS) byTier.set(t, []);
    if (all && distance !== null && stroke !== null) {
      for (const c of all) {
        if (c.gender === gender && c.distance === distance && c.stroke === stroke) {
          byTier.get(c.tier)!.push(c);
        }
      }
    }

    // Per-tier monotonicity messages, keyed by age identity (both sides flagged).
    const invMsg = new Map<Tier, Map<string, string>>();
    for (const t of TIER_COLUMNS) {
      const cuts = byTier.get(t)!;
      const m = new Map<string, string>();
      for (const { youngerIdx, olderIdx } of findAgeInversions(cuts)) {
        const y = cuts[youngerIdx];
        const o = cuts[olderIdx];
        m.set(ageKey(y), `Faster than the ${ageLabel(o)} cut. Check for a typo.`);
        m.set(ageKey(o), `Slower than the ${ageLabel(y)} cut. Check for a typo.`);
      }
      invMsg.set(t, m);
    }

    // Age rows = every age identity present across the visible tier columns.
    const reps = new Map<string, StandardRow>();
    for (const t of columns) {
      for (const c of byTier.get(t)!) {
        if (!reps.has(ageKey(c))) reps.set(ageKey(c), c);
      }
    }
    const rows = [...reps.values()]
      .sort((a, b) => ageSort(a) - ageSort(b))
      .map((rep) => ({ key: ageKey(rep), label: ageLabel(rep), rep }));

    return { columns, byTier, invMsg, rows };
  }, [all, gender, distance, stroke, tierFilter]);

  async function save(id: Id<"standards">, timeMs: number) {
    await notify.promise(updateStandard({ standardId: id, timeMs }), {
      loading: "Saving…",
      success: "Cut updated",
    });
  }

  // Edit → warn (don't block) if it puts a younger cut faster than an older one.
  function requestCommit(tier: Tier, row: StandardRow, newMs: number) {
    const cuts = grid.byTier.get(tier)!;
    const candidate = cuts.map((c) =>
      c._id === row._id ? { ...c, timeMs: newMs } : c,
    );
    const pair = findAgeInversions(candidate).find(
      (p) =>
        candidate[p.youngerIdx]._id === row._id ||
        candidate[p.olderIdx]._id === row._id,
    );
    if (pair) {
      const y = candidate[pair.youngerIdx];
      const o = candidate[pair.olderIdx];
      setPendingEdit({
        id: row._id,
        newMs,
        message: `This makes the ${ageLabel(y)} cut faster than the ${ageLabel(o)} cut, so a younger age would qualify faster than an older one. That's usually a typo. Save it anyway?`,
      });
      return;
    }
    void save(row._id, newMs);
  }

  // ---- Access + loading gates ---------------------------------------------
  if (profile === undefined) {
    return <ScreenFrame>{null}</ScreenFrame>;
  }
  if (!isCoach) {
    return (
      <ScreenFrame>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white px-6 py-16 text-center shadow-theme-sm">
          <Ruler aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">Coaches only</p>
            <p className="mx-auto max-w-[44ch] text-sm text-ink-muted">
              Qualifying cuts are managed by coaches. Ask your coach if a standard
              looks wrong.
            </p>
          </div>
        </div>
      </ScreenFrame>
    );
  }

  const loading = all === undefined || events === undefined || distance === null || stroke === null;
  const noData = all !== undefined && all.length === 0;

  return (
    <ScreenFrame
      actions={
        <>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import CSV
          </Button>
          <Button
            variant="primary"
            onClick={() => setAddTarget("new")}
            disabled={distance === null || stroke === null}
          >
            <Plus className="size-4" /> Add cut
          </Button>
        </>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterField label="Gender">
            <Segmented
              ariaLabel="Gender"
              value={gender}
              onChange={setGender}
              options={[
                { value: "F", label: "Girls" },
                { value: "M", label: "Boys" },
              ]}
            />
          </FilterField>
          <FilterField label="Tier">
            <Segmented
              ariaLabel="Tier filter"
              value={tierFilter}
              onChange={setTierFilter}
              options={[
                { value: "ALL", label: "All" },
                { value: "SANJ", label: "SANJ" },
                { value: "LEVEL_3", label: "L3" },
                { value: "LEVEL_2", label: "L2" },
              ]}
            />
          </FilterField>
        </div>

        <FilterField label="Event">
          <div className="flex flex-col gap-2">
            <ChipGroup
              ariaLabel="Distance"
              options={distances.map((d) => ({ value: String(d), label: String(d) }))}
              value={distance === null ? null : String(distance)}
              onChange={(v) => setDistanceSel(Number(v))}
            />
            {distance !== null && strokesForDistance.length > 0 && (
              <ChipGroup
                ariaLabel="Stroke"
                options={strokesForDistance.map((s) => ({
                  value: s,
                  label: STROKE_LABEL[s],
                }))}
                value={stroke}
                onChange={(v) => setStrokeSel(v as Stroke)}
              />
            )}
          </div>
        </FilterField>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">
            {distance !== null && stroke !== null
              ? `${gender === "F" ? "Girls" : "Boys"} · ${eventLabel(distance, stroke)}`
              : "Cuts"}
            <span className="ml-2 font-normal text-ink-muted">long course</span>
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <AlertTriangle aria-hidden className="size-3.5 text-warning-500" strokeWidth={2} />
            younger age faster than older: check for a typo
          </p>
        </div>

        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[28rem] text-base">
            <thead>
              <tr className="bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                  Age
                </th>
                {grid.columns.map((t) => (
                  <th key={t} scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex">
                      <TierBadge tier={t} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border" aria-hidden>
                    <td className="px-4 py-3 sm:px-5">
                      <Skeleton className="w-12" />
                    </td>
                    {grid.columns.map((t) => (
                      <td key={t} className="px-4 py-3">
                        <Skeleton className="ml-auto w-16" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                grid.rows.map(({ key, label, rep }) => (
                  <tr
                    key={key}
                    className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2/50"
                  >
                    <th
                      scope="row"
                      className="px-4 py-1.5 text-left text-sm font-medium tabular-nums text-ink sm:px-5"
                    >
                      {label}
                    </th>
                    {grid.columns.map((t) => {
                      const cut = grid.byTier.get(t)!.find((c) => ageKey(c) === key);
                      const covers =
                        distance !== null &&
                        stroke !== null &&
                        tierCoversEvent(t, distance, stroke);
                      return (
                        <td key={t} className="px-3 py-1.5">
                          {cut ? (
                            <EditableTimeCell
                              timeMs={cut.timeMs}
                              inverted={grid.invMsg.get(t)!.has(key)}
                              invTitle={grid.invMsg.get(t)!.get(key)}
                              onCommit={(ms) => requestCommit(t, cut, ms)}
                              onDelete={() =>
                                setPendingDelete({
                                  id: cut._id,
                                  label: `${label} ${eventLabel(distance!, stroke!)}`,
                                })
                              }
                            />
                          ) : covers ? (
                            <button
                              type="button"
                              onClick={() =>
                                setAddTarget({
                                  tier: t,
                                  kind: ageKindOf(rep),
                                  age: rep.age,
                                })
                              }
                              className="flex w-full items-center justify-end gap-1 rounded-md px-2 py-1 text-right text-sm text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
                              title="Add this cut"
                            >
                              <Plus className="size-3.5" aria-hidden />
                              <span className="sr-only">Add cut</span>
                              <span aria-hidden>add</span>
                            </button>
                          ) : (
                            <div
                              className="px-2 py-1 text-right text-sm text-ink-faint"
                              title="No cut at this tier for this event"
                            >
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && grid.rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Ruler aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">
                {noData ? "No standards loaded yet" : "No cuts for this event yet"}
              </p>
              <p className="mx-auto max-w-[46ch] text-sm text-ink-muted">
                {noData
                  ? "Import the cleaned qualifying-times CSV to get started, or add cuts one at a time."
                  : "Add a cut for this event, or switch events above."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {noData && (
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="size-4" /> Import CSV
                </Button>
              )}
              <Button
                variant={noData ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setAddTarget("new")}
              >
                <Plus className="size-4" /> Add cut
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add-cut sheet */}
      {distance !== null && stroke !== null && (
        <AddCutSheet
          key={
            addTarget === null
              ? "add-closed"
              : addTarget === "new"
                ? "add-new"
                : `add-${addTarget.tier}-${addTarget.kind}-${addTarget.age}`
          }
          open={addTarget !== null}
          onOpenChange={(o) => {
            if (!o) setAddTarget(null);
          }}
          gender={gender}
          distance={distance}
          stroke={stroke}
          prefill={addTarget === "new" || addTarget === null ? undefined : addTarget}
        />
      )}

      <ImportStandardsSheet
        key={importOpen ? "import-open" : "import-closed"}
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      {/* Monotonicity-breaking edit: warn, then save on confirm. */}
      <ConfirmDialog
        open={pendingEdit !== null}
        onOpenChange={(o) => {
          if (!o) setPendingEdit(null);
        }}
        title="Out-of-order cut"
        description={pendingEdit?.message ?? ""}
        confirmLabel="Save anyway"
        onConfirm={async () => {
          if (pendingEdit) await save(pendingEdit.id, pendingEdit.newMs);
          setPendingEdit(null);
        }}
      />

      {/* Delete a cut. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete this cut?"
        description={
          <>
            The <span className="font-medium text-ink">{pendingDelete?.label}</span> cut
            will be removed. Charts and the status matrix update immediately. You can
            re-add or re-import it later.
          </>
        }
        confirmLabel="Delete cut"
        onConfirm={async () => {
          if (pendingDelete) {
            await notify.promise(deleteStandard({ standardId: pendingDelete.id }), {
              loading: "Deleting…",
              success: "Cut deleted",
            });
          }
          setPendingDelete(null);
        }}
      />
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------

function ScreenFrame({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Standards"
        breadcrumb={trailForHref("/standards")}
        description="The LCM qualifying cuts that drive every chart and the status matrix. Edits take effect immediately."
        actions={actions}
      />
      {children}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "h-9 min-w-9 rounded-lg border px-3.5 text-sm font-medium tabular-nums outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
              (active
                ? "border-brand-500 bg-brand-50 text-brand-600"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}
