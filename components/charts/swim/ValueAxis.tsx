"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useChart, useChartStable, useYScale } from "../chart-context";
import { pickValueTicks, thinTicks } from "./geometry";

/*
  Value-axis labels.

  bklit ships no axis for the VALUE scale on any chart: `XAxis` labels dates,
  `BarXAxis` / `BarYAxis` label categories, and a line chart's y axis simply has
  no labels — values are shown on hover instead. That is a fair choice for an
  analytics dashboard and the wrong one here. A coach reads a time off the axis
  ("she is sitting just above the 1:02 line"), and the attendance chart is
  meaningless without knowing whether the bars run to 60% or 100%.

  So this is ours, written to bklit's own idiom: read the scales from context and
  portal absolutely-positioned labels over the SVG, exactly as `XAxis` does. It
  serves every chart in the app from one place — `formatTime` for swim times,
  a percent formatter for attendance.

  `yScale` is ALWAYS the value scale, in every orientation: a horizontal bar
  chart gives it the range [0, innerWidth] and puts categories on `barScale`
  (see bar-chart.tsx). So `orientation` decides only which edge the labels sit
  against, never which scale they come from.

  displayName is "YAxis" on purpose: that name is in the vendored
  CLIP_EXCLUDED_COMPONENT_NAMES set, which keeps axes visible while the series
  clip-reveals. Renaming it would make the labels flicker in on every load.
*/

export interface ValueAxisProps {
  /** Renders a domain value as its label. e.g. `formatTime`, or `(v) => \`${v}%\``. */
  format: (value: number) => string;
  /** Target tick count. The scale nices this, so the real count may differ. Default: 5 */
  numTicks?: number;
  /** Gutter width in px for a vertical axis — must match the chart's left margin. Default: 56 */
  width?: number;
  /** Y-scale group id, for charts with two value axes. */
  yAxisId?: string | number;
  /** Accessible description of what the axis measures, e.g. "Time". */
  label?: string;
}

/** A labelled tick, placed. `pos` is px along the axis the labels sit against. */
type PositionedTick = { value: number; label: string; pos: number };

export function ValueAxis(props: ValueAxisProps) {
  const { containerRef } = useChartStable();
  // The portal target is read in an effect and held in state, not read from the
  // ref during render — bklit's own axes do the latter, which React 19 flags.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setContainer(containerRef.current);
  }, [containerRef]);

  if (container === null) {
    return null;
  }

  return <ValueAxisInner {...props} container={container} />;
}

const ValueAxisInner = memo(function ValueAxisInner({
  format,
  numTicks = 5,
  width = 56,
  yAxisId,
  label,
  container,
}: ValueAxisProps & { container: HTMLDivElement }) {
  const { margin, orientation, innerHeight } = useChart();
  const yScale = useYScale(yAxisId);
  const horizontal = orientation === "horizontal";

  const ticks = useMemo<PositionedTick[]>(
    () =>
      thinTicks(
        pickValueTicks(yScale.ticks(numTicks), format).map((tick) => ({
          ...tick,
          pos: yScale(tick.value) + (horizontal ? margin.left : margin.top),
        })),
      ),
    [yScale, numTicks, format, horizontal, margin.left, margin.top],
  );

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-value-axis={label ?? "value"}
    >
      {ticks.map((tick) =>
        horizontal ? (
          <div
            className="absolute flex justify-center"
            key={tick.value}
            style={{
              left: tick.pos,
              top: margin.top + innerHeight + 8,
              width: 0,
            }}
          >
            <span className="whitespace-nowrap text-chart-label text-xs tabular-nums">
              {tick.label}
            </span>
          </div>
        ) : (
          <div
            className="absolute flex items-center justify-end pr-2"
            key={tick.value}
            // The label is centred on its gridline, so it is offset by half its
            // own line-height rather than sitting below the line.
            style={{ top: tick.pos - 8, left: 0, width, height: 16 }}
          >
            <span className="whitespace-nowrap text-chart-label text-xs tabular-nums">
              {tick.label}
            </span>
          </div>
        ),
      )}
    </div>,
    container,
  );
});

// See the note above: this name is what keeps the axis out of the clip reveal.
ValueAxis.displayName = "YAxis";

export default ValueAxis;
