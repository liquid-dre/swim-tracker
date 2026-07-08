"use client";

import { useRef } from "react";

/*
  Which keys appeared AFTER the first loaded render — for a one-shot
  "this just changed under you" flash on live-updating lists (Convex pushes
  new data while the screen is open). The initial load never flashes; a key,
  once flagged, stays flagged so the CSS animation (which runs once when the
  class first applies) is never re-triggered by unrelated re-renders.
*/
export function useNewKeys(keys: string[], ready: boolean): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef<Set<string>>(new Set());

  if (!ready) return fresh.current; // still loading — nothing to compare yet

  if (seen.current === null) {
    // First real data: baseline only, no flash.
    seen.current = new Set(keys);
    return fresh.current;
  }

  for (const key of keys) {
    if (!seen.current.has(key)) {
      seen.current.add(key);
      fresh.current.add(key);
    }
  }
  return fresh.current;
}
