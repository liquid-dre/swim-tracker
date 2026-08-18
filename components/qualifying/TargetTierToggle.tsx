"use client";

import { Select } from "@/components/ui/Select";
import { GALA_MEDIUM, GALA_ORDER, type GalaCode } from "@/lib/galas";

/*
  The target-gala selector — one control that frames a "how close to *this* meet"
  view. With five galas a segmented control no longer fits (six segments once
  Road adds "All"), so this is the shared styled picker CLAUDE.md mandates for
  every select, listed hardest → easiest to match GALA_ORDER and every other
  surface. State is owned LOCALLY by each caller (the progression projection and
  the road page) — there is no global/persisted target gala.

  Labels use the medium forms ("SA Senior", "Level 3") because a bare code is too
  terse in a menu; the badges elsewhere keep the short codes.
*/

const GALA_OPTIONS = GALA_ORDER.map((code) => ({
  value: code as string,
  label: GALA_MEDIUM[code],
}));

export function TargetTierToggle({
  value,
  onChange,
  className,
}: {
  value: GalaCode;
  onChange: (gala: GalaCode) => void;
  className?: string;
}) {
  return (
    <Select
      aria-label="Target gala"
      value={value}
      onValueChange={(next) => onChange(next as GalaCode)}
      options={GALA_OPTIONS}
      className={className}
    />
  );
}
