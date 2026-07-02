"use client";

import { useMemo } from "react";

import type { Tier } from "@/lib/swim";
import type { ProfileEvent } from "@/components/profile/strokeProfile";
import {
  AllTierLegend,
  AllTierProgress,
  type AllBar,
} from "./QualifyingProgress";

/*
  Road-to-qualify "All" mode (Step R3). Reuses the stroke-profile read (all three
  cuts + the shared calibrated PB position + highest tier met, LCM / exact-age /
  meet-PB) to draw one bar per event with the L2/L3/SANJ zones, ranked by the
  hardest tier met. Presentational — fed by the query, or the preview harness.
*/

export type AllData = {
  swimmer: { name: string; age: number; active: boolean };
  events: ProfileEvent[];
};

export function AllTierResults({ data }: { data: AllData }) {
  const events = data.events;

  const bars = useMemo<AllBar[]>(
    () =>
      events.map((e) => ({
        key: `${e.distance}|${e.stroke}`,
        label: e.label,
        pbMs: e.pbMs,
        l2Ms: e.l2Ms,
        l3Ms: e.l3Ms,
        sanjMs: e.sanjMs,
        calibratedRadius: e.calibratedRadius,
      })),
    [events],
  );

  const counts = useMemo(() => {
    const c = { SANJ: 0, LEVEL_3: 0, LEVEL_2: 0, none: 0, noTime: 0 };
    for (const e of events) {
      if (e.pbMs === null) c.noTime += 1;
      if (e.highestTier === null) {
        if (e.pbMs !== null) c.none += 1;
      } else {
        c[e.highestTier] += 1;
      }
    }
    return c;
  }, [events]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-theme-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{data.swimmer.name}</span>
          <span className="text-ink-faint tabular-nums">age {data.swimmer.age}</span>
          {!data.swimmer.active && <span className="text-ink-faint">· inactive</span>}
        </div>
        <span aria-hidden className="h-3.5 w-px bg-border" />
        <Stat label="Target" value="All tiers" />
        <Stat label="Applicable" value={String(events.length)} />
        <Stat label="SANJ" value={String(counts.SANJ)} tier="SANJ" muted={counts.SANJ === 0} />
        <Stat label="L3" value={String(counts.LEVEL_3)} tier="LEVEL_3" muted={counts.LEVEL_3 === 0} />
        <Stat label="L2" value={String(counts.LEVEL_2)} tier="LEVEL_2" muted={counts.LEVEL_2 === 0} />
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Qualifying progress</h2>
          <p className="text-xs text-ink-faint">
            Easiest → hardest · fill = highest tier met
          </p>
        </div>
        <AllTierProgress bars={bars} />
        <AllTierLegend />
      </section>
    </div>
  );
}

const TIER_DOT: Record<Tier, string> = {
  SANJ: "var(--color-tier-sanj)",
  LEVEL_3: "var(--color-tier-l3)",
  LEVEL_2: "var(--color-tier-l2)",
};

function Stat({
  label,
  value,
  tier,
  muted,
}: {
  label: string;
  value: string;
  tier?: Tier;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {tier && (
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: TIER_DOT[tier], opacity: muted ? 0.4 : 1 }}
        />
      )}
      <span className="text-ink-muted">{label}</span>
      <span
        className={"font-medium tabular-nums " + (muted ? "text-ink-faint" : "text-ink")}
      >
        {value}
      </span>
    </div>
  );
}
