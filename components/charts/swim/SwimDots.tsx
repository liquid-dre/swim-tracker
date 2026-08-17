"use client";

import { useChart, useYScale } from "../chart-context";

/*
  Per-point swim marks.

  A dot on the progression chart carries meaning beyond position: whether the
  swim was an official meet, a time trial or practice, the swimmer's personal
  best, or a parent-entered school gala (unofficial, §R15). Four marks, chosen
  per point.

  bklit's `SeriesMarkers` cannot express that — its props are series-wide
  scalars (`fill`, `radius`, `ringGap`) and it only ever draws a circle. So this
  is ours, reading position from the same context `SeriesMarkers` does.

  `__isPostOverlay` puts the marks after the interaction overlay in the vendored
  layer order, which is what keeps them hoverable — the same escape hatch
  bklit's own marker components use.
*/

/** What a point encodes. Kept as a closed set so a new swim type must be decided on. */
export type SwimMark = "meet" | "trial" | "pb" | "schoolGala";

export interface SwimDotsProps {
  /** Row key holding this series' value (ms). Rows without a number are skipped. */
  dataKey: string;
  /** Row key holding this point's `SwimMark`. */
  markKey: string;
  /** Series colour — the meet/trial/PB marks take it; a school gala never does. */
  color: string;
  yAxisId?: string | number;
}

/** Radii, in one place so the four marks stay in proportion to each other. */
const R = { pbRing: 7, pbCore: 4, meet: 3.5, trial: 3, gala: 4.5 } as const;

function Mark({
  mark,
  cx,
  cy,
  color,
}: {
  mark: SwimMark;
  cx: number;
  cy: number;
  color: string;
}) {
  if (mark === "schoolGala") {
    // A distinct hollow DIAMOND in the warning tone — never a filled/PB dot and
    // never the same hollow circle as a trial, so it reads at a glance as "on
    // the trajectory, but not an official time".
    const r = R.gala;
    return (
      <path
        d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`}
        fill="var(--color-gray-25)"
        stroke="var(--color-warning-500)"
        strokeWidth={1.75}
      />
    );
  }

  if (mark === "pb") {
    // Filled core with an outer ring, so the PB reads as the anchor point.
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          opacity={0.35}
          r={R.pbRing}
          stroke={color}
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          fill={color}
          r={R.pbCore}
          stroke="var(--color-gray-25)"
          strokeWidth={1.5}
        />
      </g>
    );
  }

  if (mark === "meet") {
    return (
      <circle
        cx={cx}
        cy={cy}
        fill={color}
        r={R.meet}
        stroke="var(--color-gray-25)"
        strokeWidth={1}
      />
    );
  }

  // Trial / practice: hollow.
  return (
    <circle
      cx={cx}
      cy={cy}
      fill="var(--color-gray-25)"
      r={R.trial}
      stroke={color}
      strokeWidth={1.5}
    />
  );
}

export function SwimDots({ dataKey, markKey, color, yAxisId }: SwimDotsProps) {
  const { data, xScale, xAccessor } = useChart();
  const yScale = useYScale(yAxisId);

  return (
    <g className="chart-swim-dots">
      {data.map((row, index) => {
        const value = row[dataKey];
        // A gap in one swimmer's series (no swim on this date) is a gap, not a
        // zero — skip it rather than planting a dot on the axis.
        if (typeof value !== "number") return null;
        const mark = (row[markKey] as SwimMark | undefined) ?? "trial";
        return (
          <Mark
            color={color}
            cx={xScale(xAccessor(row))}
            cy={yScale(value)}
            key={`${dataKey}-${index}`}
            mark={mark}
          />
        );
      })}
    </g>
  );
}

SwimDots.displayName = "SwimDots";
// Render after the interaction overlay so the marks stay clickable — the same
// hook bklit's own marker components use (see chart-child-passthrough.ts).
(SwimDots as unknown as { __isPostOverlay: boolean }).__isPostOverlay = true;

export default SwimDots;
