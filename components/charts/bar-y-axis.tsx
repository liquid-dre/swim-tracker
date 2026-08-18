"use client";

import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChart, useChartStable } from "./chart-context";

export interface BarYAxisProps {
  /** Whether to show all labels or skip some for dense data. Default: true */
  showAllLabels?: boolean;
  /** Maximum number of labels to show. Default: 20 */
  maxLabels?: number;
  /**
   * LOCAL EDIT (ours). Label width in px before truncating. Upstream hardcodes
   * 70, so a chart reserving a wider gutter still lost long names to an ellipsis
   * — and on a swimmer comparison the name is what makes the row mean anything.
   * Default: 70, i.e. exactly the upstream behaviour.
   */
  maxLabelWidth?: number;
  /**
   * LOCAL EDIT (ours). Maps a band's KEY to the text drawn for it. Upstream uses
   * the key as the label, which forces the two to be the same string — and that
   * is a correctness bug, not just an inconvenience: `bar-chart.tsx` feeds the
   * key domain straight to `scaleBand`, which interns it, so two swimmers called
   * "Jane Smith" collapse into one band and draw on top of each other while the
   * table beside the chart lists two rows.
   *
   * With this, charts key bands on the swimmer's id (unique by construction) and
   * still render the name. Omit it and the behaviour is exactly upstream's.
   */
  labelFor?: (category: string) => string;
}

interface BarYAxisLabelProps {
  label: string;
  y: number;
  bandHeight: number;
  isHovered: boolean;
  maxLabelWidth: number;
}

function BarYAxisLabel({
  label,
  y,
  bandHeight,
  isHovered,
  maxLabelWidth,
}: BarYAxisLabelProps) {
  return (
    <div
      className="absolute right-0 flex items-center justify-end pr-2"
      style={{
        top: y,
        height: bandHeight,
      }}
    >
      <motion.span
        animate={{
          opacity: isHovered ? 1 : 0.7,
          color: isHovered
            ? "var(--foreground)"
            : "var(--chart-label, var(--color-zinc-500))",
        }}
        className={cn("truncate whitespace-nowrap text-right text-xs")}
        initial={{
          opacity: 0.7,
          color: "var(--chart-label, var(--color-zinc-500))",
        }}
        style={{ maxWidth: maxLabelWidth }}
        transition={{ duration: 0.15 }}
      >
        {label}
      </motion.span>
    </div>
  );
}

export function BarYAxis(props: BarYAxisProps) {
  const { containerRef, barScale } = useChartStable();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  if (!barScale) {
    return null;
  }

  return <BarYAxisInner {...props} container={container} />;
}

const BarYAxisInner = memo(function BarYAxisInner({
  showAllLabels = true,
  maxLabels = 20,
  maxLabelWidth = 70,
  labelFor,
  container,
}: BarYAxisProps & { container: HTMLDivElement }) {
  const { margin, barScale, bandWidth, barXAccessor, data, hoveredBarIndex } =
    useChart();

  // Generate labels for each bar
  const labelsToShow = useMemo(() => {
    if (!(barScale && bandWidth && barXAccessor)) {
      return [];
    }

    const allLabels = data.map((d, i) => {
      const key = barXAccessor(d);
      // LOCAL EDIT: the band KEY and the drawn LABEL are separate concerns.
      const label = labelFor ? labelFor(key) : key;
      const bandY = barScale(key) ?? 0;
      // Center the label vertically within the band
      const y = bandY + margin.top;
      return { label, y, bandHeight: bandWidth, index: i };
    });

    // If showAllLabels is true or we have fewer than maxLabels, show all
    if (showAllLabels || allLabels.length <= maxLabels) {
      return allLabels;
    }

    // Otherwise, skip some labels to avoid crowding
    const step = Math.ceil(allLabels.length / maxLabels);
    return allLabels.filter((_, i) => i % step === 0);
  }, [
    barScale,
    bandWidth,
    barXAccessor,
    data,
    margin.top,
    showAllLabels,
    maxLabels,
    labelFor,
  ]);

  return createPortal(
    <div
      className="pointer-events-none absolute top-0 bottom-0"
      style={{
        left: 0,
        width: margin.left,
      }}
    >
      {labelsToShow.map((item) => (
        <BarYAxisLabel
          bandHeight={item.bandHeight}
          isHovered={hoveredBarIndex === item.index}
          key={`${item.label}-${item.y}`}
          label={item.label}
          maxLabelWidth={maxLabelWidth}
          y={item.y}
        />
      ))}
    </div>,
    container
  );
});

BarYAxis.displayName = "BarYAxis";

export default BarYAxis;
