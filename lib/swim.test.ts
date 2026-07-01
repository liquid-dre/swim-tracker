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
  type EventDef,
  type ResultForPB,
} from "./swim";

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
