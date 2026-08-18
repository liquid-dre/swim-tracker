"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/*
  Accessible underline tabs — the shared pattern for switching between panels
  of one entity (e.g. a swimmer's Personal bests vs History vs Access). Full
  WAI-ARIA tablist: roving tabindex, arrow / Home / End navigation with
  selection following focus (panels are cheap, so automatic activation is the
  right call). One brand-indigo underline marks the active tab; an optional
  count pill surfaces attention (e.g. pending requests) even while another tab
  is open. Inactive panels stay unmounted so their queries don't subscribe
  until opened.

  The rail scrolls sideways rather than wrapping or truncating: a swimmer has
  six sections and a phone fits about three. Its own scrollbar is hidden — a
  6px bar directly under the labels reads as a second, broken underline — so
  the overflow is signalled by a fade at whichever edge still has tabs behind
  it, and the active tab is always scrolled into view (which matters even on a
  wide screen, since the selection can arrive from the URL rather than a click).
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
  const railRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const tabId = (v: string) => `${baseId}-tab-${v}`;
  const panelId = (v: string) => `${baseId}-panel-${v}`;

  const { atStart, atEnd, onScroll } = useRailEdges(railRef, items.length);

  const activeIndex = items.findIndex((i) => i.value === value);

  // Keep the selected tab visible. Runs on mount too, because the initial
  // selection can come from the URL — landing on `?tab=access` must not leave
  // the active tab parked off-screen with no sign of it. Keyed on the INDEX,
  // not on `items`: a fresh array each render would re-scroll on every render
  // and yank the rail back while the reader is scrolling it by hand.
  useEffect(() => {
    tabRefs.current[activeIndex]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeIndex, reducedMotion]);

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
      {/* The fades are painted over the rail, so they need a positioned parent
          that does NOT scroll with it. */}
      <div className="relative">
        <div
          ref={railRef}
          role="tablist"
          aria-label={ariaLabel}
          onScroll={onScroll}
          // px-0.5 so a focus ring on the first or last tab isn't clipped by
          // the scroll container; the matching -mx-0.5 keeps the rail flush.
          className="no-scrollbar -mx-0.5 flex items-center gap-6 overflow-x-auto border-b border-border px-0.5"
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
                  "relative -mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-0.5 pb-3 pt-1 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring",
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

        {/* Only ever shown on the side that still has tabs behind it, so the
            fade means "there is more this way" rather than decorating an edge.
            Stops above the baseline so it never dims the hairline. */}
        <EdgeFade side="left" show={!atStart} />
        <EdgeFade side="right" show={!atEnd} />
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

function EdgeFade({ side, show }: { side: "left" | "right"; show: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-px top-0 w-8 transition-opacity [transition-duration:var(--dur-1)]",
        side === "left"
          ? "left-0 bg-gradient-to-r from-bg to-transparent"
          : "right-0 bg-gradient-to-l from-bg to-transparent",
        show ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * Which ends of the rail are reached, so a fade is only drawn where tabs are
 * actually hidden. Both read true when nothing overflows, which correctly
 * hides both fades.
 */
function useRailEdges(
  railRef: React.RefObject<HTMLDivElement | null>,
  itemCount: number,
) {
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const measure = () => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      atStart: el.scrollLeft <= 1,
      // 1px of slack: sub-pixel layout means scrollLeft rarely lands exactly
      // on the maximum, which would otherwise leave the fade up forever.
      atEnd: el.scrollLeft >= max - 1,
    });
  };

  // Re-measure when the rail resizes (viewport, sidebar collapse) or when the
  // tab set itself changes — a coach and a parent get different counts.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railRef, itemCount]);

  return { ...edges, onScroll: measure };
}
