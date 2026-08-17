import type { Id } from "@/convex/_generated/dataModel";
import { cutAgeOrder, type Course, type GalaCode, type Stroke } from "@/lib/swim";
import { GALA_ORDER } from "@/lib/galas";

// Shared shapes + tiny presentation helpers for the coach standards editor
// (Step 9, §5.8). Kept framework-free so the screen and its parts agree on the
// exact age identity and labels.

/** A cut row as `listStandards` returns it. */
export type StandardRow = {
  _id: Id<"standards">;
  galaId: Id<"galas">;
  gala: GalaCode;
  course: Course;
  gender: "M" | "F";
  distance: number;
  stroke: Stroke;
  /** null on an open standard (SANS/SANY): one cut for every age. */
  age: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
  timeMs: number;
};

/** Columns of the editor, hardest → easiest — the one gala order (§4.9). */
export const GALA_COLUMNS: ReadonlyArray<GalaCode> = GALA_ORDER;

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
 * A stable identity for an age row across galas: kind + bound age. Two galas'
 * "10&U" cuts share the same key and line up on one row. Open standards share
 * the single "open" row — they apply at every age.
 */
export function ageKey(c: {
  age: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): string {
  return c.age === null ? "open" : `${ageKindOf(c)}:${c.age}`;
}

/** Human age label: "10&U", "17+", or an exact "13". */
export function ageLabel(c: {
  age: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): string {
  if (c.age === null) return "All ages";
  if (c.isCatchAllYoung) return `${c.age}&U`;
  if (c.isCatchAllOld) return `${c.age}+`;
  return String(c.age);
}

/** Sort-order value on the age axis (catch-alls hug their bound). */
export function ageSort(c: {
  age: number | null;
  isCatchAllYoung: boolean;
  isCatchAllOld: boolean;
}): number {
  return cutAgeOrder(c);
}
