"use client";

import { useSyncExternalStore } from "react";

/*
  SSR-safe media-query hook built on useSyncExternalStore (the React-blessed way —
  no setState-in-effect, no hydration flip). Server snapshot is `false`; the client
  reads the real match after mount. Used for responsive toast placement and
  prefers-reduced-motion gating.
*/
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
