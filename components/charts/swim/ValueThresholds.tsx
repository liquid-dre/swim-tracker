"use client";

import { useChart, useYScale } from "../chart-context";

/*
  Threshold lines at fixed values on a BAR chart's value axis.

  This is the bar-chart sibling of GalaCutOverlay, and it is a separate component
  rather than a mode of it because the coordinate spaces genuinely differ: a
  progression cut is placed on a TIME x-scale and can step at a birthday, while a
  comparison threshold is a single value on the categorical chart's value scale,
  spanning every category.

  Which way the line runs follows the orientation, but the scale does not:
  `yScale` is the value scale in both, so a horizontal bar chart puts the line
  vertical at `yScale(v)` across the full height, and a vertical one puts it
  horizontal at `yScale(v)` across the full width.

  Each line is labelled with its gala's glyph and short label, because a
  qualifying standard is NEVER colour-only (DESIGN.md §3).
*/

export type Threshold = {
  key: string;
  value: number;
  /** Stroke colour for the line. */
  color: string;
  /**
   * Colour for the LABEL — the darker `-ink` variant, not `color`. The gala hues
   * are tuned to read as 1.5px strokes; at that lightness an 11px label fails
   * contrast on white (SANJ gold is about 2.4:1). See TIER_STYLE.
   */
  ink: string;
  dash: string;
  /** Rendered beside the line, e.g. "◆ SANJ". Never omit — colour alone is not a label. */
  label: string;
};

export interface ValueThresholdsProps {
  thresholds: ReadonlyArray<Threshold>;
  strokeWidth?: number;
  strokeOpacity?: number;
  yAxisId?: string | number;
}

export function ValueThresholds({
  thresholds,
  strokeWidth = 1.5,
  strokeOpacity = 0.9,
  yAxisId,
}: ValueThresholdsProps) {
  const { innerWidth, innerHeight, orientation } = useChart();
  const yScale = useYScale(yAxisId);
  const horizontal = orientation === "horizontal";

  return (
    <g className="chart-value-thresholds">
      {thresholds.map((t) => {
        const at = yScale(t.value);
        // Off-scale would draw the line on the axis and read as a threshold of
        // zero. Better to draw nothing than to draw it in the wrong place.
        if (!Number.isFinite(at)) return null;
        return horizontal ? (
          <g key={t.key}>
            <line
              stroke={t.color}
              strokeDasharray={t.dash}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
              x1={at}
              x2={at}
              y1={0}
              y2={innerHeight}
            />
            <text
              fill={t.ink}
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
              x={at}
              y={-8}
            >
              {t.label}
            </text>
          </g>
        ) : (
          <g key={t.key}>
            <line
              stroke={t.color}
              strokeDasharray={t.dash}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
              x1={0}
              x2={innerWidth}
              y1={at}
              y2={at}
            />
            <text
              fill={t.ink}
              fontSize={11}
              fontWeight={600}
              textAnchor="end"
              x={innerWidth}
              y={at - 4}
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

ValueThresholds.displayName = "ValueThresholds";

export default ValueThresholds;
