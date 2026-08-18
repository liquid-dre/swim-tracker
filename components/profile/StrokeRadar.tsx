"use client";

import { useState } from "react";

import { RadarArea } from "@/components/charts/radar-area";
import { RadarAxis } from "@/components/charts/radar-axis";
import { RadarChart } from "@/components/charts/radar-chart";
import { RadarGrid } from "@/components/charts/radar-grid";
import { RadarLabels } from "@/components/charts/radar-labels";
import type { RadarData, RadarMetric } from "@/components/charts/radar-context";

import { RADAR_STROKES, STROKE_LABEL } from "@/lib/strokeRadar";
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
  is GOOD at, on percent of world record — universal, so any swimmers overlay.

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
    pct: number | null;
    events: number;
    bestEvent: string | null;
  }>;
};

const METRICS: RadarMetric[] = RADAR_STROKES.map((s) => ({
  key: s,
  label: STROKE_LABEL[s],
}));

export function StrokeRadar({
  swimmers,
  course,
  size = 380,
}: {
  swimmers: RadarSwimmer[];
  course: Course;
  size?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  if (swimmers.length === 0) return null;

  const data: RadarData[] = swimmers.map((s, i) => ({
    label: s.name,
    color: seriesColor(i),
    values: Object.fromEntries(
      // A null stays null: the vendored RadarArea carries a LOCAL EDIT that
      // draws it as a break in the outline instead of a point on the axis.
      s.strokes.map((st) => [st.stroke, st.pct]),
    ),
  }));

  // Anyone missing a stroke entirely — named in words, because a gap in a
  // polygon is only unambiguous once you know it means "not raced".
  const gaps = swimmers
    .map((s) => ({
      name: s.name,
      missing: s.strokes.filter((st) => st.pct === null).map((st) => STROKE_LABEL[st.stroke]),
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

      {/* The scale, in words. "80" on a ring means nothing without this. */}
      <p className="text-center text-xs text-ink-faint">
        Each spoke is the swimmer’s average{" "}
        <strong className="font-medium text-ink-muted">
          percentage of the world record
        </strong>{" "}
        across the {course === "LCM" ? "long" : "short"}-course events they have
        raced in that stroke — further out is faster. Compare the SHAPE:
        an older swimmer’s polygon is larger everywhere.
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
          Stroke profile as a percentage of the world record,{" "}
          {course === "LCM" ? "long" : "short"} course
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
                  {st.pct === null ? "Not raced" : `${st.pct.toFixed(1)}%`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
