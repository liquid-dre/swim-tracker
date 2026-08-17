"use client";

import { useChart, useYScale } from "../chart-context";

/*
  Bars coloured per bar, each labelled with its exact value.

  bklit's `Bar` takes ONE `fill` for the whole series and has no value labels
  (Recharts' `Cell` and `LabelList` have no equivalent). The comparison chart
  needs both: every bar is coloured by the hardest gala that swimmer's PB meets —
  that colouring is the whole point of the view when no single age is pinned, and
  it has a legend — and every bar carries its exact time so the chart never asks
  the eye to estimate a swim time off a length.

  So the bars in that one chart are ours. Everything around them is still
  bklit's: the shell, the band and value scales, the category axis, the hover
  state, the tooltip, the grid. This component only reads `barScale` / `bandWidth`
  from context and draws, exactly as bklit's own `Bar` does.

  Attendance keeps bklit's `Bar` — uniform colour, no labels, nothing missing.
*/

export type SwimBar = {
  key: string;
  /** Category value — must match the chart's `xDataKey` for this row. */
  category: string;
  value: number;
  fill: string;
  /** Text at the bar's end, e.g. the formatted time. Omit for no label. */
  label?: string;
};

export interface SwimBarsProps {
  bars: ReadonlyArray<SwimBar>;
  /** Cap on bar thickness so a short roster does not draw slabs. Default: 26 */
  maxBarSize?: number;
  /** Corner radius on the growing end. Default: 4 */
  radius?: number;
  labelColor?: string;
  yAxisId?: string | number;
}

export function SwimBars({
  bars,
  maxBarSize = 26,
  radius = 4,
  labelColor = "var(--color-gray-700)",
  yAxisId,
}: SwimBarsProps) {
  const { barScale, bandWidth, orientation, innerHeight } = useChart();
  const yScale = useYScale(yAxisId);

  if (!(barScale && bandWidth)) return null;
  const horizontal = orientation === "horizontal";
  const thickness = Math.min(bandWidth, maxBarSize);
  const zero = yScale(0);

  return (
    <g className="chart-swim-bars">
      {bars.map((bar) => {
        const band = barScale(bar.category);
        if (band === undefined) return null;
        // Centre the bar in its band when maxBarSize has narrowed it.
        const offset = band + (bandWidth - thickness) / 2;
        const end = yScale(bar.value);

        if (horizontal) {
          const width = Math.max(0, end - zero);
          return (
            <g key={bar.key}>
              <rect
                fill={bar.fill}
                height={thickness}
                rx={radius}
                width={width}
                x={zero}
                y={offset}
              />
              {bar.label ? (
                <text
                  className="tnum"
                  dominantBaseline="middle"
                  fill={labelColor}
                  fontSize={12}
                  x={zero + width + 8}
                  y={offset + thickness / 2}
                >
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        }

        // Vertical: the bar grows upward from the baseline, so its top is `end`.
        const height = Math.max(0, zero - end);
        return (
          <g key={bar.key}>
            <rect
              fill={bar.fill}
              height={height}
              rx={radius}
              width={thickness}
              x={offset}
              y={end}
            />
            {bar.label ? (
              <text
                className="tnum"
                fill={labelColor}
                fontSize={12}
                textAnchor="middle"
                x={offset + thickness / 2}
                y={Math.max(10, end - 6)}
              >
                {bar.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {/* A zero baseline only makes sense on a vertical chart, where the bars
          stand on it; horizontally the category axis already marks the origin. */}
      {horizontal ? null : (
        <line
          stroke="var(--color-gray-300)"
          strokeWidth={1}
          x1={0}
          x2={barScale.range()[1]}
          y1={innerHeight}
          y2={innerHeight}
        />
      )}
    </g>
  );
}

SwimBars.displayName = "SwimBars";

export default SwimBars;
