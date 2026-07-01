import type { RawStandardRow } from "../lib/swim";

// Sample qualifying cuts for the Step 8 trigger (internal.standards
// .importSampleStandards). LCM only (§4.9); illustrative values, not the real
// SSA tables — enough to populate `standards` and exercise catch-alls, tier
// ordering (SANJ fastest < L3 < L2), and coverage (50 m = L2 only; SANJ beyond
// 200 m). The real cuts arrive via the coach's cleaned-CSV import.

type Age =
  | { kind: "young"; age: number } // e.g. "10&U"
  | { kind: "old"; age: number } // e.g. "17-19"
  | { kind: "exact"; age: number };

function row(
  tier: RawStandardRow["tier"],
  gender: RawStandardRow["gender"],
  distance: number,
  stroke: RawStandardRow["stroke"],
  age: Age,
  time: string,
): RawStandardRow {
  return {
    tier,
    gender,
    distance,
    stroke,
    age: age.age,
    isCatchAllYoung: age.kind === "young",
    isCatchAllOld: age.kind === "old",
    time,
  };
}

const YOUNG: Age = { kind: "young", age: 10 }; // 10&U
const A12: Age = { kind: "exact", age: 12 };
const A14: Age = { kind: "exact", age: 14 };
const A16: Age = { kind: "exact", age: 16 };
const OLD: Age = { kind: "old", age: 17 }; // 17-19

export const SAMPLE_STANDARDS: RawStandardRow[] = [
  // ---- Girls 100 Free — all three tiers (SANJ < L3 < L2) ----
  row("LEVEL_2", "F", 100, "FREE", YOUNG, "1:15:00"),
  row("LEVEL_2", "F", 100, "FREE", A12, "1:10:00"),
  row("LEVEL_2", "F", 100, "FREE", A14, "1:06:00"),
  row("LEVEL_2", "F", 100, "FREE", A16, "1:04:00"),
  row("LEVEL_2", "F", 100, "FREE", OLD, "1:03:00"),

  row("LEVEL_3", "F", 100, "FREE", YOUNG, "1:10:00"),
  row("LEVEL_3", "F", 100, "FREE", A12, "1:06:00"),
  row("LEVEL_3", "F", 100, "FREE", A14, "1:03:00"),
  row("LEVEL_3", "F", 100, "FREE", A16, "1:01:00"),
  row("LEVEL_3", "F", 100, "FREE", OLD, "1:00:00"),

  row("SANJ", "F", 100, "FREE", YOUNG, "1:06:00"),
  row("SANJ", "F", 100, "FREE", A12, "1:02:00"),
  row("SANJ", "F", 100, "FREE", A14, "1:00:00"),
  row("SANJ", "F", 100, "FREE", A16, "0:59:00"),
  row("SANJ", "F", 100, "FREE", OLD, "0:58:00"),

  // ---- Girls 50 Free — LEVEL_2 only (50 m has no L3/SANJ) ----
  row("LEVEL_2", "F", 50, "FREE", YOUNG, "0:34:00"),
  row("LEVEL_2", "F", 50, "FREE", A12, "0:32:00"),
  row("LEVEL_2", "F", 50, "FREE", A14, "0:30:00"),
  row("LEVEL_2", "F", 50, "FREE", A16, "0:29:00"),
  row("LEVEL_2", "F", 50, "FREE", OLD, "0:28:50"),

  // ---- Girls 800 Free — SANJ only (coverage beyond 200 m) ----
  row("SANJ", "F", 800, "FREE", { kind: "exact", age: 13 }, "10:30:00"),
  row("SANJ", "F", 800, "FREE", { kind: "exact", age: 15 }, "10:00:00"),
  row("SANJ", "F", 800, "FREE", OLD, "9:45:00"),

  // ---- Boys 100 Free — separate gender, all three tiers ----
  row("LEVEL_2", "M", 100, "FREE", YOUNG, "1:12:00"),
  row("LEVEL_2", "M", 100, "FREE", A14, "1:02:00"),
  row("LEVEL_2", "M", 100, "FREE", OLD, "0:58:00"),

  row("LEVEL_3", "M", 100, "FREE", YOUNG, "1:07:00"),
  row("LEVEL_3", "M", 100, "FREE", A14, "0:59:00"),
  row("LEVEL_3", "M", 100, "FREE", OLD, "0:55:00"),

  row("SANJ", "M", 100, "FREE", YOUNG, "1:03:00"),
  row("SANJ", "M", 100, "FREE", A14, "0:56:00"),
  row("SANJ", "M", 100, "FREE", OLD, "0:52:00"),
];
