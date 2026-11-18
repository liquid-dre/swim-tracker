import { describe, expect, test } from "vitest";

import {
  MEET_QUALIFYING_PRESETS,
  ageBandLabel,
  dayBefore,
  describeMeetQualifyingBasis,
  findMeetQualifyingPreset,
  qualifySwimmerForMeet,
  resolveMeetCut,
  tableEvents,
} from "./meetQualifying";
import { parseTime } from "./swim";

const HAS = findMeetQualifyingPreset("HAS_CHAMPS_2026")!;
const START = "2026-11-21";

function swim(over: Partial<{
  distance: number; stroke: string; course: string; time: string;
  swimDate: string; swimType: string;
}>) {
  return {
    distance: over.distance ?? 100,
    stroke: over.stroke ?? "FREE",
    course: over.course ?? "LCM",
    timeMs: parseTime(over.time ?? "1:20.00"),
    swimDate: over.swimDate ?? "2026-10-10",
    swimType: over.swimType ?? "MEET",
    meetName: "3rd seeded",
  };
}

const table = { ...HAS, qualifyingFrom: HAS.defaultFrom };

describe("HAS Championships 2026 table", () => {
  test("holds 8 events × 6 age columns × 2 genders, long course", () => {
    expect(HAS.cuts).toHaveLength(96);
    expect(HAS.course).toBe("LCM");
    expect(tableEvents(HAS.cuts).map((e) => `${e.distance} ${e.stroke}`)).toEqual([
      "100 FREE", "200 FREE", "100 BREAST", "200 BREAST",
      "100 BACK", "200 BACK", "100 FLY", "200 IM",
    ]);
  });

  test("spot-checks the published numbers, corners and middle", () => {
    const cut = (gender: "M" | "F", age: number, distance: 100 | 200, stroke: "FREE" | "IM" | "FLY" | "BACK") =>
      resolveMeetCut(HAS.cuts, { gender, exactAge: age }, { distance, stroke })!.timeMs;
    expect(cut("F", 11, 100, "FREE")).toBe(parseTime("1:34.18"));
    expect(cut("F", 16, 200, "IM")).toBe(parseTime("3:30.82"));
    expect(cut("M", 14, 100, "FLY")).toBe(parseTime("1:43.07"));
    expect(cut("M", 16, 200, "BACK")).toBe(parseTime("3:22.11"));
    // Verbatim, even where the published columns look inverted.
    expect(cut("F", 15, 100, "FREE")).toBe(parseTime("1:15.21"));
  });

  test("'11' covers every younger swimmer; '16 and over' every older one", () => {
    const ev = { distance: 100 as const, stroke: "FREE" as const };
    expect(resolveMeetCut(HAS.cuts, { gender: "M", exactAge: 9 }, ev)?.timeMs).toBe(parseTime("1:34.18"));
    expect(resolveMeetCut(HAS.cuts, { gender: "M", exactAge: 19 }, ev)?.timeMs).toBe(parseTime("1:12.02"));
  });

  test("an event off the table has no cut — never 'qualified'", () => {
    expect(resolveMeetCut(HAS.cuts, { gender: "F", exactAge: 13 }, { distance: 50, stroke: "FREE" })).toBeNull();
    expect(resolveMeetCut(HAS.cuts, { gender: "F", exactAge: 13 }, { distance: 400, stroke: "FREE" })).toBeNull();
  });

  test("labels its age columns as printed", () => {
    expect(HAS.cuts.slice(0, 6).map(ageBandLabel)).toEqual([
      "11 & under", "12", "13", "14", "15", "16 & over",
    ]);
  });

  test("preset list keys are unique", () => {
    const keys = MEET_QUALIFYING_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("qualifySwimmerForMeet", () => {
  // 14 on 21 Nov 2026 (birthday 1 Apr).
  const girl = { gender: "F" as const, dob: "2012-04-01" };

  test("age is taken on the meet's first day", () => {
    const turnsFifteenOnDayOne = { gender: "F" as const, dob: "2011-11-21" };
    expect(qualifySwimmerForMeet(table, START, turnsFifteenOnDayOne, []).exactAge).toBe(15);
    const turnsFifteenNextDay = { gender: "F" as const, dob: "2011-11-22" };
    expect(qualifySwimmerForMeet(table, START, turnsFifteenNextDay, []).exactAge).toBe(14);
  });

  test("a long-course meet swim under the cut qualifies; a tie meets it", () => {
    const v = qualifySwimmerForMeet(table, START, girl, [
      swim({ time: "1:20.00" }),
      swim({ distance: 200, stroke: "IM", time: "3:32.06" }),
    ]);
    const free = v.events.find((e) => e.distance === 100 && e.stroke === "FREE")!;
    expect(free.met).toBe(true);
    expect(free.gapMs).toBe(parseTime("1:20.00") - parseTime("1:23.69"));
    expect(v.events.find((e) => e.stroke === "IM")!.met).toBe(true);
    expect(v.metCount).toBe(2);
  });

  test("short course, time trials, practice and school galas never qualify", () => {
    const v = qualifySwimmerForMeet(table, START, girl, [
      swim({ course: "SCM", time: "1:00.00" }),
      swim({ swimType: "TIME_TRIAL", time: "1:00.00" }),
      swim({ swimType: "PRACTICE", time: "1:00.00" }),
      swim({ swimType: "SCHOOL_GALA", time: "1:00.00" }),
    ]);
    expect(v.metCount).toBe(0);
    expect(v.events[0].bestMs).toBeNull();
  });

  test("only this season counts, and the champs itself never does", () => {
    const v = qualifySwimmerForMeet(table, START, girl, [
      swim({ swimDate: "2026-08-23", time: "1:00.00" }), // before the season
      swim({ swimDate: START, time: "1:00.00" }), // at the championship
      swim({ swimDate: "2026-11-20", time: "1:30.00" }), // eve of the meet: counts
    ]);
    const free = v.events[0];
    expect(free.met).toBe(false);
    expect(free.bestMs).toBe(parseTime("1:30.00"));
    expect(free.bestDate).toBe("2026-11-20");
  });

  test("the window ends the day before the meet and is described once", () => {
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(describeMeetQualifyingBasis(table, START)).toBe(
      "Long course only · fastest official meet swim 24 Aug 2026 – 20 Nov 2026 · age on 21 Nov 2026",
    );
  });
});
