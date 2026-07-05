"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Grid3x3 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { TierBadge } from "@/components/ui/TierBadge";
import { trailForHref } from "@/lib/nav";
import { swimmerProfileBase } from "@/lib/swimmerHref";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { DEFAULT_AGE_BANDS, formatTime, type Tier } from "@/lib/swim";

/*
  Qualification status matrix (Step 11, BRD §5.7) — the "who's ready for what"
  planning surface. Rows = swimmers, columns = LCM events. Each cell shows the
  hardest qualifying tier the swimmer's headline MEET PB meets, plus the gap to
  the next tier up. LCM only (standards are long-course). Cuts resolve to each
  swimmer's EXACT single-year age; the age-band filter is display-only and never
  leaks into a lookup. Blank where no cut exists for the event at that age.

  Density is everything here: a sticky header row and sticky swimmer column keep
  the grid readable while it scrolls, tabular figures align every gap, and every
  cell carries colour AND a text label (never colour alone).
*/

type GenderFilter = "ALL" | "M" | "F";
type BandFilter = "ALL" | string;
type SquadFilter = "ALL" | string;

// Short target label for the "next tier up" hint (matches TierBadge vocabulary).
const NEXT_LABEL: Record<Tier, string> = {
  SANJ: "SANJ",
  LEVEL_3: "L3",
  LEVEL_2: "L2",
};

