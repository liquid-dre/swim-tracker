"use client";

import type { CSSProperties, ReactNode } from "react";

/*
  Shared tooltip typography.

  Four charts had this markup copy-pasted — ProgressionChart, ComparisonBarChart,
  AttendanceInsightsScreen and app/preview. Each rendered its own card: border,
  white background, shadow, then a title / value / meta stack.

  bklit's `ChartTooltip` already supplies the panel (`TooltipBox` — positioned,
  spring-animated, themed off --chart-tooltip-*), and its `content` render prop
  renders INSIDE that panel. So what is shared here is the stack only: wrapping
  it in another card would be card-in-card, which DESIGN.md bans.

  `SWIM_TOOLTIP_PANEL` corrects the panel itself to house style: bklit ships it
  with `backdrop-blur-md`, and glassmorphism is banned, so the blur is switched
  off and the panel takes our border and shadow token.
*/

/** Panel overrides for `<ChartTooltip panelStyle={SWIM_TOOLTIP_PANEL} />`. */
export const SWIM_TOOLTIP_PANEL: CSSProperties = {
  // bklit's panel class applies backdrop-blur-md; DESIGN.md bans glassmorphism.
  // The component only skips its own blur when this key is set explicitly.
  backdropFilter: "none",
  border: "1px solid var(--color-gray-200)",
  boxShadow: "var(--shadow-theme-md)",
};

/** The stack. Renders straight into bklit's panel — no card of its own. */
export function TooltipRows({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-sm">{children}</div>;
}

/** Series name, with its colour swatch. Omit for a single-series chart. */
export function TooltipTitle({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <p className="flex items-center gap-1.5 font-medium text-ink">
      {color ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      ) : null}
      {children}
    </p>
  );
}

/** The headline figure — always tabular, since these are times and percentages. */
export function TooltipValue({ children }: { children: ReactNode }) {
  return <p className="time tnum mt-0.5 text-ink">{children}</p>;
}

/** Muted supporting line: date, swim type, meet name. */
export function TooltipMeta({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
      {children}
    </p>
  );
}

/** Hairline divider between meta items. */
export function TooltipMetaDivider() {
  return <span aria-hidden className="h-3 w-px bg-border" />;
}
