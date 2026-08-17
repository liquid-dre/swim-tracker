import { describe, it, expect } from "vitest";
import {
  parseTime,
  formatTime,
  clockFromDigits,
  computeAge,
  computeAgeGroup,
  recentBirthday,
  isValidEvent,
  computePersonalBests,
  eventLabel,
  eventSortKey,
  DEFAULT_AGE_BANDS,
  GALA_ORDER,
  galaCoversEvent,
  resolveStandardTime,
  pickApplicableStandards,
  pickApplicableStandardsPerGala,
  galaResolutionAges,
  highestGalaMet,
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
  linearFit,
  projectCrossing,
  computeQualifyProjection,
  worldRecordMs,
  authorizeResultWrite,
  type EventDef,
  type ResultForPB,
  type StandardCut,
  type GalaCode,
  type GalaRef,
  type RawStandardRow,
  type AgeCut,
  type SeasonSwim,
} from "./swim";
import { GALA_SEED, GALA_SEED_BY_CODE } from "./galas";
import { isGalaAgeEligible, resolveGalaCut } from "./swim";

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

describe("recentBirthday", () => {
  it("returns the birthday when it fell within the window", () => {
    expect(recentBirthday("2010-06-15", "2020-06-15")).toBe("2020-06-15"); // today
    expect(recentBirthday("2010-06-15", "2020-07-10")).toBe("2020-06-15"); // 25 days
    expect(recentBirthday("2010-06-15", "2020-07-15")).toBe("2020-06-15"); // 30 days exactly
  });

  it("returns null outside the window or before the birthday", () => {
    expect(recentBirthday("2010-06-15", "2020-07-16")).toBeNull(); // 31 days
    expect(recentBirthday("2010-06-15", "2020-06-14")).toBeNull(); // day before (last year's is far)
  });

  it("crosses the year boundary", () => {
    expect(recentBirthday("2010-12-28", "2021-01-05")).toBe("2020-12-28");
  });

  it("never reports the birth date itself", () => {
    expect(recentBirthday("2020-06-15", "2020-06-20")).toBeNull();
  });

  it("respects a custom window", () => {
    expect(recentBirthday("2010-06-15", "2020-06-25", 7)).toBeNull();
    expect(recentBirthday("2010-06-15", "2020-06-20", 7)).toBe("2020-06-15");
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
    { distance: 25, stroke: "FREE", allowedCourses: ["SCM"], active: true }, // SCM-only
    { distance: 25, stroke: "BACK", allowedCourses: ["SCM"], active: true },
    { distance: 25, stroke: "BREAST", allowedCourses: ["SCM"], active: true },
    { distance: 25, stroke: "FLY", allowedCourses: ["SCM"], active: true },
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
    expect(isValidEvent(25, "FREE", "SCM", events)).toBe(true); // 25 m sprint
    expect(isValidEvent(25, "FLY", "SCM", events)).toBe(true);
  });

  it("rejects events not on the whitelist", () => {
    expect(isValidEvent(50, "IM", "SCM", events)).toBe(false); // no 50 IM
    expect(isValidEvent(50, "IM", "LCM", events)).toBe(false);
    expect(isValidEvent(800, "FLY", "LCM", events)).toBe(false); // no 800 Fly
    expect(isValidEvent(400, "BACK", "LCM", events)).toBe(false); // 400 is Free/IM only
    expect(isValidEvent(25, "IM", "SCM", events)).toBe(false); // no 25 IM
  });

  it("rejects a valid event on a disallowed course", () => {
    expect(isValidEvent(100, "IM", "LCM", events)).toBe(false); // 100 IM is SCM-only
    expect(isValidEvent(25, "FREE", "LCM", events)).toBe(false); // 25 m is SCM-only
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

describe("worldRecordMs", () => {
  it("returns the gender-specific record for a listed event", () => {
    expect(worldRecordMs(100, "FREE", "LCM", "M")).toBe(46400);
    expect(worldRecordMs(100, "FREE", "LCM", "F")).toBe(51710);
  });

  it("returns the fastest (outright) record when no gender is given", () => {
    // Men's 100 free is faster than women's, so the outright is the men's mark.
    expect(worldRecordMs(100, "FREE", "LCM")).toBe(46400);
  });

  it("knows 100 IM is SCM-only and has no LCM record", () => {
    expect(worldRecordMs(100, "IM", "SCM", "M")).toBe(49280);
    expect(worldRecordMs(100, "IM", "LCM", "M")).toBeNull();
  });

  it("returns null for events off the record table", () => {
    expect(worldRecordMs(50, "IM", "LCM", "M")).toBeNull();
    expect(worldRecordMs(100, "FREE", "SCY" as never)).toBeNull();
  });
});

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

  it("headline PB carries the age at the meet where it was swum (§4.9)", () => {
    const pbs = computePersonalBests([
      // The fastest MEET was swum at 13; a later slower meet was swum at 14.
      { distance: 100, stroke: "BREAST", course: "LCM", timeMs: 80040, swimType: "MEET", swimDate: "2025-08-01", ageAtSwim: 13 },
      { distance: 100, stroke: "BREAST", course: "LCM", timeMs: 81000, swimType: "MEET", swimDate: "2026-06-01", ageAtSwim: 14 },
    ]);
    // The qualifying cut for this PB must be resolved against 13, not today's age.
    expect(pbs[0].headline?.ageAtSwim).toBe(13);
  });

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
      ageAtSwim: null,
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
      ageAtSwim: null,
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
      ageAtSwim: null,
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

  // §R15 — SCHOOL_GALA is UNOFFICIAL: it never sets a headline PB, never counts
  // as an overall best, never seeds an improvement baseline, and never appears
  // on the PB board at all (it lives only in progression + history).
  it("excludes SCHOOL_GALA from headline, overallBest and improvement", () => {
    const pbs = computePersonalBests([
      r(100, "FREE", "LCM", 55000, "SCHOOL_GALA", "2026-01-01", "School gala"), // fastest overall, but a gala
      r(100, "FREE", "LCM", 62000, "MEET", "2026-02-01", "Autumn Open"),
      r(100, "FREE", "LCM", 61000, "PRACTICE", "2026-03-01"),
    ]);
    expect(pbs).toHaveLength(1);
    // Headline is the meet time, never the faster gala.
    expect(pbs[0].headline?.timeMs).toBe(62000);
    // The gala (55000) is faster than the practice (61000) but must NOT be the
    // overall best — practice is the fastest OFFICIAL swim.
    expect(pbs[0].overallBest).toEqual({
      timeMs: 61000,
      swimDate: "2026-03-01",
      swimType: "PRACTICE",
    });
    // Improvement baseline is the earliest OFFICIAL swim (the meet), never the gala.
    expect(pbs[0].improvement?.fromMs).toBe(62000);
    expect(pbs[0].improvement?.fromSwimType).toBe("MEET");
  });

  it("never surfaces an event that has only SCHOOL_GALA times on the PB board", () => {
    const pbs = computePersonalBests([
      r(50, "FLY", "SCM", 33000, "SCHOOL_GALA", "2026-01-01", "School gala"),
      r(50, "FLY", "SCM", 34000, "SCHOOL_GALA", "2026-02-01", "School gala"),
    ]);
    // A gala-only event contributes no PB group at all.
    expect(pbs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Qualifying standards (BRD §4.9, Step 8) — five galas, both courses
// ---------------------------------------------------------------------------

describe("GALA_ORDER", () => {
  it("is hardest → easiest (§4.9)", () => {
    expect(GALA_ORDER).toEqual(["SANS", "SANY", "SANJ", "LEVEL_3", "LEVEL_2"]);
  });
});

describe("galaCoversEvent (§4.9 coverage is a hard rule, and it is DATA)", () => {
  // Coverage now lives on the gala row, so these read from the seeded
  // definitions rather than a hardcoded switch — a new meet needs no code change.
  const g = (code: GalaCode) => GALA_SEED_BY_CODE[code];

  it("50 m is LEVEL_2 only among the age-graded galas — never L3/SANJ", () => {
    expect(galaCoversEvent(g("LEVEL_2"), 50, "FREE")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_3"), 50, "FREE")).toBe(false);
    expect(galaCoversEvent(g("SANJ"), 50, "FREE")).toBe(false);
  });

  it("the OPEN galas do cover 50 m (unlike the age-graded ladder)", () => {
    expect(galaCoversEvent(g("SANS"), 50, "FREE")).toBe(true);
    expect(galaCoversEvent(g("SANY"), 50, "FREE")).toBe(true);
  });

  it("25 m sprints have no qualifying cut at any gala", () => {
    for (const code of GALA_ORDER) {
      expect(galaCoversEvent(g(code), 25, "FREE"), code).toBe(false);
    }
  });

  it("100 IM has no cut at any gala (it is a real SCM event, but uncut)", () => {
    for (const code of GALA_ORDER) {
      expect(galaCoversEvent(g(code), 100, "IM"), code).toBe(false);
    }
  });

  it("LEVEL_2 tops out at 200 m (+ 200 IM); nothing longer, and no 200 Fly", () => {
    expect(galaCoversEvent(g("LEVEL_2"), 200, "FREE")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_2"), 200, "IM")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_2"), 200, "FLY")).toBe(false);
    expect(galaCoversEvent(g("LEVEL_2"), 400, "FREE")).toBe(false);
    expect(galaCoversEvent(g("LEVEL_2"), 800, "FREE")).toBe(false);
    expect(galaCoversEvent(g("LEVEL_2"), 1500, "FREE")).toBe(false);
  });

  it("LEVEL_3 is 100/200/400 + 200 IM; no 800/1500, no 200 Fly, no 400 IM", () => {
    expect(galaCoversEvent(g("LEVEL_3"), 100, "FREE")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_3"), 400, "FREE")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_3"), 200, "IM")).toBe(true);
    expect(galaCoversEvent(g("LEVEL_3"), 200, "FLY")).toBe(false); // no 200 Fly
    expect(galaCoversEvent(g("LEVEL_3"), 400, "IM")).toBe(false); // no 400 IM
    expect(galaCoversEvent(g("LEVEL_3"), 800, "FREE")).toBe(false);
  });

  it("SANJ covers 100→1500 Free, all strokes' 100/200, 400 Free/IM, 200 IM; no 50s", () => {
    expect(galaCoversEvent(g("SANJ"), 800, "FREE")).toBe(true);
    expect(galaCoversEvent(g("SANJ"), 1500, "FREE")).toBe(true);
    expect(galaCoversEvent(g("SANJ"), 200, "FLY")).toBe(true);
    expect(galaCoversEvent(g("SANJ"), 400, "IM")).toBe(true);
    expect(galaCoversEvent(g("SANJ"), 400, "BACK")).toBe(false);
    expect(galaCoversEvent(g("SANJ"), 50, "FREE")).toBe(false);
  });
});

describe("isGalaAgeEligible — the entry window is a separate gate", () => {
  it("treats both bounds as inclusive, and an absent bound as unbounded", () => {
    expect(isGalaAgeEligible({ minAge: 15, maxAge: null }, 14)).toBe(false);
    expect(isGalaAgeEligible({ minAge: 15, maxAge: null }, 15)).toBe(true);
    expect(isGalaAgeEligible({ minAge: 15, maxAge: null }, 99)).toBe(true);
    expect(isGalaAgeEligible({ minAge: 17, maxAge: 25 }, 16)).toBe(false);
    expect(isGalaAgeEligible({ minAge: 17, maxAge: 25 }, 25)).toBe(true);
    expect(isGalaAgeEligible({ minAge: 17, maxAge: 25 }, 26)).toBe(false);
    expect(isGalaAgeEligible({}, 8)).toBe(true);
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

  it("resolves an OPEN row (no age) at any age", () => {
    // SANS/SANY publish a single cut with no age column at all.
    const open: StandardCut[] = [
      { isCatchAllYoung: false, isCatchAllOld: false, timeMs: 57000 },
    ];
    for (const age of [8, 15, 17, 25, 60]) {
      expect(resolveStandardTime(open, age)).toBe(57000);
    }
  });

  it("prefers an exact age, then a catch-all, then an open row", () => {
    // A contrived mix — real data never blends the two shapes on one gala, but
    // the precedence must be unambiguous if it ever did.
    const mixed: StandardCut[] = [
      { isCatchAllYoung: false, isCatchAllOld: false, timeMs: 70000 }, // open
      { age: 10, isCatchAllYoung: true, isCatchAllOld: false, timeMs: 66000 },
      { age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
    ];
    expect(resolveStandardTime(mixed, 14)).toBe(60000); // exact wins
    expect(resolveStandardTime(mixed, 9)).toBe(66000); // catch-all beats open
    expect(resolveStandardTime(mixed, 12)).toBe(70000); // nothing else → open
  });
});

describe("resolveGalaCut — eligibility gates resolution", () => {
  const cuts: StandardCut[] = [
    { isCatchAllYoung: false, isCatchAllOld: false, timeMs: 57000 },
  ];

  it("returns null outside the entry window even when a row exists", () => {
    const sany: GalaRef = { code: "SANY", minAge: 17, maxAge: 25 };
    expect(resolveGalaCut(sany, cuts, 16)).toBeNull();
    expect(resolveGalaCut(sany, cuts, 17)).toBe(57000);
    expect(resolveGalaCut(sany, cuts, 26)).toBeNull();
  });
});

describe("sparse coverage → null (§4.9)", () => {
  it("50 Free SANJ and 400 Free LEVEL_2 have no coverage", () => {
    expect(galaCoversEvent(GALA_SEED_BY_CODE.SANJ, 50, "FREE")).toBe(false);
    expect(galaCoversEvent(GALA_SEED_BY_CODE.LEVEL_2, 400, "FREE")).toBe(false);
    // With no rows for an uncovered gala, resolution is null (never interpolated).
    expect(resolveStandardTime([], 14)).toBeNull();
  });
});

// Galas with no age window, for the pure-resolution tests below.
const OPEN_REFS: GalaRef[] = GALA_ORDER.map((code) => ({ code }));

describe("pickApplicableStandards (§4.9) — omits galas with no cut", () => {
  it("returns only the galas that resolve at the exact age", () => {
    const rows: Array<StandardCut & { gala: GalaCode }> = [
      { gala: "LEVEL_2", age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 66000 },
      { gala: "SANJ", age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
      // No LEVEL_3 row → LEVEL_3 must be absent from the result.
    ];
    expect(pickApplicableStandards(rows, OPEN_REFS, 14)).toEqual({
      SANJ: 60000,
      LEVEL_2: 66000,
    });
  });

  it("is empty when nothing resolves at the age", () => {
    const rows: Array<StandardCut & { gala: GalaCode }> = [
      { gala: "SANJ", age: 12, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
    ];
    expect(pickApplicableStandards(rows, OPEN_REFS, 15)).toEqual({});
  });

  it("omits a gala the swimmer is too young or too old to enter", () => {
    const rows: Array<StandardCut & { gala: GalaCode }> = [
      { gala: "SANS", isCatchAllYoung: false, isCatchAllOld: false, timeMs: 55000 },
      { gala: "SANY", isCatchAllYoung: false, isCatchAllOld: false, timeMs: 62000 },
    ];
    const refs: GalaRef[] = [
      { code: "SANS", minAge: 15 },
      { code: "SANY", minAge: 17, maxAge: 25 },
    ];
    expect(pickApplicableStandards(rows, refs, 14)).toEqual({});
    expect(pickApplicableStandards(rows, refs, 16)).toEqual({ SANS: 55000 });
    expect(pickApplicableStandards(rows, refs, 20)).toEqual({
      SANS: 55000,
      SANY: 62000,
    });
    expect(pickApplicableStandards(rows, refs, 30)).toEqual({ SANS: 55000 });
  });
});

describe("galaResolutionAges (the birthday rule, per tour)", () => {
  // Born 15 June 2012: 13 today (1 May 2026), turns 14 on 15 June 2026.
  const dob = "2012-06-15";
  const refs = (tours: Partial<Record<GalaCode, string>>): GalaRef[] =>
    GALA_ORDER.map((code) => ({ code, tourDate: tours[code] ?? null }));
  const allAges = (age: number) =>
    Object.fromEntries(GALA_ORDER.map((c) => [c, age]));

  it("uses the fallback age everywhere when no tour dates exist", () => {
    expect(galaResolutionAges(dob, 13, refs({}))).toEqual(allAges(13));
  });

  it("judges a gala with a tour date at the age ON TOUR DAY", () => {
    // The SANJ tour falls after the birthday; the others have no date.
    expect(galaResolutionAges(dob, 13, refs({ SANJ: "2026-07-01" }))).toEqual({
      ...allAges(13),
      SANJ: 14,
    });
  });

  it("handles different tours on either side of the birthday", () => {
    expect(
      galaResolutionAges(
        dob,
        13,
        refs({ SANJ: "2026-07-01", LEVEL_2: "2026-06-01" }),
      ),
    ).toEqual({ ...allAges(13), SANJ: 14, LEVEL_2: 13 });
  });
});

describe("pickApplicableStandardsPerGala — each gala at its own age", () => {
  const rows: Array<StandardCut & { gala: GalaCode }> = [
    { gala: "SANJ", age: 13, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 60000 },
    { gala: "SANJ", age: 14, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 59000 },
    { gala: "LEVEL_2", age: 13, isCatchAllYoung: false, isCatchAllOld: false, timeMs: 66000 },
  ];
  const ages = (over: Partial<Record<GalaCode, number>>, base = 13) =>
    Object.fromEntries(
      GALA_ORDER.map((c) => [c, over[c] ?? base]),
    ) as Record<GalaCode, number>;

  it("resolves each gala at its own age", () => {
    const out = pickApplicableStandardsPerGala(
      rows,
      OPEN_REFS,
      ages({ SANJ: 14 }), // aged up by SANJ tour day → the harder 14 cut
    );
    expect(out).toEqual({ SANJ: 59000, LEVEL_2: 66000 }); // no L3 rows → omitted
  });

  it("matches pickApplicableStandards when every gala shares one age", () => {
    expect(pickApplicableStandardsPerGala(rows, OPEN_REFS, ages({}))).toEqual(
      pickApplicableStandards(rows, OPEN_REFS, 13),
    );
  });

  it("omits a gala whose own age has no cut", () => {
    // SANJ has no 15 cut → absent even though 13/14 rows exist.
    expect(
      pickApplicableStandardsPerGala(rows, OPEN_REFS, ages({ SANJ: 15, LEVEL_3: 15 })),
    ).toEqual({ LEVEL_2: 66000 });
  });
});

describe("highestGalaMet (§4.9 order) — hardest first, either course", () => {
  const lcm = { SANJ: 58000, LEVEL_3: 60000, LEVEL_2: 63000 };
  const both = { LCM: lcm, SCM: {} };

  it("returns the hardest gala the PB meets", () => {
    expect(highestGalaMet({ LCM: 57000 }, both)?.gala).toBe("SANJ");
    expect(highestGalaMet({ LCM: 59000 }, both)?.gala).toBe("LEVEL_3");
    expect(highestGalaMet({ LCM: 61000 }, both)?.gala).toBe("LEVEL_2");
    expect(highestGalaMet({ LCM: 64000 }, both)).toBeNull(); // slower than all
  });

  it("treats equal-to-cut as met", () => {
    expect(highestGalaMet({ LCM: 58000 }, both)?.gala).toBe("SANJ");
    expect(highestGalaMet({ LCM: 63000 }, both)?.gala).toBe("LEVEL_2");
  });

  it("skips galas with no cut", () => {
    expect(
      highestGalaMet({ LCM: 61000 }, { LCM: { LEVEL_2: 63000 }, SCM: {} })?.gala,
    ).toBe("LEVEL_2");
    // SANJ not met, LEVEL_3 absent → falls through to LEVEL_2.
    expect(
      highestGalaMet(
        { LCM: 59000 },
        { LCM: { SANJ: 58000, LEVEL_2: 63000 }, SCM: {} },
      )?.gala,
    ).toBe("LEVEL_2");
    expect(highestGalaMet({ LCM: 59000 }, { LCM: {}, SCM: {} })).toBeNull();
  });

  it("NEVER measures a PB against the other course's cut (§4.2)", () => {
    // A blistering short-course time must not qualify on the long-course cut.
    expect(
      highestGalaMet({ SCM: 50000 }, { LCM: lcm, SCM: {} }, "BEST"),
    ).toBeNull();
  });

  it("qualifies on EITHER course, and names the course that did it", () => {
    const cuts = { LCM: { SANJ: 58000 }, SCM: { SANJ: 56000 } };
    // Only the short-course PB clears its own cut.
    expect(highestGalaMet({ LCM: 59000, SCM: 55000 }, cuts, "BEST")).toEqual({
      gala: "SANJ",
      course: "SCM",
    });
    // Only the long-course PB clears its own cut.
    expect(highestGalaMet({ LCM: 57000, SCM: 57000 }, cuts, "BEST")).toEqual({
      gala: "SANJ",
      course: "LCM",
    });
  });

  it("reports the course with the BIGGER margin when both qualify", () => {
    const cuts = { LCM: { SANJ: 58000 }, SCM: { SANJ: 56000 } };
    // LCM margin 3s, SCM margin 1s → LCM is the stronger swim.
    expect(highestGalaMet({ LCM: 55000, SCM: 55000 }, cuts, "BEST")).toEqual({
      gala: "SANJ",
      course: "LCM",
    });
  });

  it("isolates one course when asked", () => {
    const cuts = { LCM: { SANJ: 58000 }, SCM: { SANJ: 56000 } };
    // The SCM PB qualifies, but an LCM-only read must ignore it.
    expect(highestGalaMet({ LCM: 59000, SCM: 55000 }, cuts, "LCM")).toBeNull();
    expect(highestGalaMet({ LCM: 59000, SCM: 55000 }, cuts, "SCM")?.course).toBe(
      "SCM",
    );
  });
});

describe("computeMatrixCell (§5.7) — highest gala met + gap to next up", () => {
  const lcm = { SANJ: 58000, LEVEL_3: 60000, LEVEL_2: 63000 };
  const cuts = { LCM: lcm, SCM: {} };
  const empty = { LCM: {}, SCM: {} };
  const BLANK = {
    hasCut: false,
    gala: null,
    galaCourse: null,
    nextGala: null,
    gapMs: null,
    gapCourse: null,
  };

  it("is blank/neutral when no gala has a cut", () => {
    expect(computeMatrixCell({ LCM: 60000 }, empty)).toEqual(BLANK);
  });

  it("has a cut but no gala/gap when there is no PB yet (target = easiest)", () => {
    expect(computeMatrixCell({}, cuts)).toEqual({
      ...BLANK,
      hasCut: true,
      nextGala: "LEVEL_2",
    });
  });

  it("none met → target the easiest gala, gap = PB − its cut", () => {
    // 64000 is slower than every cut; next up is L2.
    expect(computeMatrixCell({ LCM: 64000 }, cuts)).toEqual({
      hasCut: true,
      gala: null,
      galaCourse: null,
      nextGala: "LEVEL_2",
      gapMs: 1000,
      gapCourse: "LCM",
    });
  });

  it("met L2 → next up is L3, gap = PB − L3 cut", () => {
    expect(computeMatrixCell({ LCM: 61000 }, cuts)).toEqual({
      hasCut: true,
      gala: "LEVEL_2",
      galaCourse: "LCM",
      nextGala: "LEVEL_3",
      gapMs: 1000, // 61000 − 60000
      gapCourse: "LCM",
    });
  });

  it("met the hardest available gala → no next up, no gap", () => {
    expect(computeMatrixCell({ LCM: 57000 }, cuts)).toEqual({
      hasCut: true,
      gala: "SANJ",
      galaCourse: "LCM",
      nextGala: null,
      gapMs: null,
      gapCourse: null,
    });
    // equal-to-cut counts as met.
    expect(computeMatrixCell({ LCM: 58000 }, cuts).gala).toBe("SANJ");
  });

  it("walks only the galas that have a cut (sparse coverage, §4.9)", () => {
    // 50 m has no age-graded cut above L2 — meeting L2 tops out.
    expect(
      computeMatrixCell({ LCM: 30000 }, { LCM: { LEVEL_2: 31000 }, SCM: {} }),
    ).toMatchObject({ hasCut: true, gala: "LEVEL_2", nextGala: null, gapMs: null });
    // Distance event: SANJ-only. Not met → gap to SANJ.
    expect(
      computeMatrixCell({ LCM: 970000 }, { LCM: { SANJ: 950000 }, SCM: {} }),
    ).toMatchObject({ gala: null, nextGala: "SANJ", gapMs: 20000 });
    // L2 met but next-up SANJ (no L3 cut here) → the gap skips the absent gala.
    expect(
      computeMatrixCell({ LCM: 61000 }, { LCM: { SANJ: 58000, LEVEL_2: 63000 }, SCM: {} }),
    ).toMatchObject({ gala: "LEVEL_2", nextGala: "SANJ", gapMs: 3000 });
  });

  // ---- the both-course rule (§4.2) ---------------------------------------

  it("counts a gala as met when EITHER course clears its own cut", () => {
    const both = { LCM: { SANJ: 58000 }, SCM: { SANJ: 56000 } };
    // Long course misses, short course clears → still qualified, marked SCM.
    expect(computeMatrixCell({ LCM: 59000, SCM: 55000 }, both, "BEST")).toMatchObject({
      hasCut: true,
      gala: "SANJ",
      galaCourse: "SCM",
    });
  });

  it("measures the gap in the course the swimmer is CLOSEST in", () => {
    const both = {
      LCM: { SANJ: 58000, LEVEL_2: 63000 },
      SCM: { SANJ: 56000, LEVEL_2: 61000 },
    };
    // L2 met in both; chasing SANJ. LCM shortfall 2s, SCM shortfall 4s → LCM.
    expect(computeMatrixCell({ LCM: 60000, SCM: 60000 }, both, "BEST")).toMatchObject({
      gala: "LEVEL_2",
      nextGala: "SANJ",
      gapMs: 2000,
      gapCourse: "LCM",
    });
  });

  it("ignores the other course entirely in a single-course mode", () => {
    const both = { LCM: { SANJ: 58000 }, SCM: { SANJ: 56000 } };
    // The SCM PB would qualify, but an LCM grid must not show it.
    expect(computeMatrixCell({ LCM: 59000, SCM: 55000 }, both, "LCM")).toMatchObject({
      gala: null,
      nextGala: "SANJ",
      gapMs: 1000,
      gapCourse: "LCM",
    });
  });

  it("has a cut but no measurable gap when the PB is in the other course only", () => {
    // A short-course-only swimmer on a grid that only has long-course cuts:
    // the cut exists, but nothing of theirs can be measured against it.
    expect(
      computeMatrixCell({ SCM: 55000 }, { LCM: { SANJ: 58000 }, SCM: {} }, "BEST"),
    ).toMatchObject({ hasCut: true, gala: null, nextGala: "SANJ", gapMs: null });
  });
});

describe("prepareStandardImport (§4.4/§4.9) — rejects + reports, never drops", () => {
  // A minimal whitelist: 100 IM is SCM-only, 50 IM does not exist.
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

  // Coverage + age scope come from the gala rows, exactly as Convex supplies them.
  const galas = GALA_SEED.map((g) => ({
    code: g.code,
    ageScope: g.ageScope,
    coveredEvents: g.coveredEvents,
  }));

  const good = (over: Partial<RawStandardRow> = {}): RawStandardRow => ({
    gala: "LEVEL_2",
    course: "LCM",
    gender: "F",
    distance: 100,
    stroke: "FREE",
    age: 14,
    isCatchAllYoung: false,
    isCatchAllOld: false,
    time: "1:06:00",
    ...over,
  });
  const run = (rows: RawStandardRow[]) =>
    prepareStandardImport(rows, events, galas);

  it("accepts a good row and reports a bad (unparseable) one — keeping the row", () => {
    const rows: RawStandardRow[] = [good(), good({ time: "not-a-time" })];
    const { accepted, rejected } = run(rows);

    expect(accepted).toHaveLength(1);
    expect(accepted[0].timeMs).toBe(66000);
    expect(accepted[0].course).toBe("LCM");

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
    const { accepted, rejected } = run(rows);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => /valid LCM event/.test(r.reason))).toBe(true);
  });

  it("rejects coverage violations (SANJ 50 Free, LEVEL_2 400 Free)", () => {
    const rows: RawStandardRow[] = [
      good({ gala: "SANJ", distance: 50, stroke: "FREE", age: 13 }),
      good({ gala: "LEVEL_2", distance: 400, stroke: "FREE" }),
    ];
    const { accepted, rejected } = run(rows);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => /no coverage/.test(r.reason))).toBe(true);
  });

  it("rejects off-enum fields and impossible catch-all flags", () => {
    const rows: RawStandardRow[] = [
      good({ gala: "LEVEL_9" }),
      good({ course: "MYSTERY" }),
      good({ gender: "X" }),
      good({ age: 0 }),
      good({ isCatchAllYoung: true, isCatchAllOld: true }),
    ];
    const { accepted, rejected } = run(rows);
    expect(accepted).toHaveLength(0);
    expect(rejected.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("parses catch-all rows to the right ms and flags", () => {
    const rows: RawStandardRow[] = [
      good({ age: 10, isCatchAllYoung: true, time: "1:15:00" }),
      good({ age: 16, isCatchAllOld: true, time: "1:03:00" }),
    ];
    const { accepted, rejected } = run(rows);
    expect(rejected).toHaveLength(0);
    expect(accepted[0]).toMatchObject({ age: 10, isCatchAllYoung: true, timeMs: 75000 });
    expect(accepted[1]).toMatchObject({ age: 16, isCatchAllOld: true, timeMs: 63000 });
  });

  it("takes the same event in BOTH courses as two distinct cuts", () => {
    const rows: RawStandardRow[] = [
      good({ course: "LCM", time: "1:06:00" }),
      good({ course: "SCM", time: "1:04:00" }),
    ];
    const { accepted, rejected } = run(rows);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(2);
    expect(accepted.map((c) => [c.course, c.timeMs])).toEqual([
      ["LCM", 66000],
      ["SCM", 64000],
    ]);
  });

  // ---- age scope must match the gala's shape ------------------------------

  it("rejects an age on an OPEN gala, and a missing age on an age-graded one", () => {
    const withAge = good({ gala: "SANS", age: 20, distance: 100, stroke: "FREE" });
    const withoutAge = good({ gala: "LEVEL_2", age: null });
    const { accepted, rejected } = run([withAge, withoutAge]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/open gala/);
    expect(rejected[1].reason).toMatch(/age-graded/);
  });

  it("accepts an OPEN gala row with no age at all", () => {
    const { accepted, rejected } = run([
      good({ gala: "SANS", age: null, time: "59:84" }),
    ]);
    expect(rejected).toEqual([]);
    expect(accepted[0].age).toBeUndefined();
    expect(accepted[0].gala).toBe("SANS");
  });

  it("rejects an open standard flagged as a catch-all", () => {
    const { accepted, rejected } = run([
      good({ gala: "SANS", age: null, isCatchAllYoung: true }),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/open standard cannot be a catch-all/);
  });
});

// ---------------------------------------------------------------------------
// parseStandardsCsv (§5.8) — coerce strings; the "false"-is-truthy trap
// ---------------------------------------------------------------------------

describe("parseStandardsCsv — type coercion + rejects", () => {
  const header =
    "gala,course,gender,distance,stroke,age,isCatchAllYoung,isCatchAllOld,time";

  it("skips the header and coerces numbers + REAL booleans", () => {
    const csv = [header, "LEVEL_2,LCM,F,100,FREE,14,false,false,1:06:00"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toEqual({
      gala: "LEVEL_2",
      course: "LCM",
      gender: "F",
      distance: 100,
      stroke: "FREE",
      age: 14,
      isCatchAllYoung: false,
      isCatchAllOld: false,
      time: "1:06:00",
    });
    // The trap: the STRING "false" is truthy in JS. These must be real booleans.
    expect(rows[0].row.isCatchAllYoung).toBe(false);
    expect(typeof rows[0].row.isCatchAllYoung).toBe("boolean");
    expect(typeof rows[0].row.distance).toBe("number");
  });

  it("reads a BLANK age as an open standard, not as an error", () => {
    const csv = [header, "SANS,LCM,F,100,FREE,,false,false,59:84"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows[0].row.age).toBeNull();
  });

  it("rejects a non-blank, non-integer age", () => {
    const csv = [header, "LEVEL_2,LCM,F,100,FREE,thirteen,false,false,1:06:00"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/age "thirteen" is not a whole number/);
  });

  it("rejects a row with the wrong column count, naming the line", () => {
    const csv = [header, "LEVEL_2,LCM,F,100,FREE,14,false,false"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rows).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].line).toBe(2);
    expect(rejected[0].reason).toMatch(/expected 9 columns, got 8/);
  });

  it("rejects a non-boolean catch-all flag rather than coercing it", () => {
    const csv = [header, "LEVEL_2,LCM,F,100,FREE,14,yes,false,1:06:00"].join("\n");
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/isCatchAllYoung "yes" must be true or false/);
  });

  it("ignores blank lines and keeps 1-based source line numbers", () => {
    const csv = [
      header,
      "LEVEL_2,LCM,F,100,FREE,14,false,false,1:06:00",
      "",
      "LEVEL_2,LCM,F,100,FREE,15,false,false,1:05:00",
    ].join("\n");
    const { rows } = parseStandardsCsv(csv);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("works without a header row at all", () => {
    const csv = "LEVEL_2,LCM,F,100,FREE,14,false,false,1:06:00";
    const { rows, rejected } = parseStandardsCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

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

  it("flags the exact adjacent pair where the younger is faster", () => {
    // The shape of the real 2027 case (SANJ women 100 Back, 12&U then 13).
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

  it("skips OPEN standards — a single ageless cut cannot be inverted", () => {
    const open: AgeCut[] = [
      { isCatchAllYoung: false, isCatchAllOld: false, timeMs: 57000 },
    ];
    expect(findAgeInversions(open)).toEqual([]);
    // Mixed in with age rows, the ageless one is simply ignored.
    expect(
      findAgeInversions([...open, cut(12, 75000), cut(14, 70000)]),
    ).toEqual([]);
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

  it("caps a within-band PB at the ring of the tier actually met", () => {
    // Bar length reads as "tier achieved", never "tier nearly achieved": a PB
    // between the L2 and L3 cuts has met L2 only, so it sits exactly on the L2
    // ring — it does NOT creep toward the (unmet) L3 ring.
    expect(computeCalibratedRadius(64500, full)).toBeCloseTo(STROKE_RING_POS.LEVEL_2);
    // Between L3 and SANJ: met L3, not SANJ → parks on the L3 ring, however
    // close to the SANJ cut it lands (the reported 100 Breast bug).
    expect(computeCalibratedRadius(61500, full)).toBeCloseTo(STROKE_RING_POS.LEVEL_3);
    // A hair short of SANJ still caps at L3, never grazing the SANJ ring.
    expect(computeCalibratedRadius(60010, full)!).toBeCloseTo(STROKE_RING_POS.LEVEL_3);
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
    // 200 Fly-style: L2 and SANJ exist, no L3. At each cut the bar lands on that
    // ring; a PB between them has met L2 but not SANJ, so it caps on the L2 ring
    // rather than drifting up into the SANJ gap.
    const cuts = { l2Ms: 66000, l3Ms: null, sanjMs: 60000 };
    expect(computeCalibratedRadius(66000, cuts)).toBeCloseTo(1); // L2 ring
    expect(computeCalibratedRadius(60000, cuts)).toBeCloseTo(3); // SANJ ring
    expect(computeCalibratedRadius(63000, cuts)).toBeCloseTo(1); // met L2 only → L2 ring
  });

  it("places a single-anchor spoke by direction, exact at its own ring", () => {
    // 800 Free-style: SANJ only. At the cut the radius is exactly the SANJ ring…
    const cuts = { l2Ms: null, l3Ms: null, sanjMs: 600000 };
    expect(computeCalibratedRadius(600000, cuts)).toBeCloseTo(STROKE_RING_POS.SANJ);
    // …faster pushes outward, slower pulls inward.
    expect(computeCalibratedRadius(576000, cuts)!).toBeGreaterThan(STROKE_RING_POS.SANJ);
    expect(computeCalibratedRadius(624000, cuts)!).toBeLessThan(STROKE_RING_POS.SANJ);
  });

  it("caps a below-SANJ top tier at its own ring (50s have only L2)", () => {
    // A 50 has only an L2 cut (no L3/SANJ, §4.9). At the cut the bar sits on the
    // L2 ring, and a FASTER PB must not overshoot past it toward the (absent)
    // SANJ ring — it caps exactly on L2 rather than extrapolating outward.
    const cuts = { l2Ms: 26000, l3Ms: null, sanjMs: null };
    expect(computeCalibratedRadius(26000, cuts)).toBeCloseTo(STROKE_RING_POS.LEVEL_2);
    expect(computeCalibratedRadius(24000, cuts)).toBe(STROKE_RING_POS.LEVEL_2);
    // Slower than L2 still pulls inward toward the centre (a real gap to show).
    expect(computeCalibratedRadius(27000, cuts)!).toBeLessThan(STROKE_RING_POS.LEVEL_2);
  });

  it("caps an L2+L3 (no SANJ) event at the L3 ring", () => {
    // If an event's coverage stops at L3, a PB beating L3 caps on the L3 ring
    // rather than shooting past into the empty SANJ zone.
    const cuts = { l2Ms: 66000, l3Ms: 63000, sanjMs: null };
    expect(computeCalibratedRadius(63000, cuts)).toBeCloseTo(STROKE_RING_POS.LEVEL_3);
    expect(computeCalibratedRadius(50000, cuts)).toBe(STROKE_RING_POS.LEVEL_3);
  });

  it("never draws an unmet SANJ spoke for a near-SANJ PB (regression: 100 Breast)", () => {
    // The reported bug: a 15yo 100 Breast PB of 1:14.41 (74410 ms) beats the L3
    // cut 1:21.58 (81580) but is 0.57s SLOWER than the SANJ cut 1:13.84 (73840).
    // The old piecewise line put the spoke at ~2.93 — visually grazing the SANJ
    // ring — which read as "qualified for SANJ". It must cap on the L3 ring.
    const cuts = { l2Ms: 91250, l3Ms: 81580, sanjMs: 73840 };
    const r = computeCalibratedRadius(74410, cuts)!;
    expect(r).toBeCloseTo(STROKE_RING_POS.LEVEL_3);
    expect(r).toBeLessThan(STROKE_RING_POS.SANJ);
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

  it("excludes practice/time-trial/school-gala and pre-season swims", () => {
    const out = computeSeasonImprovements(
      [
        swim({ timeMs: 65000, swimDate: "2025-05-01" }), // pre-season → ignored
        swim({ timeMs: 61000, swimDate: "2025-08-01", swimType: "PRACTICE" }), // not MEET
        swim({ timeMs: 63000, swimDate: "2025-08-15", swimType: "TIME_TRIAL" }), // not MEET
        swim({ timeMs: 55000, swimDate: "2025-08-20", swimType: "SCHOOL_GALA" }), // unofficial (§R15)
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

// ---------------------------------------------------------------------------
// linearFit (BRD §5.6, Step 14) — least-squares with a downward-trend guard
// ---------------------------------------------------------------------------

describe("linearFit", () => {
  it("fits a clean downward line", () => {
    const fit = linearFit([
      { x: 0, y: 100 },
      { x: 1, y: 90 },
      { x: 2, y: 80 },
      { x: 3, y: 70 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(-10, 10);
    expect(fit!.intercept).toBeCloseTo(100, 10);
  });

  it("fits a noisy but overall-downward line (least squares)", () => {
    // Not perfectly linear, but the trend is clearly improving.
    const fit = linearFit([
      { x: 0, y: 100 },
      { x: 1, y: 95 },
      { x: 2, y: 88 },
      { x: 3, y: 71 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeLessThan(0);
  });

  it("returns null with fewer than 4 points", () => {
    expect(
      linearFit([
        { x: 0, y: 100 },
        { x: 1, y: 90 },
        { x: 2, y: 80 },
      ]),
    ).toBeNull();
  });

  it("returns null for a flat trend (no improvement)", () => {
    expect(
      linearFit([
        { x: 0, y: 50 },
        { x: 1, y: 50 },
        { x: 2, y: 50 },
        { x: 3, y: 50 },
      ]),
    ).toBeNull();
  });

  it("returns null for a rising trend (getting slower)", () => {
    expect(
      linearFit([
        { x: 0, y: 70 },
        { x: 1, y: 80 },
        { x: 2, y: 90 },
        { x: 3, y: 100 },
      ]),
    ).toBeNull();
  });

  it("returns null when every point shares one date (no x spread)", () => {
    expect(
      linearFit([
        { x: 5, y: 100 },
        { x: 5, y: 90 },
        { x: 5, y: 80 },
        { x: 5, y: 70 },
      ]),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projectCrossing (BRD §5.6, Step 14)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

describe("projectCrossing", () => {
  it("finds where a downward line meets the target", () => {
    // y = -10x + 100 reaches 50 at x = 5 → day 5 since the epoch.
    const date = projectCrossing({ slope: -10, intercept: 100 }, 50);
    expect(date).not.toBeNull();
    expect(date!.getTime()).toBe(5 * MS_PER_DAY);
    expect(date!.toISOString().slice(0, 10)).toBe("1970-01-06");
  });

  it("returns null for a rising line (never crosses downward)", () => {
    expect(projectCrossing({ slope: 10, intercept: 0 }, 50)).toBeNull();
  });

  it("returns null for a flat line (slope 0)", () => {
    expect(projectCrossing({ slope: 0, intercept: 100 }, 50)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeQualifyProjection (BRD §5.6, Step 14) — the guarded overlay
// ---------------------------------------------------------------------------

describe("computeQualifyProjection", () => {
  const today = "2026-04-15";

  // Four meets improving 1000ms per month.
  const improving = [
    { swimDate: "2026-01-01", timeMs: 65000 },
    { swimDate: "2026-02-01", timeMs: 64000 },
    { swimDate: "2026-03-01", timeMs: 63000 },
    { swimDate: "2026-04-01", timeMs: 62000 },
  ];

  it("projects a dashed crossing for >= 4 improving meet times", () => {
    const p = computeQualifyProjection(improving, 60000, today);
    expect(p.status).toBe("projected");
    if (p.status !== "projected") return;
    expect(p.slopeMsPerDay).toBeLessThan(0);
    expect(p.toMs).toBe(60000);
    // ~2 more months from the last meet to drop 2000ms at 1000ms/month.
    expect(p.etaIso >= today).toBe(true);
    expect(p.etaIso.slice(0, 4)).toBe("2026");
    // The dashed segment ends at the cut, in the future of where it starts.
    expect(p.toT).toBeGreaterThan(p.fromT);
    expect(p.toMs).toBeLessThan(p.fromMs);
  });

  it("reports no_cut when the tier has no cut for this event/age", () => {
    expect(computeQualifyProjection(improving, null, today).status).toBe(
      "no_cut",
    );
  });

  it("reports not_enough_data with fewer than 4 meet times", () => {
    const p = computeQualifyProjection(improving.slice(0, 3), 60000, today);
    expect(p.status).toBe("not_enough_data");
    if (p.status === "not_enough_data") expect(p.meetCount).toBe(3);
  });

  it("reports not_enough_data with no meet times at all", () => {
    const p = computeQualifyProjection([], 60000, today);
    expect(p.status).toBe("not_enough_data");
    if (p.status === "not_enough_data") expect(p.meetCount).toBe(0);
  });

  it("reports already_qualified when the fastest meet already beats the cut", () => {
    const withPb = [...improving, { swimDate: "2026-04-10", timeMs: 59000 }];
    const p = computeQualifyProjection(withPb, 60000, today);
    expect(p.status).toBe("already_qualified");
    if (p.status === "already_qualified") expect(p.bestMs).toBe(59000);
  });

  it("reports no_trend when recent meets are flat or rising", () => {
    const rising = [
      { swimDate: "2026-01-01", timeMs: 62000 },
      { swimDate: "2026-02-01", timeMs: 63000 },
      { swimDate: "2026-03-01", timeMs: 64000 },
      { swimDate: "2026-04-01", timeMs: 65000 },
    ];
    expect(computeQualifyProjection(rising, 60000, today).status).toBe(
      "no_trend",
    );
  });

  it("reports beyond_horizon when the crossing is more than ~12 months out", () => {
    // Improving only 10ms per month; 5000ms to the cut => centuries away.
    const crawl = [
      { swimDate: "2026-01-01", timeMs: 65000 },
      { swimDate: "2026-02-01", timeMs: 64990 },
      { swimDate: "2026-03-01", timeMs: 64980 },
      { swimDate: "2026-04-01", timeMs: 64970 },
    ];
    const p = computeQualifyProjection(crawl, 60000, today);
    expect(p.status).toBe("beyond_horizon");
    if (p.status === "beyond_horizon") expect(p.slopeMsPerDay).toBeLessThan(0);
  });

  it("anchors the dashed start at the real recent best, not a fitted value skewed by a slow outlier", () => {
    // Steady improvement, but one slow outlier meet mid-series (a bad swim). The
    // least-squares line is pulled up by that point, so its fitted value at the
    // last date floats ABOVE every recent time — the anchor must instead sit at a
    // real personal-best point (<= the fastest actual meet), never above it.
    const withOutlier = [
      { swimDate: "2026-01-01", timeMs: 66000 },
      { swimDate: "2026-02-01", timeMs: 64000 },
      { swimDate: "2026-03-01", timeMs: 82000 }, // slow outlier
      { swimDate: "2026-04-01", timeMs: 63000 },
      { swimDate: "2026-05-01", timeMs: 62000 }, // recent best
    ];
    const p = computeQualifyProjection(withOutlier, 60000, "2026-05-15");
    expect(p.status).toBe("projected");
    if (p.status !== "projected") return;
    // The dashed start is a real best, comfortably below the outlier and never
    // above the fastest actual meet time.
    expect(p.fromMs).toBeLessThanOrEqual(62000);
    expect(p.toMs).toBeLessThan(p.fromMs);
    expect(p.toT).toBeGreaterThan(p.fromT);
  });

  it("only fits the recent window, so a stale fast start doesn't fake a trend", () => {
    // A big early drop, then four flat recent meets: recent rate is flat.
    const stalled = [
      { swimDate: "2025-01-01", timeMs: 80000 },
      { swimDate: "2026-01-01", timeMs: 62000 },
      { swimDate: "2026-02-01", timeMs: 62000 },
      { swimDate: "2026-03-01", timeMs: 62000 },
      { swimDate: "2026-04-01", timeMs: 62000 },
    ];
    expect(
      computeQualifyProjection(stalled, 60000, today, { recentMeets: 4 }).status,
    ).toBe("no_trend");
  });
});

// ---------------------------------------------------------------------------
// authorizeResultWrite (BRD §R15) — the ONE viewer write, server-enforced
// ---------------------------------------------------------------------------

describe("authorizeResultWrite", () => {
  it("lets a coach who manages the swimmer write any type", () => {
    for (const t of ["MEET", "TIME_TRIAL", "PRACTICE", "SCHOOL_GALA"] as const) {
      expect(
        authorizeResultWrite({
          role: "COACH",
          managesSwimmer: true,
          linkedToSwimmer: false,
          targetSwimType: t,
        }),
      ).toBeNull();
    }
  });

  it("rejects a coach who does not manage the swimmer", () => {
    expect(
      authorizeResultWrite({
        role: "COACH",
        managesSwimmer: false,
        linkedToSwimmer: false,
        targetSwimType: "MEET",
      }),
    ).toMatch(/your own club/i);
  });

  it("lets the super-user write anything for anyone", () => {
    expect(
      authorizeResultWrite({
        role: "SUPER_USER",
        managesSwimmer: true,
        linkedToSwimmer: false,
        targetSwimType: "SCHOOL_GALA",
      }),
    ).toBeNull();
  });

  it("lets a linked viewer create a SCHOOL_GALA time", () => {
    expect(
      authorizeResultWrite({
        role: "VIEWER",
        managesSwimmer: false,
        linkedToSwimmer: true,
        targetSwimType: "SCHOOL_GALA",
      }),
    ).toBeNull();
  });

  it("rejects a viewer writing any non-gala type (the whole point)", () => {
    for (const t of ["MEET", "TIME_TRIAL", "PRACTICE"] as const) {
      expect(
        authorizeResultWrite({
          role: "VIEWER",
          managesSwimmer: false,
          linkedToSwimmer: true,
          targetSwimType: t,
        }),
      ).toMatch(/school gala/i);
    }
  });

  it("rejects a viewer not linked to the swimmer, even for a gala", () => {
    expect(
      authorizeResultWrite({
        role: "VIEWER",
        managesSwimmer: false,
        linkedToSwimmer: false,
        targetSwimType: "SCHOOL_GALA",
      }),
    ).toMatch(/your own swimmer/i);
  });

  it("lets a linked viewer edit/delete an existing SCHOOL_GALA row", () => {
    expect(
      authorizeResultWrite({
        role: "VIEWER",
        managesSwimmer: false,
        linkedToSwimmer: true,
        targetSwimType: "SCHOOL_GALA",
        existingSwimType: "SCHOOL_GALA",
      }),
    ).toBeNull();
  });

  it("rejects a viewer touching a non-gala row (can't edit or retype a meet)", () => {
    // Editing a MEET row (even to keep it SCHOOL_GALA) is refused via existingSwimType.
    expect(
      authorizeResultWrite({
        role: "VIEWER",
        managesSwimmer: false,
        linkedToSwimmer: true,
        targetSwimType: "SCHOOL_GALA",
        existingSwimType: "MEET",
      }),
    ).toMatch(/school gala/i);
    // Retyping a gala to a meet is refused via targetSwimType.
    expect(
      authorizeResultWrite({
        role: "VIEWER",
        managesSwimmer: false,
        linkedToSwimmer: true,
        targetSwimType: "MEET",
        existingSwimType: "SCHOOL_GALA",
      }),
    ).toMatch(/school gala/i);
  });
});
