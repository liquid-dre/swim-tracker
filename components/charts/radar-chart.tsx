"use client";

import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import type { Transition } from "motion/react";
import { type ReactNode, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import {
  defaultRadarColors,
  type RadarContextValue,
  type RadarData,
  type RadarMetric,
  RadarProvider,
} from "./radar-context";

export interface RadarChartProps {
  /** Data array - each item represents a data series (polygon) */
  data: RadarData[];
  /** Metrics to display on the radar */
  metrics: RadarMetric[];
  /** Chart size in pixels. If not provided, uses parent container size */
  size?: number;
  /** Number of concentric grid circles. Default: 5 */
  levels?: number;
  /**
   * LOCAL EDIT: top of the value scale. Default 100 (upstream's hard-coded
   * percentage domain), so every existing caller is unchanged. The stroke
   * profile passes 1000 to plot World Aquatics points on their own scale rather
   * than pre-dividing them, which would make the ring labels disagree with the
   * numbers in the tooltip and the table.
   */
  valueMax?: number;
  /** Margin around the chart. Default: 60 */
  margin?: number;
  /** Enable animations. Default: true */
  animate?: boolean;
  /** Enter animation budget in ms. Default: 1100 */
  enterDurationMs?: number;
  /** Scales stagger timing (1 = default). */
  staggerScale?: number;
  /** Motion enter transition (spring or cubic-bezier tween). */
  enterTransition?: Transition;
  /** Changes when motion settings change — replays enter animations. */
  motionReplayKey?: string;
  /** Controlled hover state - index of hovered area */
  hoveredIndex?: number | null;
  /** Callback when hover state changes */
  onHoverChange?: (index: number | null) => void;
  /** Additional class name for the container */
  className?: string;
  /** Child components (RadarGrid, RadarAxis, RadarLabels, RadarArea) */
  children: ReactNode;
}

interface RadarChartInnerProps {
  width: number;
  height: number;
  data: RadarData[];
  metrics: RadarMetric[];
  levels: number;
  /** LOCAL EDIT: top of the value scale — see RadarChartProps.valueMax. */
  valueMax: number;
  margin: number;
  animate: boolean;
  enterDurationMs: number;
  staggerScale: number;
  enterTransition?: Transition;
  motionReplayKey: string;
  children: ReactNode;
  hoveredIndexProp?: number | null;
  onHoverChange?: (index: number | null) => void;
}

function RadarChartInner({
  width,
  height,
  data,
  metrics,
  levels,
  valueMax,
  margin,
  animate,
  enterDurationMs,
  staggerScale,
  enterTransition,
  motionReplayKey,
  children,
  hoveredIndexProp,
  onHoverChange,
}: RadarChartInnerProps) {
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<
    number | null
  >(null);

  // Use controlled or uncontrolled hover state
  const isControlled = hoveredIndexProp !== undefined;
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHoveredIndex;
  const setHoveredIndex = useCallback(
    (index: number | null) => {
      if (isControlled) {
        onHoverChange?.(index);
      } else {
        setInternalHoveredIndex(index);
      }
    },
    [isControlled, onHoverChange]
  );

  // Use the smaller dimension
  const size = Math.min(width, height);
  const radius = (size - margin * 2) / 2;

  // Scale for converting values to radius.
  // LOCAL EDIT: the domain top is `valueMax` (default 100) rather than a
  // hard-coded 100, so a radar can plot a scale that is not a percentage.
  const yScale = useCallback(
    (value: number) => {
      const scale = scaleLinear<number>({
        range: [0, radius],
        domain: [0, valueMax],
      });
      return scale(value) ?? 0;
    },
    [radius, valueMax]
  );

  // Get angle for a metric index (rotated so first metric is at top)
  const getAngle = useCallback(
    (metricIndex: number) => {
      const step = (Math.PI * 2) / metrics.length;
      const angleOffset = -Math.PI / 2; // Rotate so first axis is at top
      return metricIndex * step + angleOffset;
    },
    [metrics.length]
  );

  // Get x,y position for a metric at a given value
  const getPointPosition = useCallback(
    (metricIndex: number, value: number) => {
      const angle = getAngle(metricIndex);
      const r = yScale(value);
      return {
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
      };
    },
    [getAngle, yScale]
  );

  // Get color for a data index
  const getColor = useCallback(
    (index: number) => {
      const item = data[index];
      if (item?.color) {
        return item.color;
      }
      return defaultRadarColors[index % defaultRadarColors.length] as string;
    },
    [data]
  );

  // Early return if dimensions not ready
  if (size < 10) {
    return null;
  }

  const contextValue: RadarContextValue = {
    data,
    metrics,
    size,
    radius,
    levels,
    valueMax,
    hoveredIndex,
    setHoveredIndex,
    animate,
    enterDurationMs,
    staggerScale,
    enterTransition,
    motionReplayKey,
    getColor,
    getAngle,
    getPointPosition,
    yScale,
  };

  return (
    <RadarProvider value={contextValue}>
      <svg
        aria-hidden="true"
        height={size}
        style={{ overflow: "visible" }}
        width={size}
      >
        <Group left={size / 2} top={size / 2}>
          {children}
        </Group>
      </svg>
    </RadarProvider>
  );
}

export function RadarChart({
  data,
  metrics,
  size: fixedSize,
  levels = 5,
  valueMax = 100,
  margin = 60,
  animate = true,
  enterDurationMs = 1100,
  staggerScale = 1,
  enterTransition,
  motionReplayKey = "",
  className = "",
  hoveredIndex,
  onHoverChange,
  children,
}: RadarChartProps) {
  // If fixed size is provided, use it directly
  if (fixedSize) {
    return (
      <div
        className={cn("relative flex items-center justify-center", className)}
        style={{ width: fixedSize, height: fixedSize }}
      >
        <RadarChartInner
          animate={animate}
          data={data}
          enterDurationMs={enterDurationMs}
          enterTransition={enterTransition}
          height={fixedSize}
          hoveredIndexProp={hoveredIndex}
          levels={levels}
          margin={margin}
          metrics={metrics}
          motionReplayKey={motionReplayKey}
          onHoverChange={onHoverChange}
          staggerScale={staggerScale}
          valueMax={valueMax}
          width={fixedSize}
        >
          {children}
        </RadarChartInner>
      </div>
    );
  }

  // Otherwise use ParentSize for responsive sizing
  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <RadarChartInner
            animate={animate}
            data={data}
            enterDurationMs={enterDurationMs}
            enterTransition={enterTransition}
            height={height}
            hoveredIndexProp={hoveredIndex}
            levels={levels}
            margin={margin}
            metrics={metrics}
            motionReplayKey={motionReplayKey}
            onHoverChange={onHoverChange}
            staggerScale={staggerScale}
            valueMax={valueMax}
            width={width}
          >
            {children}
          </RadarChartInner>
        )}
      </ParentSize>
    </div>
  );
}

export default RadarChart;
