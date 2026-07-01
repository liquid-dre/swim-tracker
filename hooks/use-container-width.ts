"use client";

import { useEffect, useRef, useState } from "react";

/*
  Measure an element's content-box width so fixed-size SVGs (e.g. the stroke
  wheel) can clamp to the space they actually have — the fixed 300/380px wheel
  otherwise overflows the gutter at ~375px. Initialises to `fallback` so the
  desktop size renders immediately with no flash, then a ResizeObserver clamps it
  down on narrow viewports. The observer callback runs on layout, not in render,
  so this is not a set-state-in-effect anti-pattern.
*/
export function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}
