"use client";

import { bisector } from "d3-array";
import { scaleLinear, scaleTime } from "d3-scale";
import type { Transition } from "motion/react";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEFAULT_ANIMATION_EASING } from "./animation";
import {
  isClipExcludedComponent,
  isPostOverlayComponent,
  isUnderlayComponent,
} from "./chart-child-passthrough";
import {
  type ChartContextValue,
  ChartProvider,
  type LineConfig,
  type Margin,
} from "./chart-context";
import { isGradientDefComponent, isPatternDefComponent } from "./chart-defs";
import { shortDateFmt } from "./chart-formatters";
import { type ChartPhase, DEFAULT_CHART_LIFECYCLE } from "./chart-phase";
import { extractReferenceAreaConfigs } from "./reference-area-config";
import { useScatterChartInteraction } from "./use-scatter-chart-interaction";
import { buildYScalesForLines, getPrimaryYScale } from "./y-axis-scales";

export interface ScatterChartInnerProps {
  width: number;
  height: number;
  data: Record<string, unknown>[];
  xDataKey: string;
  margin: Margin;
  animationDuration: number;
  animationEasing?: string;
  enterTransition?: Transition;
  revealSignature?: string;
  children: ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  lines: LineConfig[];
  /**
   * LOCAL EDIT (ours). Explicit `[min, max]` y-domain. Without it this shell
   * pins all-positive data to a ZERO baseline, exactly as the time-series shell
   * did before its own edit. On a swim chart that is ruinous: every time in a
   * season sits in the top few percent of a 0-to-slowest axis, so a year of
   * hard-won improvement flattens into a band a few pixels tall.
   */
  yDomain?: [number, number];
  /**
   * LOCAL EDIT (ours). Formats the x tick labels. Upstream hard-codes a
   * month/day format that drops the year — unreadable across seasons.
   */
  xLabelFormat?: (date: Date) => string;
  onPhaseChange?: (phase: ChartPhase) => void;
}

export function ScatterChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing = DEFAULT_ANIMATION_EASING,
  enterTransition,
  revealSignature = "",
  children,
  containerRef,
  lines,
  yDomain,
  xLabelFormat,
  onPhaseChange,
}: ScatterChartInnerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [revealEpoch, setRevealEpoch] = useState(0);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xAccessor = useCallback(
    (d: Record<string, unknown>): Date => {
      const value = d[xDataKey];
      return value instanceof Date ? value : new Date(value as string | number);
    },
    [xDataKey]
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, unknown>, Date>((d) => xAccessor(d)).left,
    [xAccessor]
  );

  const xRangePadding = useMemo(() => {
    if (lines.length === 0) {
      return 12;
    }
    const maxRadius = Math.max(...lines.map((line) => line.strokeWidth ?? 5));
    return maxRadius + 10;
  }, [lines]);

  const xScale = useMemo(() => {
    const dates = data.map((d) => xAccessor(d));
    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()));

    return scaleTime<number>()
      .range([
        xRangePadding,
        Math.max(xRangePadding, innerWidth - xRangePadding),
      ])
      .domain([minTime, maxTime]);
  }, [innerWidth, data, xAccessor, xRangePadding]);

  const columnWidth = useMemo(() => {
    if (data.length < 2) {
      return 0;
    }
    return innerWidth / (data.length - 1);
  }, [innerWidth, data.length]);

  const yScales = useMemo(
    () =>
      buildYScalesForLines({
        lines,
        data,
        innerHeight,
        resolveDomain: (dataKeys) => {
          // LOCAL EDIT: an explicit domain wins outright. See the prop's note.
          if (yDomain) {
            return yDomain;
          }
          let maxValue = 0;
          for (const d of data) {
            for (const key of dataKeys) {
              const value = d[key];
              if (typeof value === "number" && value > maxValue) {
                maxValue = value;
              }
            }
          }
          const top = maxValue <= 0 ? 100 : maxValue * 1.1;
          return [0, top];
        },
      }),
    [innerHeight, data, lines, yDomain]
  );

  const yScale = getPrimaryYScale(
    yScales,
    scaleLinear<number>()
      .range([innerHeight, 0])
      // LOCAL EDIT: the fallback scale honours an explicit domain too, or a
      // chart with no <Scatter> children yet would flash a 0-100 axis.
      .domain(yDomain ?? [0, 100])
  );

  const dateLabels = useMemo(
    // LOCAL EDIT: `xLabelFormat` overrides the year-dropping default.
    () =>
      data.map((d) =>
        xLabelFormat
          ? xLabelFormat(xAccessor(d))
          : shortDateFmt.format(xAccessor(d))
      ),
    [data, xAccessor, xLabelFormat]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    setRevealEpoch((n) => n + 1);
    setIsLoaded(false);
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration);
    return () => clearTimeout(timer);
  }, [animationDuration, revealSignature]);

  useEffect(() => {
    onPhaseChange?.(isLoaded ? "ready" : "revealing");
  }, [isLoaded, onPhaseChange]);

  const canInteract = isLoaded;

  const {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  } = useScatterChartInteraction({
    xScale,
    yScale: yScale as ChartContextValue["yScale"],
    yScales: yScales as ChartContextValue["yScales"],
    data,
    lines,
    margin,
    xAccessor,
    bisectDate,
    canInteract,
  });

  const referenceAreas = useMemo(
    () => extractReferenceAreaConfigs(children),
    [children]
  );

  if (width < 10 || height < 10) {
    return null;
  }

  const defsChildren: ReactElement[] = [];
  const clipExcludedChildren: ReactElement[] = [];
  const underlayChildren: ReactElement[] = [];
  const preOverlayChildren: ReactElement[] = [];
  const postOverlayChildren: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    if (isGradientDefComponent(child)) {
      defsChildren.push(child);
    } else if (isPatternDefComponent(child)) {
      preOverlayChildren.push(child);
    } else if (isPostOverlayComponent(child)) {
      postOverlayChildren.push(child);
    } else if (isClipExcludedComponent(child)) {
      clipExcludedChildren.push(child);
    } else if (isUnderlayComponent(child)) {
      underlayChildren.push(child);
    } else {
      preOverlayChildren.push(child);
    }
  });

  const contextValue: ChartContextValue = {
    ...DEFAULT_CHART_LIFECYCLE,
    data,
    renderData: data,
    xScale: xScale as ChartContextValue["xScale"],
    yScale: yScale as ChartContextValue["yScale"],
    yScales: yScales as ChartContextValue["yScales"],
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    columnWidth,
    tooltipData,
    setTooltipData,
    containerRef,
    lines,
    referenceAreas,
    isLoaded,
    animationDuration,
    animationEasing,
    enterTransition,
    revealEpoch,
    xAccessor,
    dateLabels,
    selection,
    clearSelection,
  };

  return (
    <ChartProvider value={contextValue}>
      <svg
        aria-hidden="true"
        className="overflow-visible"
        height={height}
        width={width}
      >
        {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

        <rect fill="transparent" height={height} width={width} x={0} y={0} />

        <g
          {...interactionHandlers}
          style={interactionStyle}
          transform={`translate(${margin.left},${margin.top})`}
        >
          <rect
            fill="transparent"
            height={innerHeight}
            width={innerWidth}
            x={0}
            y={0}
          />

          {clipExcludedChildren}
          {underlayChildren}
          {preOverlayChildren}
          {postOverlayChildren}
        </g>
      </svg>
    </ChartProvider>
  );
}
