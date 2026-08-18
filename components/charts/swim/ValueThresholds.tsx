"use client";

import { useChart, useYScale } from "../chart-context";
import { assignLabelRows, LABEL_MIN_GAP } from "./thresholdLabelRows";

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
  /** Rendered beside the line, e.g. "SANJ". Never omit — colour alone is not a label. */
  label: string;
  /**
   * The gala's SHAPE channel, e.g. "◆". Drawn alone when the lines are too
   * close together for full labels — three cuts for one event at one age sit
   * within a few dozen pixels, and a glyph is ~14px against a label's ~64px.
   * The legend decodes it, so a glyph is still a non-colour label.
   */
  glyph?: string;
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

  /*
    Labels are staggered onto two rows on a horizontal chart. Gala cuts for one
    event at one age sit close together by nature — a 14-year-old's L2/L3/SANJ
    100 Free cuts land within a few seconds of each other, which at plot scale
    is a few dozen pixels, against labels ~60px wide. On one row they overlap in
    exactly the case the overlay exists for. Alternating rows buys each label
    roughly double the horizontal room before it can collide.

    Sorted by position first, so "alternating" follows what the eye sees rather
    than the order the caller happened to pass.
  */
  const ordered = [...thresholds]
    .map((t) => ({ t, at: yScale(t.value) }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => a.at - b.at);

  const rowOf = horizontal
    ? assignLabelRows(ordered.map((o) => o.at))
    : ordered.map(() => 0);

  /*
    When even two staggered rows cannot separate the full labels, every label
    drops to its glyph — all of them, not just the crowded ones, because a mix
    of "◆" and "● L3" reads as two different kinds of thing. The legend maps
    glyph to gala, so this stays a labelled line, never a colour-only one.
  */
  const tightest = ordered.reduce(
    (min, cur, i) => (i === 0 ? min : Math.min(min, cur.at - ordered[i - 1].at)),
    Number.POSITIVE_INFINITY,
  );
  const glyphOnly =
    horizontal &&
    ordered.length > 2 &&
    tightest < LABEL_MIN_GAP &&
    ordered.every(({ t }) => t.glyph);

  return (
    <g className="chart-value-thresholds">
      {ordered.map(({ t, at }, i) => {
        const labelY = rowOf[i] === 1 ? -21 : -8;
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
              y={labelY}
            >
              {glyphOnly ? t.glyph : t.label}
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
