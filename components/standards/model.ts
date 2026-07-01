import type { Id } from "@/convex/_generated/dataModel";
import { cutAgeOrder, type Stroke, type Tier } from "@/lib/swim";

// Shared shapes + tiny presentation helpers for the coach standards editor
// (Step 9, §5.8). Kept framework-free so the screen and its parts agree on the
// exact age identity and labels.

/** A cut row as `listStandards` returns it. */
export type StandardRow = {
  _id: Id<"standards">;
  tier: Tier;
  gender: "M" | "F";
  distance: number;
  stroke: Stroke;
  age: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  timeMs: number;
};

/** Columns of the editor, hardest → easiest (matches TIER_ORDER, §4.9). */
export const TIER_COLUMNS: ReadonlyArray<Tier> = ["SANJ", "LEVEL_3", "LEVEL_2"];

/** The three ways an age row is bounded. */
export type AgeKind = "young" | "exact" | "old";

export function ageKindOf(c: {
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): AgeKind {
  if (c.isCatchAllYoung) return "young";
  if (c.isCatchAllOld) return "old";
  return "exact";
}

/**
 * A stable identity for an age row across tiers: kind + bound age. Two tiers'
 * "10&U" cuts share the same key and line up on one row.
 */
export function ageKey(c: {
  age: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): string {
  return `${ageKindOf(c)}:${c.age}`;
}

/** Human age label: "10&U", "17+", or an exact "13". */
export function ageLabel(c: {
  age: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): string {
  if (c.isCatchAllYoung) return `${c.age}&U`;
  if (c.isCatchAllOld) return `${c.age}+`;
  return String(c.age);
}

/** Sort-order value on the age axis (catch-alls hug their bound). */
export function ageSort(c: {
  age: number;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): number {
  return cutAgeOrder(c);
}
