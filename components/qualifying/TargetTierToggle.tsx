"use client";

import { Segmented } from "@/components/ui/Segmented";
import type { Tier } from "@/lib/swim";

/*
  The shared target-tier selector (BRD §5.10). A single control — easiest →
  hardest, LEVEL_2 · LEVEL_3 · SANJ — that reframes the Road-to-qualify and
  %-of-cut views (and, later, the projection overlay) to "how close to *this*
  meet". Thin wrapper over the house Segmented control so it reads identically
  to the course toggle elsewhere; the shared/persisted state lives in
  `useTargetTier`. LCM-only — callers hide it on short-course views.

  Labels use the swim-desk short forms (L2 / L3 / SANJ) that match TierBadge, so
  the same vocabulary appears on the toggle, the bars, and the legend.
*/

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "LEVEL_2", label: "L2" },
  { value: "LEVEL_3", label: "L3" },
  { value: "SANJ", label: "SANJ" },
];

export function TargetTierToggle({
  value,
  onChange,
}: {
  value: Tier;
  onChange: (tier: Tier) => void;
}) {
  return (
    <Segmented
      ariaLabel="Target qualifying tier"
      value={value}
      onChange={onChange}
      options={TIER_OPTIONS}
    />
  );
}
