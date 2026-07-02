"use client";

import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/*
  One-shot "grow-in" flag for progress fills. Returns false on the first client
  paint, then true on the next frame, so a fill can render from 0 → its real
  width and let the element's CSS width-transition animate it in once on mount.

  The RESTING value is the full one: under reduced motion (or on any render where
  the flag is already true) it returns true immediately, so the bar is fully
  drawn and content is never gated behind an animation that might not run.
*/
export function useGrowIn(): boolean {
  const reduced = usePrefersReducedMotion();
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (reduced) return; // no animation → stay at the full resting value
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  return reduced || grown;
}
