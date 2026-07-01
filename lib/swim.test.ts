import { describe, it, expect } from "vitest";
import {
  parseTime,
  formatTime,
  clockFromDigits,
  computeAge,
  computeAgeGroup,
  isValidEvent,
  computePersonalBests,
  eventLabel,
  eventSortKey,
  DEFAULT_AGE_BANDS,
  TIER_ORDER,
  tierCoversEvent,
  resolveStandardTime,
  pickApplicableStandards,
  highestTierMet,
  computeMatrixCell,
  prepareStandardImport,
  parseStandardsCsv,
  findAgeInversions,
  cutAgeOrder,
  computeCalibratedRadius,
  STROKE_RING_POS,
  STROKE_RADIUS_MAX,
  rollingSeasonStart,
  isInSeason,
  computeSeasonImprovements,
  computeOverallImprovement,
  type EventDef,
  type ResultForPB,
  type StandardCut,
  type Tier,
  type RawStandardRow,
  type AgeCut,
  type SeasonSwim,
} from "./swim";
import { SAMPLE_STANDARDS } from "../convex/standardsSampleData";

// ---------------------------------------------------------------------------
// parseTime (BRD §4.4) — the bulletproof parser
// ---------------------------------------------------------------------------

describe("parseTime", () => {
  it("parses 3-group mm:ss:hh", () => {
    expect(parseTime("1:07:47")).toBe(67470);
    expect(parseTime("0:33:68")).toBe(33680);
    expect(parseTime("0:28:91")).toBe(28910);
  });

  it("parses 2-group values as ss:hh, never mm:ss", () => {
    // The critical sub-minute case: 59.09 s, NOT 59 minutes.
    expect(parseTime("59:09")).toBe(59090);
    expect(parseTime("28:91")).toBe(28910);
  });

  it("accepts comma decimals", () => {
    expect(parseTime("33,68")).toBe(33680);
    expect(parseTime("1,07,47")).toBe(67470);
  });

  it("accepts period separators", () => {
    expect(parseTime("5:48.28")).toBe(348280);
    expect(parseTime("28.91")).toBe(28910);
  });

  it("accepts colon-as-decimal", () => {
    expect(parseTime("1:07:47")).toBe(67470);
  });

  it("trims surrounding whitespace", () => {
    expect(parseTime("  59:09  ")).toBe(59090);
  });

  it("round-trips with formatTime for every listed format", () => {
    for (const input of ["1:07:47", "59:09", "0:33:68", "0:28:91"]) {
      const ms = parseTime(input);
      expect(parseTime(formatTime(ms))).toBe(ms);
    }
  });

  it("throws on invalid inputs (fails loudly, never guesses)", () => {
    expect(() => parseTime("")).toThrow();
    expect(() => parseTime("   ")).toThrow();
    expect(() => parseTime("abc")).toThrow();
    expect(() => parseTime("1:2:3:4")).toThrow(); // too many groups
    expect(() => parseTime("45")).toThrow(); // single group is ambiguous
    expect(() => parseTime("1:60:00")).toThrow(); // seconds > 59
    expect(() => parseTime("60:00")).toThrow(); // seconds > 59 (ss:hh)
    expect(() => parseTime("0:00:00")).toThrow(); // result not > 0
    expect(() => parseTime("1:07:")).toThrow(); // empty trailing group
    expect(() => parseTime(":07:47")).toThrow(); // empty leading group
    expect(() => parseTime("1:0x:47")).toThrow(); // non-numeric group
    expect(() => parseTime("-1:07:47")).toThrow(); // sign rejected
  });
});