export function StatusMatrixScreen() {
  const pathname = usePathname();
  const swimmerBase = swimmerProfileBase(pathname);
  const [gender, setGender] = useState<GenderFilter>("ALL");
  const [band, setBand] = useState<BandFilter>("ALL");
  const [squad, setSquad] = useState<SquadFilter>("ALL");

  // Squad is a coach concept — a viewer sees only their own linked swimmers, so
  // the squad filter (and the coach-only listSquads query) is hidden for them.
  const profile = useCurrentProfile();
  const showSquad = profile !== undefined && profile !== null && profile.role !== "VIEWER";
  const squads = useQuery(api.squads.listSquads, showSquad ? {} : "skip");

  // A squad that vanished (deleted elsewhere) falls back to "all squads".
  const effectiveSquad: SquadFilter =
    squad !== "ALL" && squads?.some((s) => s._id === squad) ? squad : "ALL";

  const live = useQuery(api.analysis.getQualificationMatrix, {
    gender: gender === "ALL" ? undefined : gender,
    ageBand: band === "ALL" ? undefined : band,
    squadId:
      effectiveSquad === "ALL" ? undefined : (effectiveSquad as Id<"squads">),
  });

  // Keep the last grid on screen while a filter change refetches — the coach
  // toggles filters constantly, and replacing the whole grid with a skeleton on
  // every toggle reads as a flicker. The skeleton shows only on the first load.
  // Caching the last result via a guarded setState DURING render is React's
  // sanctioned "store previous value" pattern (not an effect, so no flicker).
  const [snapshot, setSnapshot] = useState<typeof live>(undefined);
  if (live !== undefined && live !== snapshot) setSnapshot(live);
  const data = live ?? snapshot;
  const refetching = live === undefined && snapshot !== undefined;

  const events = data?.events ?? [];
  const rows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Qualification status"
        breadcrumb={trailForHref(pathname)}
        description="Who's ready for what. Each swimmer's hardest long-course tier met per event, with the gap to the next tier up. Meet times only — trials and practice never count."
      />

      {/* Slim toolbar: all three cross-cutting filters behind the popover so the
          matrix itself is the hero. */}
      <FilterBar
        filters={
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
            <FilterField label="Age band">
              <Select
                aria-label="Filter by age band"
                value={band}
                onValueChange={setBand}
                options={[
                  { value: "ALL", label: "All age bands" },
                  ...DEFAULT_AGE_BANDS.map((b) => ({ value: b.label, label: b.label })),
                ]}
              />
            </FilterField>
            {showSquad && (
              <FilterField label="Squad">
                <Select
                  aria-label="Filter by squad"
                  value={effectiveSquad}
                  onValueChange={setSquad}
                  options={[
                    { value: "ALL", label: "All squads" },
                    ...(squads ?? []).map((s) => ({ value: s._id, label: s.name })),
                  ]}
                />
              </FilterField>
            )}
          </>
        }
        filterCount={
          (gender !== "ALL" ? 1 : 0) +
          (band !== "ALL" ? 1 : 0) +
          (showSquad && effectiveSquad !== "ALL" ? 1 : 0)
        }
        onClear={() => {
          setGender("ALL");
          setBand("ALL");
          setSquad("ALL");
        }}
      />

      {data === undefined ? (
        <MatrixSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No swimmers match these filters"
          body="Widen the gender, age band, or squad filters. Standards compare against long-course meet times, resolved to each swimmer's exact age."
        />
      ) : (
        <>
          {/* The card hugs the table (w-fit) instead of stretching to the full
              content width — so a matrix with only a few events sits compact and
              left-aligned rather than flinging its columns to the right edge with
              a dead band beside them. max-w-full + the inner overflow-auto keep a
              wide matrix scrollable; self-start stops the flex column stretching
              it back to full width. */}
          <div
            className="w-fit max-w-full self-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm transition-opacity [transition-duration:var(--dur-1)]"
            style={{ opacity: refetching ? 0.55 : 1 }}
            aria-busy={refetching}
          >
            <div className="max-h-[70vh] overflow-auto custom-scrollbar">
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {/* Corner: sticky on both axes so it never scrolls away. */}
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                    >
                      Swimmer
                    </th>
                    {events.map((e) => (
                      <th
                        key={`${e.distance}|${e.stroke}`}
                        scope="col"
                        className="sticky top-0 z-20 border-b border-l border-gray-200 bg-gray-50 px-2.5 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-gray-500"
                      >
                        <span className="whitespace-nowrap tabular-nums">
                          {e.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.swimmerId} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap border-b border-gray-100 bg-white px-4 py-2.5 text-left align-middle font-medium text-ink transition-colors group-hover:bg-aqua-50"
                      >
                        <Link
                          href={`${swimmerBase}/${r.swimmerId}`}
                          className="rounded-sm outline-none hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {r.name}
                        </Link>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-ink-faint">
                          <span className="tabular-nums">{r.ageBand}</span>
                          <span aria-hidden>·</span>
                          <span>{r.gender === "F" ? "Female" : "Male"}</span>
                          {!r.active && (
                            <>
                              <span aria-hidden>·</span>
                              <span>Inactive</span>
                            </>
                          )}
                        </span>
                      </th>
                      {r.cells.map((c) => (
                        <MatrixCell
                          key={`${c.distance}|${c.stroke}`}
                          eventLabel={c.label}
                          swimmer={r.name}
                          hasCut={c.hasCut}
                          pbMs={c.pbMs}
                          tier={c.tier}
                          nextTier={c.nextTier}
                          gapMs={c.gapMs}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1">
            <Legend />
            <p className="text-xs text-ink-faint">
              {rows.length} {rows.length === 1 ? "swimmer" : "swimmers"} ·{" "}
              {events.length} long-course events
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell
// ---------------------------------------------------------------------------

function MatrixCell({
  eventLabel,
  swimmer,
  hasCut,
  pbMs,
  tier,
  nextTier,
  gapMs,
}: {
  eventLabel: string;
  swimmer: string;
  hasCut: boolean;
  pbMs: number | null;
  tier: Tier | null;
  nextTier: Tier | null;
  gapMs: number | null;
}) {
  // Each event column sizes to its content (the table is content-width and the
  // card hugs it), so the cells stay compact and aligned under their header.
  const base =
    "whitespace-nowrap border-b border-l border-gray-100 px-2.5 py-2 text-center align-middle transition-colors group-hover:bg-aqua-50";

  // No cut for this event at the swimmer's exact age → blank/neutral (§5.7).
  if (!hasCut) {
    return (
      <td
        className={`${base} bg-gray-25/60`}
        title={`No qualifying cut for ${eventLabel} at this age`}
      >
        <span aria-hidden className="text-ink-faint/60">
          ·
        </span>
        <span className="sr-only">No cut</span>
      </td>
    );
  }

  // A cut exists, but no long-course meet time yet → dash, not a tier.
  if (pbMs === null) {
    return (
      <td className={base} title={`${swimmer}: no long-course meet time for ${eventLabel}`}>
        <span aria-hidden className="text-ink-faint">
          –
        </span>
        <span className="sr-only">No meet time</span>
      </td>
    );
  }

  const displayTier: Tier | "NONE" = tier ?? "NONE";
  const atTop = nextTier === null; // met the hardest available tier — nothing to chase

  const title =
    `${swimmer} · ${eventLabel} · PB ${formatTime(pbMs)}` +
    (tier ? ` · ${NEXT_LABEL[tier]} met` : " · no tier met") +
    (nextTier && gapMs !== null
      ? ` · ${formatTime(gapMs)} to ${NEXT_LABEL[nextTier]}`
      : "");

  return (
    <td className={base} title={title}>
      <div className="flex flex-col items-center gap-1">
        <TierBadge tier={displayTier} />
        {atTop ? (
          // Met the hardest tier this event HAS — nothing left to chase. Neutral
          // marker, not a green "qualified" flourish: on an L2-only event (a 50)
          // this is entry level, so celebrating it would overstate readiness.
          <span
            className="inline-flex items-center gap-1 text-2xs leading-none text-ink-faint"
            aria-hidden
          >
            <span>✓</span>
            <span>top</span>
          </span>
        ) : (
          nextTier &&
          gapMs !== null && (
            <span className="inline-flex items-center gap-1 text-2xs leading-none text-ink-muted">
              <span aria-hidden className="text-ink-faint">
                ▾
              </span>
              <span className="tabular-nums">{formatTime(gapMs)}</span>
              <span className="text-ink-faint">{NEXT_LABEL[nextTier]}</span>
            </span>
          )
        )}
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------------
// Legend + states
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
      <TierBadge tier="SANJ" />
      <TierBadge tier="LEVEL_3" />
      <TierBadge tier="LEVEL_2" />
      <TierBadge tier="NONE" />
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-ink-faint">
          ▾
        </span>
        time to next tier
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-ink-faint">
          ✓
        </span>
        hardest tier met
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-ink-faint">
          –
        </span>
        no meet time
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-ink-faint/60">
          ·
        </span>
        no cut
      </span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Grid3x3 aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div className="h-[420px] animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
