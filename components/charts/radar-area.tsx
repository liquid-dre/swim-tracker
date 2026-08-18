"use client";

import type { MotionValue } from "motion/react";
import { motion, useTransform } from "motion/react";
import { memo, useMemo } from "react";
import { radarCssVars, useRadarHover, useRadarStable } from "./radar-context";
// LOCAL EDIT: null-aware path building lives in our own tree so it is linted
// and tested; see components/charts/swim/radarPaths.ts for why it exists.
import {
  positionsToFillPath,
  positionsToStrokePath,
  type RadarPos as Pos,
} from "./swim/radarPaths";
import { useEnterComplete } from "./use-enter-complete";
import { useMountProgress } from "./use-mount-progress";

export interface RadarAreaProps {
  /** Index of this area in the data array */
  index: number;
  /** Optional color override */
  color?: string;
  /** Show data point circles. Default: true */
  showPoints?: boolean;
  /** Show stroke outline on the polygon. Default: true */
  showStroke?: boolean;
  /** Show glow effect on hover. Default: true */
  showGlow?: boolean;
  /** Additional class name */
  className?: string;
}

/** How far out the no-data tick sits, on the same 0-100 scale as the values. */
const NO_DATA_TICK_VALUE = 7;

function getStrokeWidth(isHovered: boolean): number {
  return isHovered ? 3 : 2;
}

const RadarPoint = memo(function RadarPoint({
  mountProgress,
  target,
  color,
  isHovered,
  metricKey,
  enterComplete,
}: {
  mountProgress: MotionValue<number>;
  target: { x: number; y: number };
  color: string;
  isHovered: boolean;
  metricKey: string;
  enterComplete: boolean;
}) {
  const cx = useTransform(mountProgress, (t) => target.x * t);
  const cy = useTransform(mountProgress, (t) => target.y * t);

  if (enterComplete) {
    return (
      <circle
        cx={target.x}
        cy={target.y}
        fill={color}
        key={metricKey}
        r={isHovered ? 6 : 4}
        stroke={radarCssVars.background}
        strokeWidth={2}
      />
    );
  }

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      fill={color}
      key={metricKey}
      r={isHovered ? 6 : 4}
      stroke={radarCssVars.background}
      strokeWidth={2}
      transition={{
        r: { type: "spring", stiffness: 300, damping: 20 },
      }}
    />
  );
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: radar area enter/hover branches mirror pie slice
export const RadarArea = memo(function RadarArea({
  index,
  color: colorProp,
  showPoints = true,
  showStroke = true,
  showGlow = true,
  className = "",
}: RadarAreaProps) {
  const {
    data,
    metrics,
    levels,
    animate,
    enterDurationMs,
    staggerScale,
    enterTransition,
    motionReplayKey,
    getColor,
    getPointPosition,
  } = useRadarStable();
  const { hoveredIndex, setHoveredIndex } = useRadarHover();

  const durationFactor = enterDurationMs / 1100;
  const areaData = data[index];

  const targetPositions = useMemo<Array<Pos | null>>(() => {
    if (!areaData) {
      return metrics.map(() => null);
    }
    return metrics.map((metric, i) => {
      const value = areaData.values[metric.key];
      // LOCAL EDIT: null/undefined is NO DATA, not zero. Upstream's `?? 0` put
      // the point on the axis, which reads as the worst possible score.
      if (value === null || value === undefined) {
        return null;
      }
      return getPointPosition(i, value);
    });
  }, [metrics, areaData, getPointPosition]);

  const staticFillPath = useMemo(
    () => positionsToFillPath(targetPositions),
    [targetPositions]
  );
  const staticStrokePath = useMemo(
    () => positionsToStrokePath(targetPositions),
    [targetPositions]
  );

  const gridStagger = 0.08 * staggerScale * durationFactor;
  const campaignBaseDelay = (levels * gridStagger + 0.2) * durationFactor;
  const campaignStagger = 0.15 * staggerScale * durationFactor;
  const animationDelay = campaignBaseDelay + index * campaignStagger;

  const mountProgress = useMountProgress(
    enterTransition,
    animationDelay,
    `${motionReplayKey}-${index}`
  );
  const enterComplete = useEnterComplete(mountProgress);

  const animatedPositions = useTransform(mountProgress, (t) =>
    targetPositions.map((p) => (p === null ? null : { x: p.x * t, y: p.y * t }))
  );

  const fillPathD = useTransform(animatedPositions, positionsToFillPath);
  const strokePathD = useTransform(animatedPositions, positionsToStrokePath);

  if (!areaData) {
    return null;
  }

  const color = colorProp || getColor(index);
  const isHovered = hoveredIndex === index;
  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

  return (
    <motion.g
      animate={{
        opacity: isOtherHovered ? 0.3 : 1,
        scale: isHovered ? 1.05 : 1,
      }}
      className={className}
      initial={{ opacity: animate ? 0 : 1 }}
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      style={{ transformOrigin: "0px 0px", cursor: "pointer" }}
      transition={{
        opacity: { duration: 0.15 },
        scale: { type: "spring", stiffness: 400, damping: 25 },
      }}
    >
      {/* LOCAL EDIT: fill and stroke are two paths, not one. The fill closes
          across a gap so the series still reads as an area; the stroke does
          not, so the outline visibly stops at a metric with no data. */}
      {enterComplete ? (
        <>
          <path
            d={staticFillPath}
            fill={color}
            fillOpacity={isHovered ? 0.35 : 0.15}
            stroke="none"
          />
          {showStroke && (
            <path
              d={staticStrokePath}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={getStrokeWidth(isHovered)}
              style={{
                filter: showGlow && isHovered ? `drop-shadow(0 0 12px ${color})` : "none",
              }}
            />
          )}
        </>
      ) : (
        <>
          <motion.path
            animate={{ fillOpacity: isHovered ? 0.35 : 0.15 }}
            d={fillPathD}
            fill={color}
            stroke="none"
            transition={{ fillOpacity: { duration: 0.2 } }}
          />
          {showStroke && (
            <motion.path
              animate={{ strokeWidth: getStrokeWidth(isHovered) }}
              d={strokePathD}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: showGlow && isHovered ? `drop-shadow(0 0 12px ${color})` : "none",
              }}
              transition={{ strokeWidth: { duration: 0.2 } }}
            />
          )}
        </>
      )}

      {/* LOCAL EDIT: a hollow tick just off the hub on every metric with NO
          data, so a gap is something the reader can see and point at rather
          than an absence they have to notice. */}
      {enterComplete &&
        metrics.map((metric, i) =>
          targetPositions[i] === null ? (
            <circle
              cx={getPointPosition(i, NO_DATA_TICK_VALUE).x}
              cy={getPointPosition(i, NO_DATA_TICK_VALUE).y}
              fill="none"
              key={`${metric.key}-nodata`}
              r={3}
              stroke={color}
              strokeDasharray="2 2"
              strokeWidth={1.5}
            />
          ) : null
        )}

      {showPoints &&
        metrics.map((metric, i) => {
          const target = targetPositions[i];
          if (!target) {
            return null;
          }
          return (
            <RadarPoint
              color={color}
              enterComplete={enterComplete}
              isHovered={isHovered}
              key={metric.key}
              metricKey={metric.key}
              mountProgress={mountProgress}
              target={target}
            />
          );
        })}
    </motion.g>
  );
});

RadarArea.displayName = "RadarArea";

export default RadarArea;
