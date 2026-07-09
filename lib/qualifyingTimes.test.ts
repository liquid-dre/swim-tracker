import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  findAgeInversions,
  parseStandardsCsv,
  parseTime,
  prepareStandardImport,
  TIER_ORDER,
  type EventDef,
  type PreparedStandard,
} from "./swim";

/*
  Guards data/qualifying-times.csv — the OFFICIAL SA qualifying tables
  (8.1 Level 2, 8.2 Level 3, 8.3 SANJ), transcribed from the federation
  document. These numbers are the product's ground truth; this suite makes a
  transcription slip or an accidental edit fail CI rather than quietly skew
  every gap, tier, and qualification in the app.
*/

// The LCM slice of the event whitelist (mirrors convex/events.ts EVENTS).
const LCM: ReadonlyArray<"LCM"> = ["LCM"];
const EVENTS: EventDef[] = [
  ...[50, 100, 200].flatMap((d) =>
    ["FREE", "BACK", "BREAST", "FLY"].map((s) => ({
      distance: d,
      stroke: s,
      allowedCourses: LCM,
      active: true,
    })),
  ),
  { distance: 200, stroke: "IM", allowedCourses: LCM, active: true },
  { distance: 400, stroke: "FREE", allowedCourses: LCM, active: true },
  { distance: 400, stroke: "IM", allowedCourses: LCM, active: true },
  { distance: 800, stroke: "FREE", allowedCourses: LCM, active: true },
  { distance: 1500, stroke: "FREE", allowedCourses: LCM, active: true },
];

const csv = readFileSync(join(__dirname, "..", "data", "qualifying-times.csv"), "utf8");

function importAll(): PreparedStandard[] {
  const parsed = parseStandardsCsv(csv);
  expect(parsed.rejected).toEqual([]);
  const prepared = prepareStandardImport(
    parsed.rows.map((r) => r.row),
    EVENTS,
  );
  expect(prepared.rejected).toEqual([]);
  return prepared.accepted;
}

describe("official qualifying-times CSV", () => {
  it("parses completely: every row a valid, covered LCM cut", () => {
    const accepted = importAll();
    expect(accepted).toHaveLength(406);
  });

  it("has the exact per-tier shape of the federation tables", () => {
    const accepted = importAll();
    const count = (tier: string) => accepted.filter((c) => c.tier === tier).length;
    expect(count("LEVEL_2")).toBe(168); // 12 events × 7 ages × 2 genders
    expect(count("LEVEL_3")).toBe(108); // 9 events × 6 ages × 2 genders
    expect(count("SANJ")).toBe(130); // 13 events × 5 ages × 2 genders
  });

  it("models the &U columns as young catch-alls (and nothing else)", () => {
    const accepted = importAll();
    const youngAge: Record<string, number> = { LEVEL_2: 10, LEVEL_3: 11, SANJ: 12 };
    for (const cut of accepted) {
      expect(cut.isCatchAllOld).toBe(false); // 16 is the exact oldest age — 17+ has no cut
      expect(cut.isCatchAllYoung).toBe(cut.age === youngAge[cut.tier]);
    }
  });

  it("never has a younger cut faster than an older one (transcription guard)", () => {
    const accepted = importAll();
    const groups = new Map<string, PreparedStandard[]>();
    for (const cut of accepted) {
      const key = `${cut.tier}|${cut.gender}|${cut.distance}|${cut.stroke}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(cut);
    }
    for (const [key, cuts] of groups) {
      expect(
        findAgeInversions(cuts).map(() => key), // name the group on failure
      ).toEqual([]);
    }
  });

  it("keeps the tier order at every (gender, event, age): SANJ < L3 < L2", () => {
    const accepted = importAll();
    const at = (tier: string, gender: string, d: number, s: string, age: number) =>
      accepted.find(
        (c) =>
          c.tier === tier && c.gender === gender && c.distance === d &&
          c.stroke === s && c.age === age && !c.isCatchAllYoung,
      )?.timeMs;
    // Exact ages 13-16 exist in all three tiers for the shared events.
    for (const gender of ["F", "M"] as const) {
      for (const [d, s] of [[100, "FREE"], [200, "BACK"], [100, "BREAST"], [200, "IM"]] as const) {
        for (const age of [13, 14, 15, 16]) {
          const [sanj, l3, l2] = TIER_ORDER.map((t) => at(t, gender, d, s, age));
          expect(sanj, `${gender} ${d}${s} ${age}`).toBeDefined();
          expect(l3, `${gender} ${d}${s} ${age}`).toBeDefined();
          expect(l2, `${gender} ${d}${s} ${age}`).toBeDefined();
          expect(sanj!).toBeLessThan(l3!);
          expect(l3!).toBeLessThan(l2!);
        }
      }
    }
  });

  it("matches hand-checked anchor values from each table", () => {
    const accepted = importAll();
    const ms = (tier: string, gender: string, d: number, s: string, age: number) =>
      accepted.find(
        (c) =>
          c.tier === tier && c.gender === gender && c.distance === d &&
          c.stroke === s && c.age === age,
      )!.timeMs;
    // 8.3 SANJ: W 16 100 Free 1:02:73; M 14 100 Free 58:69; M 16 1500 Free 17:49:19.
    expect(ms("SANJ", "F", 100, "FREE", 16)).toBe(parseTime("1:02:73"));
    expect(ms("SANJ", "M", 100, "FREE", 14)).toBe(parseTime("58:69"));
    expect(ms("SANJ", "M", 1500, "FREE", 16)).toBe(parseTime("17:49:19"));
    // 8.2 L3: W 11&U 200 IM 3:18:89; M 15 100 Free 59:46.
    expect(ms("LEVEL_3", "F", 200, "IM", 11)).toBe(parseTime("3:18:89"));
    expect(ms("LEVEL_3", "M", 100, "FREE", 15)).toBe(parseTime("59:46"));
    // 8.1 L2: W 10&U 50 Free 39:72; M 16 50 Free 28:26; M 15 200 Back 3:04:04.
    expect(ms("LEVEL_2", "F", 50, "FREE", 10)).toBe(parseTime("39:72"));
    expect(ms("LEVEL_2", "M", 50, "FREE", 16)).toBe(parseTime("28:26"));
    expect(ms("LEVEL_2", "M", 200, "BACK", 15)).toBe(parseTime("3:04:04"));
  });
});
