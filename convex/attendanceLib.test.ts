import { describe, expect, test } from "vitest";

import {
  cleanIsoDate,
  computeRates,
  datesForPattern,
  dedupeSwimmerIds,
  formatHHMM,
  isValidMinuteOfDay,
  isValidWeekdays,
  parseHHMM,
  resolveSeasonEnd,
  weekdayOf,
} from "./attendanceLib";

describe("cleanIsoDate", () => {
  test("accepts a real day", () => {
    expect(cleanIsoDate("2026-07-23")).toBe("2026-07-23");
    expect(cleanIsoDate("  2026-02-28  ")).toBe("2026-02-28");
  });
  test("rejects malformed and impossible dates", () => {
    expect(cleanIsoDate("2026-7-3")).toBeNull();
    expect(cleanIsoDate("2026-02-30")).toBeNull();
    expect(cleanIsoDate("not-a-date")).toBeNull();
    expect(cleanIsoDate(undefined)).toBeNull();
  });
});

describe("parseHHMM / formatHHMM", () => {
  test("round-trips", () => {
    expect(parseHHMM("04:30")).toBe(270);
    expect(parseHHMM("16:00")).toBe(960);
    expect(formatHHMM(270)).toBe("04:30");
    expect(formatHHMM(960)).toBe("16:00");
    expect(formatHHMM(parseHHMM("23:59")!)).toBe("23:59");
  });
  test("rejects out-of-range and junk", () => {
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("12:60")).toBeNull();
    expect(parseHHMM("4:5")).toBeNull();
    expect(parseHHMM("noon")).toBeNull();
  });
  test("formatHHMM clamps", () => {
    expect(formatHHMM(-5)).toBe("00:00");
    expect(formatHHMM(5000)).toBe("23:59");
  });
});

describe("isValidMinuteOfDay / isValidWeekdays", () => {
  test("minute-of-day bounds", () => {
    expect(isValidMinuteOfDay(0)).toBe(true);
    expect(isValidMinuteOfDay(1439)).toBe(true);
    expect(isValidMinuteOfDay(1440)).toBe(false);
    expect(isValidMinuteOfDay(-1)).toBe(false);
    expect(isValidMinuteOfDay(12.5)).toBe(false);
  });
  test("weekday sets", () => {
    expect(isValidWeekdays([1, 3, 5])).toBe(true);
    expect(isValidWeekdays([])).toBe(false); // empty is not a pattern
    expect(isValidWeekdays([1, 1])).toBe(false); // duplicate
    expect(isValidWeekdays([7])).toBe(false); // out of range
  });
});

describe("weekdayOf", () => {
  test("UTC weekday is stable", () => {
    expect(weekdayOf("2026-07-23")).toBe(4); // a Thursday
    expect(weekdayOf("2026-07-26")).toBe(0); // a Sunday
  });
});

describe("datesForPattern", () => {
  test("emits only the wanted weekdays within an inclusive window", () => {
    // 2026-07-20 (Mon) .. 2026-07-26 (Sun); Mon/Wed/Fri = 1,3,5.
    const dates = datesForPattern([1, 3, 5], "2026-07-20", "2026-07-26");
    expect(dates).toEqual(["2026-07-20", "2026-07-22", "2026-07-24"]);
  });
  test("crosses a month boundary correctly", () => {
    // Tue (2) only, spanning end of Jul into Aug 2026.
    const dates = datesForPattern([2], "2026-07-28", "2026-08-05");
    expect(dates).toEqual(["2026-07-28", "2026-08-04"]);
  });
  test("crosses a year boundary correctly", () => {
    // Fri (5) only, Dec 2026 → Jan 2027.
    const dates = datesForPattern([5], "2026-12-30", "2027-01-05");
    expect(dates).toEqual(["2027-01-01"]);
  });
  test("empty / inverted / invalid windows yield nothing", () => {
    expect(datesForPattern([1], "2026-07-26", "2026-07-20")).toEqual([]);
    expect(datesForPattern([1], "bad", "2026-07-20")).toEqual([]);
    expect(datesForPattern([], "2026-07-20", "2026-07-26")).toEqual([]);
  });
});

describe("resolveSeasonEnd", () => {
  test("uses the explicit end when set", () => {
    expect(resolveSeasonEnd("2026-01-01", "2026-06-30")).toBe("2026-06-30");
  });
  test("caps an open-ended season at one year past the start", () => {
    expect(resolveSeasonEnd("2026-07-23", null)).toBe("2027-07-23");
    expect(resolveSeasonEnd("2026-07-23", "garbage")).toBe("2027-07-23");
  });
});

describe("dedupeSwimmerIds", () => {
  test("unions multiple squad rosters, order-preserving", () => {
    expect(
      dedupeSwimmerIds([
        ["a", "b", "c"],
        ["b", "c", "d"],
        ["a", "e"],
      ]),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });
  test("handles empties", () => {
    expect(dedupeSwimmerIds([])).toEqual([]);
    expect(dedupeSwimmerIds([[], ["x"], []])).toEqual(["x"]);
  });
});

describe("computeRates", () => {
  test("late counts as attended, excused excluded from the denominator", () => {
    const r = computeRates([
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "LATE" },
      { status: "ABSENT" },
      { status: "EXCUSED" },
      { status: "EXCUSED" },
    ]);
    expect(r).toMatchObject({
      present: 2,
      late: 1,
      absent: 1,
      excused: 2,
      marked: 6,
      attended: 3, // present + late
      eligible: 4, // present + late + absent
      ratePct: 75, // 3/4
    });
  });
  test("no eligible sessions → null rate", () => {
    const r = computeRates([{ status: "EXCUSED" }]);
    expect(r.eligible).toBe(0);
    expect(r.ratePct).toBeNull();
  });
  test("empty → zeroed", () => {
    expect(computeRates([])).toMatchObject({ marked: 0, ratePct: null });
  });
});
