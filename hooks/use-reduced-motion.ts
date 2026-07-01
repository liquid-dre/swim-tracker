"use client";

import { useSyncExternalStore } from "react";

/*
  True when the user has asked for reduced motion. Charts read this to switch the
  one-time load animation off (DESIGN.md §6: motion is functional and must honour
  `prefers-reduced-motion`). Modelled as an external store so React stays in sync
  with the media query without a setState-in-effect.
*/

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// The server can't know the preference; assume motion is allowed so the first
// client render matches, then the store corrects it if needed.
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