// ---------------------------------------------------------------------------
// formatTime (BRD §4.4) — canonical inverse
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  it("emits canonical m:ss:hh, zero-padded, minutes always present", () => {
    expect(formatTime(67470)).toBe("1:07:47");
    expect(formatTime(59090)).toBe("0:59:09");
    expect(formatTime(33680)).toBe("0:33:68");
    expect(formatTime(28910)).toBe("0:28:91");
    expect(formatTime(348280)).toBe("5:48:28");
  });

  it("throws on invalid input", () => {
    expect(() => formatTime(-1)).toThrow();
    expect(() => formatTime(Number.NaN)).toThrow();
    expect(() => formatTime(Number.POSITIVE_INFINITY)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// clockFromDigits (Step 5) — poolside numeric entry
// ---------------------------------------------------------------------------

describe("clockFromDigits", () => {
  it("right-fills digits calculator-style (last 2 = hundredths)", () => {
    expect(clockFromDigits("10747")).toEqual({ minutes: 1, ss: "07", hh: "47" });
    expect(clockFromDigits("3368")).toEqual({ minutes: 0, ss: "33", hh: "68" });
    expect(clockFromDigits("54828")).toEqual({ minutes: 5, ss: "48", hh: "28" });
    expect(clockFromDigits("5")).toEqual({ minutes: 0, ss: "00", hh: "05" });
    expect(clockFromDigits("")).toEqual({ minutes: 0, ss: "00", hh: "00" });
  });

  it("strips non-digits so pasted times regroup identically", () => {
    expect(clockFromDigits("1:07:47")).toEqual({ minutes: 1, ss: "07", hh: "47" });
    expect(clockFromDigits("33,68")).toEqual({ minutes: 0, ss: "33", hh: "68" });
    expect(clockFromDigits("5:48.28")).toEqual({ minutes: 5, ss: "48", hh: "28" });
  });

  it("caps at 6 digits (max 99:59:99) keeping the rightmost", () => {
    expect(clockFromDigits("1234567")).toEqual({ minutes: 23, ss: "45", hh: "67" });
  });

  it("round-trips through parseTime for valid clocks", () => {
    const { minutes, ss, hh } = clockFromDigits("10747");
    expect(parseTime(`${minutes}:${ss}:${hh}`)).toBe(67470);
  });
});

// ---------------------------------------------------------------------------
// computeAge (BRD §4.7)
// ---------------------------------------------------------------------------

describe("computeAge", () => {
  it("counts whole years (age last birthday)", () => {
    expect(computeAge("2010-01-01", "2020-01-01")).toBe(10);
    expect(computeAge("2010-06-15", "2020-06-15")).toBe(10); // on birthday
    expect(computeAge("2010-06-15", "2020-06-14")).toBe(9); // day before
    expect(computeAge("2010-06-15", "2020-06-16")).toBe(10); // day after
  });

  it("accepts Date objects", () => {
    expect(computeAge(new Date("2010-01-01"), new Date("2021-01-01"))).toBe(11);
  });

  it("throws on invalid dates", () => {
    expect(() => computeAge("not-a-date", "2020-01-01")).toThrow();
    expect(() => computeAge("2010-01-01", "nope")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeAgeGroup (BRD §4.7) — boundary ages 8, 9, 10, 11, 16, 17
// ---------------------------------------------------------------------------

describe("computeAgeGroup", () => {
  // Fixed reference date; birthdays chosen so age equals the target exactly.
  const asOf = "2020-01-01";
  const bornForAge = (age: number) => `${2020 - age}-01-01`;

  it("maps boundary ages to the right band", () => {
    expect(computeAgeGroup(bornForAge(8), asOf)).toBe("8&U");
    expect(computeAgeGroup(bornForAge(9), asOf)).toBe("9-10");
    expect(computeAgeGroup(bornForAge(10), asOf)).toBe("9-10");
    expect(computeAgeGroup(bornForAge(11), asOf)).toBe("11-12");
    expect(computeAgeGroup(bornForAge(16), asOf)).toBe("15-16");
    expect(computeAgeGroup(bornForAge(17), asOf)).toBe("17&O");
  });

  it("catches very young and very old ages at the open-ended bands", () => {
    expect(computeAgeGroup(bornForAge(5), asOf)).toBe("8&U");
    expect(computeAgeGroup(bornForAge(40), asOf)).toBe("17&O");
  });

  it("supports a configurable band scheme with '8&U' removed", () => {
    const bands = DEFAULT_AGE_BANDS.filter((b) => b.label !== "8&U");
    // 9–10 is now the youngest band; sub-9 ages clamp to it.
    expect(computeAgeGroup(bornForAge(9), asOf, bands)).toBe("9-10");
    expect(computeAgeGroup(bornForAge(7), asOf, bands)).toBe("9-10");
    expect(computeAgeGroup(bornForAge(11), asOf, bands)).toBe("11-12");
  });
});

// ---------------------------------------------------------------------------
// isValidEvent (BRD §4.3) — whitelist + course validity
// ---------------------------------------------------------------------------

describe("isValidEvent", () => {
  // The complete event whitelist (BRD §4.3), mirroring convex/events.ts.
  const BOTH = ["SCM", "LCM"] as const;
  const events: EventDef[] = [
    { distance: 50, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 50, stroke: "BACK", allowedCourses: [...BOTH], active: true },
    { distance: 50, stroke: "BREAST", allowedCourses: [...BOTH], active: true },
    { distance: 50, stroke: "FLY", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "BACK", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "BREAST", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "FLY", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "IM", allowedCourses: ["SCM"], active: true }, // SCM-only
    { distance: 200, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 200, stroke: "IM", allowedCourses: [...BOTH], active: true },
    { distance: 400, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 400, stroke: "IM", allowedCourses: [...BOTH], active: true },
    { distance: 800, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 1500, stroke: "FREE", allowedCourses: [...BOTH], active: true },
  ];

  it("accepts valid whitelisted events", () => {
    expect(isValidEvent(800, "FREE", "LCM", events)).toBe(true);
    expect(isValidEvent(800, "FREE", "SCM", events)).toBe(true);
    expect(isValidEvent(100, "IM", "SCM", events)).toBe(true);
    expect(isValidEvent(400, "IM", "LCM", events)).toBe(true);
  });

  it("rejects events not on the whitelist", () => {
    expect(isValidEvent(50, "IM", "SCM", events)).toBe(false); // no 50 IM
    expect(isValidEvent(50, "IM", "LCM", events)).toBe(false);
    expect(isValidEvent(800, "FLY", "LCM", events)).toBe(false); // no 800 Fly
    expect(isValidEvent(400, "BACK", "LCM", events)).toBe(false); // 400 is Free/IM only
  });

  it("rejects a valid event on a disallowed course", () => {
    expect(isValidEvent(100, "IM", "LCM", events)).toBe(false); // 100 IM is SCM-only
  });

  it("rejects an inactive event", () => {
    const withInactive: EventDef[] = [
      { distance: 200, stroke: "FLY", allowedCourses: ["SCM", "LCM"], active: false },
    ];
    expect(isValidEvent(200, "FLY", "SCM", withInactive)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// event labels + ordering
// ---------------------------------------------------------------------------

describe("eventLabel / eventSortKey", () => {
  it("labels events the BRD way", () => {
    expect(eventLabel(100, "IM")).toBe("100 IM");
    expect(eventLabel(800, "FREE")).toBe("800 Free");
    expect(eventLabel(50, "BREAST")).toBe("50 Breast");
  });

  it("orders 50→1500 then Free→Back→Breast→Fly→IM", () => {
    const events: Array<[number, string]> = [
      [200, "IM"],
      [50, "FREE"],
      [100, "BACK"],
      [50, "FLY"],
      [100, "FREE"],
    ];
    const sorted = [...events].sort(
      (a, b) => eventSortKey(a[0], a[1]) - eventSortKey(b[0], b[1]),
    );
    expect(sorted).toEqual([
      [50, "FREE"],
      [50, "FLY"],
      [100, "FREE"],
      [100, "BACK"],
      [200, "IM"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// computePersonalBests (BRD §4.6, §5.4) — derived PBs
// ---------------------------------------------------------------------------

describe("computePersonalBests", () => {
  // Helper to keep the fixtures terse.
  const r = (
    distance: number,
    stroke: string,
    course: string,
    timeMs: number,
    swimType: ResultForPB["swimType"],
    swimDate: string,
    meetName?: string,
  ): ResultForPB => ({ distance, stroke, course, timeMs, swimType, swimDate, meetName });

  it("headline PB is the fastest MEET time and ignores trials/practice", () => {
    const pbs = computePersonalBests([
      r(100, "FREE", "LCM", 61000, "PRACTICE", "2026-01-01"), // faster, but practice
      r(100, "FREE", "LCM", 62000, "MEET", "2026-02-01", "Autumn Open"),
      r(100, "FREE", "LCM", 61500, "TIME_TRIAL", "2026-03-01"), // faster, but trial
      r(100, "FREE", "LCM", 62500, "MEET", "2026-04-01", "Winter Cup"),
    ]);
    expect(pbs).toHaveLength(1);
    expect(pbs[0].headline).toEqual({
      timeMs: 62000,
      swimDate: "2026-02-01",
      meetName: "Autumn Open",
    });
    // overallBest DOES consider the faster practice swim.
    expect(pbs[0].overallBest).toEqual({
      timeMs: 61000,
      swimDate: "2026-01-01",
      swimType: "PRACTICE",
    });
  });

  it("carries the correct date + meet for the fastest meet swim", () => {
    const pbs = computePersonalBests([
      r(200, "FREE", "LCM", 130000, "MEET", "2025-11-10", "Early Meet"),
      r(200, "FREE", "LCM", 128000, "MEET", "2026-03-20", "Champs"), // the PB
      r(200, "FREE", "LCM", 129000, "MEET", "2026-05-01", "Later Meet"),
    ]);
    expect(pbs[0].headline).toEqual({
      timeMs: 128000,
      swimDate: "2026-03-20",
      meetName: "Champs",
    });
  });

  it("ties on the fastest meet time break to the earliest date", () => {
    const pbs = computePersonalBests([
      r(50, "FREE", "SCM", 30000, "MEET", "2026-04-01", "Second"),
      r(50, "FREE", "SCM", 30000, "MEET", "2026-01-01", "First"),
    ]);
    expect(pbs[0].headline).toEqual({
      timeMs: 30000,
      swimDate: "2026-01-01",
      meetName: "First",
    });
  });

  it("has no headline PB when only non-meet swims exist, but keeps overallBest", () => {
    const pbs = computePersonalBests([
      r(100, "BACK", "SCM", 70000, "PRACTICE", "2026-01-01"),
      r(100, "BACK", "SCM", 69000, "TIME_TRIAL", "2026-02-01"),
    ]);
    expect(pbs[0].headline).toBeNull();
    expect(pbs[0].improvement).toBeNull();
    expect(pbs[0].overallBest).toEqual({
      timeMs: 69000,
      swimDate: "2026-02-01",
      swimType: "TIME_TRIAL",
    });
  });

  it("computes improvement from the earliest swim even when it was non-meet", () => {
    const pbs = computePersonalBests([
      r(100, "FREE", "LCM", 70000, "PRACTICE", "2025-09-01"), // earliest, non-meet baseline
      r(100, "FREE", "LCM", 66000, "MEET", "2026-01-01", "Meet A"),
      r(100, "FREE", "LCM", 63000, "MEET", "2026-05-01", "Meet B"), // headline PB
    ]);
    const imp = pbs[0].improvement!;
    expect(imp.fromMs).toBe(70000);
    expect(imp.fromDate).toBe("2025-09-01");
    expect(imp.fromSwimType).toBe("PRACTICE");
    expect(imp.toMs).toBe(63000);
    expect(imp.absMs).toBe(7000); // 70.00s → 63.00s = 7.00s dropped
    expect(imp.pct).toBe(10); // 7000 / 70000 = 10%
  });

  it("reports a signed (negative) improvement when the earliest swim was faster", () => {
    const pbs = computePersonalBests([
      r(50, "FLY", "LCM", 30000, "PRACTICE", "2025-09-01"), // fast early practice
      r(50, "FLY", "LCM", 31000, "MEET", "2026-05-01", "Only Meet"), // slower meet PB
    ]);
    const imp = pbs[0].improvement!;
    expect(imp.absMs).toBe(-1000);
    expect(imp.pct).toBeCloseTo(-3.33, 2);
  });

  it("separates SCM and LCM into distinct records and orders them", () => {
    const pbs = computePersonalBests([
      r(100, "FREE", "SCM", 60000, "MEET", "2026-02-01", "SC Meet"),
      r(100, "FREE", "LCM", 62000, "MEET", "2026-02-01", "LC Meet"),
      r(50, "FREE", "LCM", 30000, "MEET", "2026-02-01", "LC Sprint"),
    ]);
    // 50 Free before 100 Free; within 100 Free, LCM before SCM.
    expect(pbs.map((p) => `${p.distance}${p.stroke}${p.course}`)).toEqual([
      "50FREELCM",
      "100FREELCM",
      "100FREESCM",
    ]);
    // Courses never merge: two separate 100 Free records.
    const oneHundreds = pbs.filter((p) => p.distance === 100);
    expect(oneHundreds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Qualifying standards (BRD §4.9, Step 8) — LCM only, SANJ > LEVEL_3 > LEVEL_2
// ---------------------------------------------------------------------------

describe("TIER_ORDER", () => {
  it("is hardest → easiest (§4.9)", () => {
    expect(TIER_ORDER).toEqual(["SANJ", "LEVEL_3", "LEVEL_2"]);
  });
});

describe("tierCoversEvent (§4.9 coverage is a hard rule)", () => {
  it("50 m is LEVEL_2 only — no 50 m L3/SANJ ever", () => {
    expect(tierCoversEvent("LEVEL_2", 50, "FREE")).toBe(true);
    expect(tierCoversEvent("LEVEL_3", 50, "FREE")).toBe(false);
    expect(tierCoversEvent("SANJ", 50, "FREE")).toBe(false);
  });

  it("LEVEL_2 tops out at 200 m (+ 200 IM); nothing longer", () => {
    expect(tierCoversEvent("LEVEL_2", 200, "FREE")).toBe(true);
    expect(tierCoversEvent("LEVEL_2", 200, "IM")).toBe(true);
    expect(tierCoversEvent("LEVEL_2", 400, "FREE")).toBe(false);
    expect(tierCoversEvent("LEVEL_2", 800, "FREE")).toBe(false);
    expect(tierCoversEvent("LEVEL_2", 1500, "FREE")).toBe(false);
  });

  it("LEVEL_3 is 100/200/400 + 200 IM; no 800/1500, no 200 Fly, no 400 IM", () => {
    expect(tierCoversEvent("LEVEL_3", 100, "FREE")).toBe(true);
    expect(tierCoversEvent("LEVEL_3", 400, "FREE")).toBe(true);
    expect(tierCoversEvent("LEVEL_3", 200, "IM")).toBe(true);
    expect(tierCoversEvent("LEVEL_3", 200, "FLY")).toBe(false); // no 200 Fly
    expect(tierCoversEvent("LEVEL_3", 400, "IM")).toBe(false); // no 400 IM
    expect(tierCoversEvent("LEVEL_3", 800, "FREE")).toBe(false);
  });

  it("SANJ covers 100→1500 Free, all strokes' 100/200, 400 Free/IM, 200 IM; no 50s", () => {
    expect(tierCoversEvent("SANJ", 800, "FREE")).toBe(true);
    expect(tierCoversEvent("SANJ", 1500, "FREE")).toBe(true);
    expect(tierCoversEvent("SANJ", 200, "FLY")).toBe(true);
    expect(tierCoversEvent("SANJ", 400, "IM")).toBe(true);
    expect(tierCoversEvent("SANJ", 400, "BACK")).toBe(false);
    expect(tierCoversEvent("SANJ", 50, "FREE")).toBe(false);
  });
});

describe("resolveStandardTime — catch-all resolution (§4.9)", () => {
  // 100 Free girls: 10&U catch-all, exact 12 & 14, 17-19 catch-all.
  const cuts: StandardCut[] = [
    { age: 10, isCatchAllYoung: true, isCatchAllOld: false, timeMs: 66000 }, // 10&U
    { age: 12, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 62000 },
    { age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
    { age: 17, isCatchAllYoung: false, isCatchAllOld: true, timeMs: 58000 }, // 17-19
  ];

  it("a 9-year-old resolves to the 10&U young catch-all", () => {
    expect(resolveStandardTime(cuts, 9)).toBe(66000);
    expect(resolveStandardTime(cuts, 10)).toBe(66000); // bound is inclusive
  });

  it("a 20-year-old resolves to the 17-19 old catch-all", () => {
    expect(resolveStandardTime(cuts, 20)).toBe(58000);
    expect(resolveStandardTime(cuts, 17)).toBe(58000); // bound is inclusive
  });

  it("an exact age wins over any catch-all", () => {
    expect(resolveStandardTime(cuts, 12)).toBe(62000);
    expect(resolveStandardTime(cuts, 14)).toBe(60000);
  });

  it("returns null when no row applies (sparse coverage → no line)", () => {
    expect(resolveStandardTime([], 14)).toBeNull();
    // 11 falls in a gap here (no exact 11, outside both catch-alls) → null.
    expect(resolveStandardTime(cuts, 11)).toBeNull();
  });
});

describe("sparse coverage → null (§4.9)", () => {
  it("50 Free SANJ and 400 Free LEVEL_2 have no coverage", () => {
    expect(tierCoversEvent("SANJ", 50, "FREE")).toBe(false);
    expect(tierCoversEvent("LEVEL_2", 400, "FREE")).toBe(false);
    // With no rows for an uncovered tier, resolution is null (never interpolated).
    expect(resolveStandardTime([], 14)).toBeNull();
  });
});

describe("pickApplicableStandards (§4.9) — omits tiers with no cut", () => {
  it("returns only the tiers that resolve at the exact age", () => {
    const rows: Array<StandardCut & { tier: Tier }> = [
      { tier: "LEVEL_2", age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 66000 },
      { tier: "SANJ", age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
      // No LEVEL_3 row → LEVEL_3 must be absent from the result.
    ];
    expect(pickApplicableStandards(rows, 14)).toEqual({ SANJ: 60000, LEVEL_2: 66000 });
  });

  it("is empty when nothing resolves at the age", () => {
    const rows: Array<StandardCut & { tier: Tier }> = [
      { tier: "SANJ", age: 12, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
    ];
    expect(pickApplicableStandards(rows, 15)).toEqual({});
  });
});

describe("highestTierMet (§4.9 order) — hardest first", () => {
  const cutsByTier = { SANJ: 58000, LEVEL_3: 60000, LEVEL_2: 63000 };

  it("returns the hardest tier the PB meets", () => {
    expect(highestTierMet(57000, cutsByTier)).toBe("SANJ"); // beats the fastest cut
    expect(highestTierMet(59000, cutsByTier)).toBe("LEVEL_3");
    expect(highestTierMet(61000, cutsByTier)).toBe("LEVEL_2");
    expect(highestTierMet(64000, cutsByTier)).toBeNull(); // slower than all cuts
  });

  it("treats equal-to-cut as met", () => {
    expect(highestTierMet(58000, cutsByTier)).toBe("SANJ");
    expect(highestTierMet(63000, cutsByTier)).toBe("LEVEL_2");
  });

  it("skips tiers with no cut", () => {
    expect(highestTierMet(61000, { LEVEL_2: 63000 })).toBe("LEVEL_2");
    // SANJ not met, LEVEL_3 absent → falls through to LEVEL_2.
    expect(highestTierMet(59000, { SANJ: 58000, LEVEL_2: 63000 })).toBe("LEVEL_2");
    expect(highestTierMet(59000, {})).toBeNull();
  });
});

describe("computeMatrixCell (§5.7) — highest tier met + gap to next up", () => {
  const cuts = { SANJ: 58000, LEVEL_3: 60000, LEVEL_2: 63000 };

  it("is blank/neutral when no tier has a cut", () => {
    expect(computeMatrixCell(60000, {})).toEqual({
      hasCut: false,
      tier: null,
      nextTier: null,
      gapMs: null,
    });
  });

  it("has a cut but no tier/gap when there is no PB yet (target = easiest)", () => {
    expect(computeMatrixCell(null, cuts)).toEqual({
      hasCut: true,
      tier: null,
      nextTier: "LEVEL_2",
      gapMs: null,
    });
  });

  it("none met → target the easiest tier, gap = PB − its cut", () => {
    // 64000 is slower than every cut; next up is L2.
    expect(computeMatrixCell(64000, cuts)).toEqual({
      hasCut: true,
      tier: null,
      nextTier: "LEVEL_2",
      gapMs: 1000,
    });
  });

  it("met L2 → next up is L3, gap = PB − L3 cut", () => {
    expect(computeMatrixCell(61000, cuts)).toEqual({
      hasCut: true,
      tier: "LEVEL_2",
      nextTier: "LEVEL_3",
      gapMs: 1000, // 61000 − 60000
    });
  });

  it("met L3 → next up is SANJ, gap = PB − SANJ cut", () => {
    expect(computeMatrixCell(59000, cuts)).toEqual({
      hasCut: true,
      tier: "LEVEL_3",
      nextTier: "SANJ",
      gapMs: 1000, // 59000 − 58000
    });
  });

  it("met the hardest available tier → no next up, no gap", () => {
    expect(computeMatrixCell(57000, cuts)).toEqual({
      hasCut: true,
      tier: "SANJ",
      nextTier: null,
      gapMs: null,
    });
    // equal-to-cut counts as met.
    expect(computeMatrixCell(58000, cuts)).toEqual({
      hasCut: true,
      tier: "SANJ",
      nextTier: null,
      gapMs: null,
    });
  });

  it("walks only the tiers that have a cut (sparse coverage, §4.9)", () => {
    // 50m is LEVEL_2-only — no harder tier exists, so meeting L2 tops out.
    expect(computeMatrixCell(30000, { LEVEL_2: 31000 })).toEqual({
      hasCut: true,
      tier: "LEVEL_2",
      nextTier: null,
      gapMs: null,
    });
    // Distance event: SANJ-only. Met → tops out; not met → gap to SANJ.
    expect(computeMatrixCell(900000, { SANJ: 950000 })).toEqual({
      hasCut: true,
      tier: "SANJ",
      nextTier: null,
      gapMs: null,
    });
    expect(computeMatrixCell(970000, { SANJ: 950000 })).toEqual({
      hasCut: true,
      tier: null,
      nextTier: "SANJ",
      gapMs: 20000,
    });
    // L2 met but next-up SANJ (no L3 cut here) → gap skips the absent tier.
    expect(computeMatrixCell(61000, { SANJ: 58000, LEVEL_2: 63000 })).toEqual({
      hasCut: true,
      tier: "LEVEL_2",
      nextTier: "SANJ",
      gapMs: 3000, // 61000 − 58000
    });
  });
});

describe("prepareStandardImport (§4.4/§4.9) — rejects + reports, never drops", () => {
  // A minimal LCM whitelist: 100 IM is SCM-only, 50 IM does not exist.
  const BOTH = ["SCM", "LCM"] as const;
  const events: EventDef[] = [
    { distance: 50, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 100, stroke: "IM", allowedCourses: ["SCM"], active: true },
    { distance: 200, stroke: "FLY", allowedCourses: [...BOTH], active: true },
    { distance: 200, stroke: "IM", allowedCourses: [...BOTH], active: true },
    { distance: 400, stroke: "FREE", allowedCourses: [...BOTH], active: true },
    { distance: 800, stroke: "FREE", allowedCourses: [...BOTH], active: true },
  ];

  const good = (over: Partial<RawStandardRow> = {}): RawStandardRow => ({
    tier: "LEVEL_2",
    gender: "F",
    distance: 100,
    stroke: "FREE",
    age: 14,
    isCatchAllYoung: false,
    isCatchAllOld: false,
    time: "1:06:00",
    ...over,
  });

  it("accepts a good row and reports a bad (unparseable) one — keeping the row", () => {
    const rows: RawStandardRow[] = [good(), good({ time: "not-a-time" })];
    const { accepted, rejected } = prepareStandardImport(rows, events);

    expect(accepted).toHaveLength(1);
    expect(accepted[0].timeMs).toBe(66000);

    expect(rejected).toHaveLength(1);
    expect(rejected[0].index).toBe(1);
    expect(rejected[0].reason).toMatch(/unparseable time/);
    expect(rejected[0].row).toBe(rows[1]); // preserved, not silently dropped
  });

  it("rejects events off the whitelist (50 IM, 100 IM on LCM)", () => {
    const rows: RawStandardRow[] = [
      good({ distance: 50, stroke: "IM" }), // no 50 IM at all
      good({ distance: 100, stroke: "IM" }), // 100 IM is SCM-only
    ];
    const { accepted, rejected } = prepareStandardImport(rows, events);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => /valid LCM event/.test(r.reason))).toBe(true);
  });

  it("rejects coverage violations (SANJ 50 Free, LEVEL_2 400 Free)", () => {
    const rows: RawStandardRow[] = [
      good({ tier: "SANJ", distance: 50, stroke: "FREE" }),
      good({ tier: "LEVEL_2", distance: 400, stroke: "FREE" }),
    ];
    const { accepted, rejected } = prepareStandardImport(rows, events);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => /no coverage/.test(r.reason))).toBe(true);
  });

  it("rejects off-enum fields and impossible catch-all flags", () => {
    const rows: RawStandardRow[] = [
      good({ tier: "LEVEL_9" }),
      good({ gender: "X" }),
      good({ age: 0 }),
      good({ isCatchAllYoung: true, isCatchAllOld: true }),
    ];
    const { accepted, rejected } = prepareStandardImport(rows, events);
    expect(accepted).toHaveLength(0);
    expect(rejected.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it("parses catch-all rows to the right ms and flags", () => {
    const rows: RawStandardRow[] = [
      good({ age: 10, isCatchAllYoung: true, time: "1:15:00" }),
      good({ age: 17, isCatchAllOld: true, time: "1:03:00" }),
    ];
    const { accepted, rejected } = prepareStandardImport(rows, events);
    expect(rejected).toHaveLength(0);
    expect(accepted[0]).toMatchObject({ age: 10, isCatchAllYoung: true, timeMs: 75000 });
    expect(accepted[1]).toMatchObject({ age: 17, isCatchAllOld: true, timeMs: 63000 });
  });

  it("accepts the whole bundled sample dataset (populates standards)", () => {
    // The full LCM whitelist (§4.3) — the sample only touches Free events.
    const BOTH = ["SCM", "LCM"] as const;
    const whitelist: EventDef[] = [50, 100, 200, 400, 800, 1500].map((d) => ({
      distance: d,
      stroke: "FREE",
      allowedCourses: [...BOTH],
      active: true,
    }));
    const { accepted, rejected } = prepareStandardImport(SAMPLE_STANDARDS, whitelist);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(SAMPLE_STANDARDS.length);
  });
});

// ---------------------------------------------------------------------------
// parseStandardsCsv (§5.8) — coerce strings; the "false"-is-truthy trap
// ---------------------------------------------------------------------------

describe("parseStandardsCsv — type coercion + rejects", () => {
  const header = "tier,gender,distance,stroke,age,isCatchAllYoung,isCatchAllOld,time";

  it("skips the header and coerces numbers + REAL booleans", () => {
    const csv = [
      header,
      "LEVEL_2,F,100,FREE,10,true,false,1:15:00",
      "SANJ,M,200,IM,17,false,true,2:20:00",
    ].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(2);

    // The 12&U-style young catch-all must be boolean TRUE (not the string).
    expect(rows[0].row).toEqual({
      tier: "LEVEL_2",
      gender: "F",
      distance: 100,
      stroke: "FREE",
      age: 10,
      isCatchAllYoung: true,
      isCatchAllOld: false,
      time: "1:15:00",
    });
    expect(typeof rows[0].row.isCatchAllYoung).toBe("boolean");
    expect(typeof rows[0].row.distance).toBe("number");
    // Oldest catch-all on the second row.
    expect(rows[1].row.isCatchAllOld).toBe(true);
    expect(rows[1].row.isCatchAllYoung).toBe(false);
  });

  it("works without a header row and ignores blank lines", () => {
    const csv = ["LEVEL_2,F,50,FREE,12,false,false,0:32:00", "", "   "].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(1);
  });

  it("rejects a non-boolean flag rather than guessing (never truthy-coerce)", () => {
    const csv = [header, "LEVEL_2,F,100,FREE,10,yes,false,1:15:00"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].line).toBe(2);
    expect(rejected[0].reason).toMatch(/isCatchAllYoung/);
  });

  it("rejects wrong column counts and non-numeric distance/age", () => {
    const csv = [
      header,
      "LEVEL_2,F,100,FREE,10,true,false", // 7 cols
      "LEVEL_2,F,x,FREE,10,true,false,1:15:00", // distance NaN
      "LEVEL_2,F,100,FREE,ten,true,false,1:15:00", // age NaN
      "LEVEL_2,F,100,FREE,10,true,false,", // empty time
    ].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(rejected.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    expect(rejected[0].reason).toMatch(/8 columns/);
    expect(rejected[1].reason).toMatch(/distance/);
    expect(rejected[2].reason).toMatch(/age/);
    expect(rejected[3].reason).toMatch(/time/);
  });

  it("tracks the source line so server rejects map back correctly", () => {
    const csv = [
      header,
      "LEVEL_2,F,100,FREE,10,true,false,1:15:00",
      "", // blank — must not shift the line count
      "LEVEL_2,F,100,FREE,12,false,false,1:10:00",
    ].join("\n");
    const { rows } = parseStandardsCsv(csv);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });
});

// ---------------------------------------------------------------------------
// findAgeInversions (§5.8/§11a) — monotonicity WARNING, adjacent pairs
// ---------------------------------------------------------------------------

describe("findAgeInversions — younger cut faster than older", () => {
  const cut = (
    age: number,
    timeMs: number,
    flags: Partial<Pick<AgeCut, "isCatchAllYoung" | "isCatchAllOld">> = {},
  ): AgeCut => ({
    age,
    timeMs,
    isCatchAllYoung: flags.isCatchAllYoung ?? false,
    isCatchAllOld: flags.isCatchAllOld ?? false,
  });

  it("returns nothing for a healthy (faster with age) progression", () => {
    const cuts = [cut(12, 75000), cut(14, 70000), cut(16, 66000)];
    expect(findAgeInversions(cuts)).toEqual([]);
  });

  it("flags the exact adjacent pair where the younger is faster (the L2 case)", () => {
    // Age 15 (3:49) faster than 16 (3:51) — the one known real inversion.
    const cuts = [cut(14, 235000), cut(15, 229220), cut(16, 231220)];
    const inv = findAgeInversions(cuts);
    expect(inv).toHaveLength(1);
    expect(cuts[inv[0].youngerIdx].age).toBe(15);
    expect(cuts[inv[0].olderIdx].age).toBe(16);
  });

  it("orders catch-alls at their bound (young below, old above)", () => {
    // Unordered input; a 10&U slower than exact 12 is fine, but old catch-all
    // 17+ slower than 16 is an inversion.
    const young = cut(10, 80000, { isCatchAllYoung: true });
    const a12 = cut(12, 74000);
    const a16 = cut(16, 66000);
    const old = cut(17, 67000, { isCatchAllOld: true });
    const inv = findAgeInversions([old, a12, young, a16]);
    expect(inv).toHaveLength(1);
    // The flagged pair is (16, 17+).
    const pair = inv[0];
    const arr = [old, a12, young, a16];
    expect(arr[pair.youngerIdx].age).toBe(16);
    expect(arr[pair.olderIdx].isCatchAllOld).toBe(true);
  });

  it("treats equal adjacent times as a plateau, not an inversion", () => {
    expect(findAgeInversions([cut(12, 70000), cut(14, 70000)])).toEqual([]);
  });

  it("cutAgeOrder hugs the bound for catch-alls", () => {
    expect(cutAgeOrder({ age: 10, isCatchAllYoung: true, isCatchAllOld: false })).toBe(9.5);
    expect(cutAgeOrder({ age: 17, isCatchAllYoung: false, isCatchAllOld: true })).toBe(17.5);
    expect(cutAgeOrder({ age: 13, isCatchAllYoung: false, isCatchAllOld: false })).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// computeCalibratedRadius (Step 12.5, §4.9) — the stroke-profile radial metric
// ---------------------------------------------------------------------------

describe("computeCalibratedRadius", () => {
  // A representative full-coverage event (Girls 100 Free, age 14 in the sample):
  // SANJ 1:00.00 < L3 1:03.00 < L2 1:06.00.
  const full = { l2Ms: 66000, l3Ms: 63000, sanjMs: 60000 };

  it("returns null without a PB or without any cut", () => {
    expect(computeCalibratedRadius(null, full)).toBeNull();
    expect(
      computeCalibratedRadius(60000, { l2Ms: null, l3Ms: null, sanjMs: null }),
    ).toBeNull();
  });

  it("lands exactly on a ring when the PB equals that tier's cut", () => {
    expect(computeCalibratedRadius(66000, full)).toBeCloseTo(STROKE_RING_POS.LEVEL_2);
    expect(computeCalibratedRadius(63000, full)).toBeCloseTo(STROKE_RING_POS.LEVEL_3);
    expect(computeCalibratedRadius(60000, full)).toBeCloseTo(STROKE_RING_POS.SANJ);
  });

  it("crossing the SANJ ring == beating the SANJ cut (the headline invariant)", () => {
    // One hundredth under the SANJ cut sits just past the outer ring.
    expect(computeCalibratedRadius(59990, full)!).toBeGreaterThan(STROKE_RING_POS.SANJ);
    // One hundredth over sits just inside it.
    expect(computeCalibratedRadius(60010, full)!).toBeLessThan(STROKE_RING_POS.SANJ);
  });

  it("interpolates linearly between adjacent rings", () => {
    // Midway (ms) between L2 and L3 → midway (radius) between rings 1 and 2.
    expect(computeCalibratedRadius(64500, full)).toBeCloseTo(1.5);
    // Midway between L3 and SANJ → radius 2.5.
    expect(computeCalibratedRadius(61500, full)).toBeCloseTo(2.5);
  });

  it("extrapolates past the outer ring when faster than SANJ", () => {
    // 1s under SANJ, using the L3→SANJ slope (1 ring / 3000 ms): 2 + 4000/3000.
    expect(computeCalibratedRadius(59000, full)).toBeCloseTo(3 + 1 / 3);
  });

  it("caps the extrapolated radius at STROKE_RADIUS_MAX", () => {
    // An absurdly fast time can't run off the canvas.
    expect(computeCalibratedRadius(1000, full)).toBe(STROKE_RADIUS_MAX);
  });

  it("clamps to the centre when slower than the L2 (inner) cut", () => {
    expect(computeCalibratedRadius(90000, full)).toBe(0);
  });

  it("handles partial coverage with a gap between anchors (L2 + SANJ only)", () => {
    // 200 Fly-style: L2 and SANJ exist, no L3. The line still passes through
    // both rings, so the (absent) middle ring radius falls halfway in time.
    const cuts = { l2Ms: 66000, l3Ms: null, sanjMs: 60000 };
    expect(computeCalibratedRadius(66000, cuts)).toBeCloseTo(1); // L2 ring
    expect(computeCalibratedRadius(60000, cuts)).toBeCloseTo(3); // SANJ ring
    expect(computeCalibratedRadius(63000, cuts)).toBeCloseTo(2); // halfway → mid radius
  });

  it("places a single-anchor spoke by direction, exact at its own ring", () => {
    // 800 Free-style: SANJ only. At the cut the radius is exactly the SANJ ring…
    const cuts = { l2Ms: null, l3Ms: null, sanjMs: 600000 };
    expect(computeCalibratedRadius(600000, cuts)).toBeCloseTo(STROKE_RING_POS.SANJ);
    // …faster pushes outward, slower pulls inward.
    expect(computeCalibratedRadius(576000, cuts)!).toBeGreaterThan(STROKE_RING_POS.SANJ);
    expect(computeCalibratedRadius(624000, cuts)!).toBeLessThan(STROKE_RING_POS.SANJ);
  });
});

// ---------------------------------------------------------------------------
// Season improvement (BRD §5.12) — rolling window + per-event / overall drop
// ---------------------------------------------------------------------------

describe("rollingSeasonStart", () => {
  it("is exactly one year before today", () => {
    expect(rollingSeasonStart("2026-07-01")).toBe("2025-07-01");
    expect(rollingSeasonStart("2026-01-15")).toBe("2025-01-15");
  });

  it("normalises a leap day to Mar 1 of the prior year", () => {
    expect(rollingSeasonStart("2024-02-29")).toBe("2023-03-01");
  });

  it("throws on a non-ISO date", () => {
    expect(() => rollingSeasonStart("nope")).toThrow();
  });
});

describe("isInSeason", () => {
  it("is inclusive of the season start and rejects earlier dates", () => {
    expect(isInSeason("2025-07-01", "2025-07-01")).toBe(true);
    expect(isInSeason("2025-12-31", "2025-07-01")).toBe(true);
    expect(isInSeason("2025-06-30", "2025-07-01")).toBe(false);
  });
});

describe("computeSeasonImprovements", () => {
  const start = "2025-07-01";

  function swim(
    partial: Partial<SeasonSwim> & { timeMs: number; swimDate: string },
  ): SeasonSwim {
    return {
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      swimType: "MEET",
      ...partial,
    };
  }

  it("measures the drop from first in-season meet to fastest in-season meet", () => {
    const out = computeSeasonImprovements(
      [
        swim({ timeMs: 62000, swimDate: "2025-09-01" }), // baseline (earliest)
        swim({ timeMs: 60000, swimDate: "2025-11-01" }), // fastest
        swim({ timeMs: 61000, swimDate: "2025-12-01" }),
      ],
      start,
    );
    expect(out).toHaveLength(1);
    const e = out[0];
    expect(e.insufficient).toBe(false);
    expect(e.count).toBe(3);
    expect(e.firstMs).toBe(62000);
    expect(e.currentMs).toBe(60000);
    expect(e.improvedMs).toBe(2000);
    // 2000 / 62000 = 3.2258% → 3.23
    expect(e.improvedPct).toBeCloseTo(3.23, 2);
  });

  it("excludes practice/time-trial and pre-season swims", () => {
    const out = computeSeasonImprovements(
      [
        swim({ timeMs: 65000, swimDate: "2025-05-01" }), // pre-season → ignored
        swim({ timeMs: 61000, swimDate: "2025-08-01", swimType: "PRACTICE" }), // not MEET
        swim({ timeMs: 63000, swimDate: "2025-08-15", swimType: "TIME_TRIAL" }), // not MEET
        swim({ timeMs: 62000, swimDate: "2025-09-01" }), // only one qualifying MEET
      ],
      start,
    );
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].insufficient).toBe(true);
    expect(out[0].improvedMs).toBeNull();
    expect(out[0].improvedPct).toBeNull();
  });

  it("keeps SCM and LCM as separate events (never merged, §4.2)", () => {
    const out = computeSeasonImprovements(
      [
        swim({ course: "LCM", timeMs: 62000, swimDate: "2025-08-01" }),
        swim({ course: "LCM", timeMs: 60000, swimDate: "2025-10-01" }),
        swim({ course: "SCM", timeMs: 59000, swimDate: "2025-08-01" }),
        swim({ course: "SCM", timeMs: 58000, swimDate: "2025-10-01" }),
      ],
      start,
    );
    expect(out).toHaveLength(2);
    const lcm = out.find((e) => e.course === "LCM")!;
    const scm = out.find((e) => e.course === "SCM")!;
    expect(lcm.improvedMs).toBe(2000);
    expect(scm.improvedMs).toBe(1000);
  });

  it("reports a plateau (fastest is the first swim) as a real 0% drop, not insufficient", () => {
    const out = computeSeasonImprovements(
      [
        swim({ timeMs: 60000, swimDate: "2025-08-01" }), // fastest AND earliest
        swim({ timeMs: 61000, swimDate: "2025-10-01" }),
      ],
      start,
    );
    expect(out[0].insufficient).toBe(false);
    expect(out[0].improvedMs).toBe(0);
    expect(out[0].improvedPct).toBe(0);
  });
});

describe("computeOverallImprovement", () => {
  const start = "2025-07-01";

  function swim(
    distance: number,
    course: "SCM" | "LCM",
    timeMs: number,
    swimDate: string,
  ): SeasonSwim {
    return { distance, stroke: "FREE", course, timeMs, swimType: "MEET", swimDate };
  }

  it("averages % improvement across only the measurable events", () => {
    const perEvent = computeSeasonImprovements(
      [
        // 100 LCM: 62000 → 60000 = 3.2258% (measured)
        swim(100, "LCM", 62000, "2025-08-01"),
        swim(100, "LCM", 60000, "2025-10-01"),
        // 200 LCM: 130000 → 127400 = 2.0% (measured)
        swim(200, "LCM", 130000, "2025-08-01"),
        swim(200, "LCM", 127400, "2025-10-01"),
        // 400 LCM: single point → insufficient, excluded from the average
        swim(400, "LCM", 300000, "2025-09-01"),
      ],
      start,
    );
    const overall = computeOverallImprovement(perEvent);
    expect(overall.eventsInSeason).toBe(3);
    expect(overall.eventsMeasured).toBe(2);
    expect(overall.insufficient).toBe(false);
    // Each event's pct rounds to 2dp first (3.23, 2.0); mean = 2.615 → 2.62.
    expect(overall.avgImprovedPct).toBeCloseTo(2.62, 2);
    expect(overall.totalImprovedMs).toBe(2000 + 2600);
    expect(overall.best?.distance).toBe(100); // biggest %
  });

  it("is insufficient when every event has only one in-season meet", () => {
    const perEvent = computeSeasonImprovements(
      [swim(100, "LCM", 62000, "2025-08-01"), swim(200, "LCM", 130000, "2025-09-01")],
      start,
    );
    const overall = computeOverallImprovement(perEvent);
    expect(overall.eventsMeasured).toBe(0);
    expect(overall.insufficient).toBe(true);
    expect(overall.avgImprovedPct).toBeNull();
    expect(overall.best).toBeNull();
  });
});
