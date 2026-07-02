"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/*
  Shared analysis toolbar (Step R2). Every chart page leads with its chart; the
  filters collapse into this one slim row so nothing tall pushes the chart below
  the fold. Primary selectors (event / course / target tier / mode) sit inline on
  the left; secondary filters (age, gender, squad, season window) live behind a
  compact "Filters" popover on the right that carries a count badge when any are
  active. The row wraps on narrow screens; the chart always leads underneath.
*/

// The shared trigger-button style so bespoke toolbar popovers (e.g. the
// Progression group builder) match the built-in Filters button exactly.
export const toolbarButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-semibold text-white tabular-nums">
      {count}
    </span>
  );
}

export function FilterBar({
  primary,
  trailing,
  filters,
  filterCount = 0,
  onClear,
  filtersLabel = "Filters",
  className,
}: {
  /** Inline primary selectors (left). */
  primary?: React.ReactNode;
  /** Inline right-aligned controls shown before the Filters button. */
  trailing?: React.ReactNode;
  /** Secondary-filter controls rendered inside the popover. */
  filters?: React.ReactNode;
  /** Count of active secondary filters — drives the badge. */
  filterCount?: number;
  /** Clears the secondary filters; shown in the popover when any are active. */
  onClear?: () => void;
  filtersLabel?: string;
  className?: string;
}) {
  const hasRight = Boolean(trailing) || Boolean(filters);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {primary}
      {hasRight && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {trailing}
          {filters && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={toolbarButtonClass}
                  aria-label={
                    filterCount > 0
                      ? `${filtersLabel}, ${filterCount} active`
                      : filtersLabel
                  }
                >
                  <SlidersHorizontal
                    className="size-4 text-ink-faint"
                    strokeWidth={1.75}
                  />
                  {filtersLabel}
                  <CountBadge count={filterCount} />
                </button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">
                      {filtersLabel}
                    </span>
                    {onClear && filterCount > 0 && (
                      <button
                        type="button"
                        onClick={onClear}
                        className="rounded-sm text-xs font-medium text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  {filters}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}

// A labelled block for stacking controls inside a Filters popover.
export function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </div>
  );
}
