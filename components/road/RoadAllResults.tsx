"use client";

import { useMemo } from "react";

import { buildRingScale, type GalaCode } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { GALA_ORDER, GALA_SHORT, GALA_TOKEN } from "@/lib/galas";
import type { ProfileEvent } from "@/components/profile/strokeProfile";
import {
  AllTierLegend,
  AllTierProgress,
  type AllBar,
} from "./QualifyingProgress";

/*
  Road-to-qualify "All" mode (Step R3). Reuses the stroke-profile read (each
  event's cuts + the shared calibrated PB position + highest gala met, long
  course / exact-age / meet-PB) to draw one bar per event with a zone per ring,
  ranked by the hardest gala met. The zone count is the swimmer's own — the galas
  they can enter, so 2-4 — which is why the track is labelled per swimmer rather
  than with a fixed L2/L3/SANJ axis. Presentational: fed by the query, or the
  preview harness.
*/

export type AllData = {
  swimmer: { name: string; age: number; active: boolean };
  events: ProfileEvent[];
  /** The wheel/track rings, inner → outer, as `getStrokeProfile` returns them. */
  ringGalas: GalaCode[];
  /** Galas pinned to a tour day, and the age each judges this swimmer at. */
  tourDates: Partial<Record<GalaCode, string>>;
  tourAges: Partial<Record<GalaCode, number>>;
};

export function AllTierResults({ data }: { data: AllData }) {
  const events = data.events;
  const scale = useMemo(() => buildRingScale(data.ringGalas), [data.ringGalas]);

  const bars = useMemo<AllBar[]>(
    () =>
      events.map((e) => ({
        key: `${e.distance}|${e.stroke}`,
        label: e.label,
        pbMs: e.pbMs,
        cuts: e.cuts,
        calibratedRadius: e.calibratedRadius,
      })),
    [events],
  );

  const counts = useMemo(() => {
    const c = { none: 0, noTime: 0 } as Record<GalaCode | "none" | "noTime", number>;
    for (const gala of GALA_ORDER) c[gala] = 0;
    for (const e of events) {
      if (e.pbMs === null) c.noTime += 1;
      if (e.highestGala === null) {
        if (e.pbMs !== null) c.none += 1;
      } else {
        c[e.highestGala] += 1;
      }
    }
    return c;
  }, [events]);

  // Rings pinned to a tour day, hardest first like the chips. Each judges the
  // swimmer at their age ON THAT DAY, which is the one fact that explains a bar
  // stopping short of a cut the standards table (read at today's age) says it
  // beats — so it sits right under "age 10", and an age that differs is set in
  // the ink colour so the eye lands on it.
  const pinned = [...scale.order]
    .reverse()
    .flatMap((gala) => {
      const date = data.tourDates[gala];
      const age = data.tourAges[gala];
      return date !== undefined && age !== undefined ? [{ gala, date, age }] : [];
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-theme-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{data.swimmer.name}</span>
            <span className="text-ink-faint tabular-nums">age {data.swimmer.age}</span>
            {!data.swimmer.active && <span className="text-ink-faint">· inactive</span>}
          </div>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <Stat label="Applicable" value={String(events.length)} />
          {/* One chip per ring on this swimmer's track, hardest first — never a
              gala they cannot enter. */}
          {[...scale.order].reverse().map((gala) => (
            <Stat
              key={gala}
              label={GALA_SHORT[gala]}
              value={String(counts[gala])}
              tier={gala}
              muted={counts[gala] === 0}
            />
          ))}
        </div>
        {pinned.length > 0 && (
          <p className="text-xs text-ink-muted">
            Judged at age on tour day
            {pinned.map(({ gala, date, age }) => (
              <span key={gala}>
                <span aria-hidden> · </span>
                <span className="text-ink-faint">{GALA_SHORT[gala]}:</span>{" "}
                <span
                  className={
                    "tabular-nums " +
                    (age !== data.swimmer.age ? "font-medium text-ink" : "")
                  }
                >
                  {age}
                </span>{" "}
                on <time dateTime={date}>{formatShortDate(date)}</time>
              </span>
            ))}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Qualifying progress</h2>
          <p className="text-xs text-ink-faint">
            Easiest → hardest · fill = highest gala met
          </p>
        </div>
        <AllTierProgress bars={bars} scale={scale} />
        <AllTierLegend scale={scale} />
      </section>
    </div>
  );
}

const TIER_DOT: Record<GalaCode, string> = GALA_ORDER.reduce(
  (acc, gala) => {
    acc[gala] = `var(--color-tier-${GALA_TOKEN[gala]})`;
    return acc;
  },
  {} as Record<GalaCode, string>,
);

function Stat({
  label,
  value,
  tier,
  muted,
}: {
  label: string;
  value: string;
  tier?: GalaCode;
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
