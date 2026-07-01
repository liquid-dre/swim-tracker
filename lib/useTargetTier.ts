"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Tier } from "@/lib/swim";

/*
  Shared target-tier state (BRD §5.10). One selector — LEVEL_2 / LEVEL_3 / SANJ —
  reframes every "how close to *this* meet" view: Road-to-qualify (§5.11), the
  %-of-cut profile, and the projection overlay (Step 14). Persisting the choice
  means a coach who sets a target tier on one screen keeps it when they navigate
  to another, so the toggle behaves as one shared control rather than a per-page
  reset. LCM-only analysis; the toggle is inert/hidden on short-course views.

  Backed by localStorage and exposed through `useSyncExternalStore`, the React
  primitive for external stores: the server snapshot is the default (so SSR and
  the first client render agree — no hydration mismatch), then the stored value
  is adopted. Writes broadcast a same-tab event so every mounted toggle re-reads
  in lockstep — the native `storage` event only fires in *other* tabs.
*/

const STORAGE_KEY = "swim-tracker:target-tier";
const SYNC_EVENT = "swim-tracker:target-tier-change";
const DEFAULT_TIER: Tier = "LEVEL_2";

function isTier(v: unknown): v is Tier {
  return v === "LEVEL_2" || v === "LEVEL_3" || v === "SANJ";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SYNC_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SYNC_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Returns a primitive, so useSyncExternalStore's Object.is check stays stable
// across renders without any caching.
function getSnapshot(): Tier {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTier(stored) ? stored : DEFAULT_TIER;
}

function getServerSnapshot(): Tier {
  return DEFAULT_TIER;
}

export function useTargetTier(): [Tier, (tier: Tier) => void] {
  const tier = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTier = useCallback((next: Tier) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  return [tier, setTier];
}
