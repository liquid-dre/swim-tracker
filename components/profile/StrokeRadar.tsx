"use client";

import { useState } from "react";

import { RadarArea } from "@/components/charts/radar-area";
import { RadarAxis } from "@/components/charts/radar-axis";
import { RadarChart } from "@/components/charts/radar-chart";
import { RadarGrid } from "@/components/charts/radar-grid";
import { RadarLabels } from "@/components/charts/radar-labels";
import type { RadarData, RadarMetric } from "@/components/charts/radar-context";

import {
  RADAR_STROKES,
  STROKE_LABEL,
  type RadarMetricKind,
} from "@/lib/strokeRadar";
import type { Course, Stroke } from "@/lib/swim";
import { seriesColor } from "@/components/analysis/chartTheme";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/*
  The stroke COMPARISON radar (Step 12.5b) — "who is better at what stroke",
  several swimmers on one chart.

  It sits beside the wheel rather than replacing it, because the two answer
  different questions on deliberately different scales. The wheel asks what a
  swimmer can ENTER, measuring each event against the gala cuts they are
  eligible for; that is age-fair but only comparable within an entry window,
  since ring 2 means Level 3 at 14 and SANY at 18. The radar asks what a swimmer
  is GOOD at, on a universal scale, so any swimmers overlay.

  WHICH universal scale depends on the course: World Aquatics points (0-1000)
  where base times are loaded, percent of world record (0-100) where they are
  not — short course, today. Those are different rulers, so the metric is never
  assumed here. It arrives with the data and is named in three places that all
  change together: the ring labels, the caption, and the accessible table. A
  coach flipping the course toggle must never have to work out which yardstick
  they are looking at.

  Age-blind is the honest trade for that: a younger swimmer's polygon is smaller
  everywhere, so the read is its SHAPE — where it bulges, where it dents — not
  its size. That is exactly the comparison a coach picking medley-relay legs
  wants, and it is why five stroke spokes beat thirteen event spokes: four
  overlaid pentagons stay legible where four thirteen-gons do not.

  A stroke a swimmer has never raced is a GAP in their polygon, never a point at
  the hub — see components/charts/swim/radarPaths.ts.
*/

export type RadarSwimmer = {
  swimmerId: string;
  name: string;
  strokes: Array<{
    stroke: Stroke;
    /** On the chart's own 0..max scale — see `metric`. */
    value: number | null;
    events: number;
    bestEvent: string | null;
  }>;
};

/** How each metric names itself, everywhere it is written down. */
const METRIC_COPY: Record<
  RadarMetricKind,
  { name: string; format: (v: number) => string }
> = {
  POINTS: {
    name: "World Aquatics points",
    format: (v) => `${Math.round(v)} pts`,
  },
  WR_PCT: {
    name: "percentage of the world record",
    format: (v) => `${v.toFixed(1)}%`,
  },
};

const METRICS: RadarMetric[] = RADAR_STROKES.map((s) => ({
  key: s,
  label: STROKE_LABEL[s],
}));

export function StrokeRadar({
  swimmers,
  course,
  metric,
  max,
  size = 380,
}: {
  swimmers: RadarSwimmer[];
  course: Course;
  /** Which scale the values are on. Never inferred — the query decides. */
  metric: RadarMetricKind;
  /** Top of that scale, so the rings label themselves in the right units. */
  max: number;
  size?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  if (swimmers.length === 0) return null;

  const copy = METRIC_COPY[metric];
  const courseWord = course === "LCM" ? "long" : "short";

  const data: RadarData[] = swimmers.map((s, i) => ({
    label: s.name,
    color: seriesColor(i),
    values: Object.fromEntries(
      // A null stays null: the vendored RadarArea carries a LOCAL EDIT that
      // draws it as a break in the outline instead of a point on the axis.
      s.strokes.map((st) => [st.stroke, st.value]),
    ),
  }));

  // Anyone missing a stroke entirely — named in words, because a gap in a
  // polygon is only unambiguous once you know it means "not raced".
  const gaps = swimmers
    .map((s) => ({
      name: s.name,
      missing: s.strokes
        .filter((st) => st.value === null)
        .map((st) => STROKE_LABEL[st.stroke]),
    }))
    .filter((g) => g.missing.length > 0);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex justify-center">
        <RadarChart
          animate={!reduced}
          data={data}
          hoveredIndex={hovered}
          levels={5}
          metrics={METRICS}
          onHoverChange={setHovered}
          size={size}
          // The rings label themselves in the active metric's units, so a
          // "600" ring is 600 points and never a mis-read percentage.
          valueMax={max}
        >
          <RadarGrid showLabels />
          <RadarAxis />
          <RadarLabels />
          {data.map((d, i) => (
            // showGlow defaults ON upstream, firing a 12px coloured
            // drop-shadow on hover. DESIGN.md §6 allows motion that conveys
            // state; a glow behind a polygon conveys none.
            <RadarArea index={i} key={d.label} showGlow={false} />
          ))}
        </RadarChart>
      </div>

      {/* The scale, in words. "600" on a ring means nothing without this, and
          it is the metric — not just the number — that changes with course. */}
      <p className="text-center text-xs text-ink-faint">
        Each spoke is the swimmer’s average{" "}
        <strong className="font-medium text-ink-muted">{copy.name}</strong>{" "}
        across the {courseWord}-course events they have raced in that stroke —
        further out is faster, and the rings run to {max}. Compare the SHAPE: an
        older swimmer’s polygon is larger everywhere.
        {metric === "WR_PCT" && (
          <>
            {" "}
            Short course is scored this way because World Aquatics’ short-course
            base times are not loaded yet, so it cannot be compared spoke-for-spoke
            with the long-course chart.
          </>
        )}
      </p>

      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {swimmers.map((s, i) => (
          <li
            key={s.swimmerId}
            className="flex items-center gap-1.5 text-xs"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ background: seriesColor(i) }}
            />
            <span className="font-medium text-ink">{s.name}</span>
          </li>
        ))}
      </ul>

      {gaps.length > 0 && (
        <p className="text-center text-xs text-ink-faint">
          {gaps.map((g) => `${g.name} has not raced ${g.missing.join(", ")}`).join(" · ")}
          {" — those spokes are left open, not scored zero."}
        </p>
      )}

      {/* The chart is decorative; this table is what assistive tech reads. */}
      <table className="sr-only">
        <caption>
          Stroke profile as {copy.name}, {courseWord} course
        </caption>
        <thead>
          <tr>
            <th scope="col">Swimmer</th>
            {RADAR_STROKES.map((s) => (
              <th key={s} scope="col">
                {STROKE_LABEL[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {swimmers.map((s) => (
            <tr key={s.swimmerId}>
              <th scope="row">{s.name}</th>
              {s.strokes.map((st) => (
                <td key={st.stroke}>
                  {st.value === null ? "Not raced" : copy.format(st.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
