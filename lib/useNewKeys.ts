"use client";

import { useState } from "react";

/*
  Which keys appeared AFTER the first loaded render — for a one-shot
  "this just changed under you" flash on live-updating lists (Convex pushes
  new data while the screen is open). The initial load never flashes; a key,
  once flagged, stays flagged so the CSS animation (which runs once when the
  class first applies) is never re-triggered by unrelated re-renders.

  Implemented with guarded setState DURING render (React's sanctioned
  "derive state from props" pattern) — refs may not be read mid-render.
*/

const EMPTY: ReadonlySet<string> = new Set();

export function useNewKeys(
  keys: string[],
  ready: boolean,
): ReadonlySet<string> {
  const [state, setState] = useState<{
    seen: Set<string>;
    fresh: Set<string>;
  } | null>(null);

  if (ready) {
    if (state === null) {
      // First real data: baseline only, no flash.
      setState({ seen: new Set(keys), fresh: new Set() });
    } else {
      const added = keys.filter((k) => !state.seen.has(k));
      if (added.length > 0) {
        const seen = new Set(state.seen);
        const fresh = new Set(state.fresh);
        for (const k of added) {
          seen.add(k);
          fresh.add(k);
        }
        setState({ seen, fresh });
      }
    }
  }

  return state?.fresh ?? EMPTY;
}
