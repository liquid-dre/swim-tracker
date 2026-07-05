"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
  Accessible underline tabs — the shared pattern for switching between panels
  of one entity (e.g. a swimmer's Times vs Access). Full WAI-ARIA tablist:
  roving tabindex, arrow / Home / End navigation with selection following
  focus (panels are cheap, so automatic activation is the right call). One
  brand-indigo underline marks the active tab; an optional count pill surfaces
  attention (e.g. pending requests) even while another tab is open. Inactive
  panels stay unmounted so their queries don't subscribe until opened.
*/
export interface TabItem {
  value: string;
  label: string;
  /** A count pill shown beside the label when > 0 (e.g. pending requests). */
  badge?: number | null;
  content: ReactNode;
}

export function Tabs({
  items,
  value,
  onValueChange,
  ariaLabel,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
}) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (v: string) => `${baseId}-tab-${v}`;
  const panelId = (v: string) => `${baseId}-panel-${v}`;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const count = items.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    onValueChange(items[next].value);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex items-center gap-6 border-b border-border"
      >
        {items.map((item, i) => {
          const active = item.value === value;
          const count = item.badge ?? 0;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(item.value)}
              aria-selected={active}
              aria-controls={panelId(item.value)}
              tabIndex={active ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative -mb-px inline-flex items-center gap-2 rounded-sm px-0.5 pb-3 pt-1 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {/* Active underline as its own element, overlapping the tablist's
                  hairline baseline — keeps the tab button free of a heavy
                  bottom border. */}
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-500"
                />
              )}
              {item.label}
              {count > 0 && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition-colors [transition-duration:var(--dur-1)]",
                    active
                      ? "bg-brand-500 text-white"
                      : "bg-brand-50 text-brand-500",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <div
            key={item.value}
            role="tabpanel"
            id={panelId(item.value)}
            aria-labelledby={tabId(item.value)}
            hidden={!active}
            tabIndex={0}
            className="outline-none"
          >
            {active && item.content}
          </div>
        );
      })}
    </div>
  );
}
