import { describe, expect, it } from "vitest";

import {
  aquaPoints,
  baseTimeMs,
  bestPointsSwim,
  courseHasBaseTimes,
  perMeetBest,
  POINTS_BASE_YEAR,
  POINTS_SCALE_MAX,
  scoreEventPbs,
} from "./points";
import type { Course, EventPB, ResultForPB, Stroke } from "./swim";

function pb(
  distance: number,
  stroke: Stroke,
  course: Course,
  timeMs: number | null,
  extra: { swimDate?: string; meetName?: string | null } = {},
): EventPB {
  const swimDate = extra.swimDate ?? "2026-03-01";
  const meetName = extra.meetName === undefined ? "Autumn Gala" : extra.meetName;
  return {
    distance: distance as EventPB["distance"],
    stroke,
    course,
    label: `${distance} ${stroke}`,
    headline: timeMs === null ? null : { timeMs, swimDate, meetName, ageAtSwim: 15 },
    overallBest: { timeMs: timeMs ?? 1, swimDate, swimType: "MEET" },
    improvement: null,
  } as EventPB;
}

function result(
  distance: number,
  stroke: Stroke,
  course: Course,
  timeMs: number,
  swimDate: string,
  swimType: ResultForPB["swimType"] = "MEET",
  // null = an unnamed result. Distinct from omitting the argument, which keeps
  // the default name; `undefined` alone could not express "no meet name".
  meetName: string | null = "Autumn Gala",
): ResultForPB {
  return {
    distance,
    stroke,
    course,
    timeMs,
    swimType,
    swimDate,
    meetName: meetName ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// The base-time table
// ---------------------------------------------------------------------------

/**
 * Every published 2025 long-course base time, transcribed from the 1000-point
 * row. This is the fixture the whole feature rests on: if a digit here drifts,
 * every points figure in the app is silently wrong, so it is asserted directly
 * rather than only through the formula.
 */
const BASE_2025_LCM: Record<"M" | "F", ReadonlyArray<[number, Stroke, number]>> = {
  M: [
    [50, "FREE", 20910],
    [100, "FREE", 46400],
    [200, "FREE", 102000],
    [400, "FREE", 220070],
    [800, "FREE", 452120],
    [1500, "FREE", 870670],
    [50, "BACK", 23550],
    [100, "BACK", 51600],
    [200, "BACK", 111920],
    [50, "BREAST", 25950],
    [100, "BREAST", 56880],
    [200, "BREAST", 125480],
    [50, "FLY", 22270],
    [100, "FLY", 49450],
    [200, "FLY", 110340],
    [200, "IM", 114000],
    [400, "IM", 242500],
  ],
  F: [
    [50, "FREE", 23610],
    [100, "FREE", 51710],
    [200, "FREE", 112230],
    [400, "FREE", 235380],
    [800, "FREE", 484790],
    [1500, "FREE", 920480],
    [50, "BACK", 26860],
    [100, "BACK", 57130],
    [200, "BACK", 123140],
    [50, "BREAST", 29160],
    [100, "BREAST", 64130],
    [200, "BREAST", 137550],
    [50, "FLY", 24430],
    [100, "FLY", 55180],
    [200, "FLY", 121810],
    [200, "IM", 126120],
    [400, "IM", 264380],
  ],
};

describe("the 2025 long-course base times", () => {
  it("is dated, so the annual reissue can't slip in unnoticed", () => {
    expect(POINTS_BASE_YEAR).toBe(2025);
  });

  it("matches the published 1000-point row for all 34 entries", () => {
    for (const gender of ["M", "F"] as const) {
      for (const [distance, stroke, expected] of BASE_2025_LCM[gender]) {
        expect(
          baseTimeMs(distance, stroke, "LCM", gender),
          `${gender} ${distance} ${stroke}`,
        ).toBe(expected);
      }
    }
  });

  it("scores every base time at exactly 1000 points", () => {
    for (const gender of ["M", "F"] as const) {
      for (const [distance, stroke, base] of BASE_2025_LCM[gender]) {
        expect(
          aquaPoints(base, distance, stroke, "LCM", gender),
          `${gender} ${distance} ${stroke}`,
        ).toBe(POINTS_SCALE_MAX);
      }
    }
  });

  it("measures each sex against its own base time", () => {
    // The men's standard is faster, so the same swim rates lower against it.
    const t = 60_000;
    expect(aquaPoints(t, 100, "FREE", "LCM", "M")!).toBeLessThan(
      aquaPoints(t, 100, "FREE", "LCM", "F")!,
    );
  });
});

// ---------------------------------------------------------------------------
// The scoring formula
// ---------------------------------------------------------------------------

/**
 * A spread of cells lifted from the published tables — every event, and every
 * 50-point band from 1000 down to 300.
 *
 * Asserted to within ±1 point, not exactly, and that tolerance is a fact about
 * the SOURCE rather than slack in the implementation: the tables print times
 * rounded to 0.01s while deriving them at full precision, so a printed cell can
 * sit a hundredth either side of the true boundary. Recomputing all 26,918
 * cells this way puts ~95% dead on and the rest exactly one point out, never
 * more.
 */
const PUBLISHED_CELLS: Record<
  "M" | "F",
  ReadonlyArray<[number, Stroke, number, number]>
> = {
  M: [
    [50, "FREE", 20910, 1000],
    [100, "FREE", 46400, 1000],
    [200, "FREE", 103750, 950],
    [400, "FREE", 223860, 950],
    [800, "FREE", 468280, 900],
    [1500, "FREE", 901790, 900],
    [50, "BACK", 24860, 850],
    [100, "BACK", 54470, 850],
    [200, "BACK", 120560, 800],
    [50, "BREAST", 27950, 800],
    [100, "BREAST", 62600, 750],
    [200, "BREAST", 138100, 750],
    [50, "FLY", 25080, 700],
    [100, "FLY", 55690, 700],
    [200, "FLY", 127370, 650],
    [200, "IM", 131600, 650],
    [400, "IM", 287510, 600],
    [50, "FREE", 24790, 600],
    [100, "FREE", 56630, 550],
    [200, "FREE", 124490, 550],
    [400, "FREE", 277270, 500],
    [800, "FREE", 569630, 500],
    [1500, "FREE", 1136180, 450],
    [50, "BACK", 30730, 450],
    [100, "BACK", 70030, 400],
    [200, "BACK", 151890, 400],
    [50, "BREAST", 36820, 350],
    [100, "BREAST", 80710, 350],
    [200, "BREAST", 187440, 300],
    [50, "FLY", 33260, 300],
  ],
  F: [
    [50, "FREE", 23610, 1000],
    [100, "FREE", 51710, 1000],
    [200, "FREE", 114160, 950],
    [400, "FREE", 239430, 950],
    [800, "FREE", 502110, 900],
    [1500, "FREE", 953380, 900],
    [50, "BACK", 28350, 850],
    [100, "BACK", 60310, 850],
    [200, "BACK", 132640, 800],
    [50, "BREAST", 31410, 800],
    [100, "BREAST", 70580, 750],
    [200, "BREAST", 151390, 750],
    [50, "FLY", 27510, 700],
    [100, "FLY", 62140, 700],
    [200, "FLY", 140610, 650],
    [200, "IM", 145590, 650],
    [400, "IM", 313450, 600],
    [50, "FREE", 27990, 600],
    [100, "FREE", 63110, 550],
    [200, "FREE", 136970, 550],
    [400, "FREE", 296560, 500],
    [800, "FREE", 610790, 500],
    [1500, "FREE", 1201180, 450],
    [50, "BACK", 35050, 450],
    [100, "BACK", 77530, 400],
    [200, "BACK", 167120, 400],
    [50, "BREAST", 41370, 350],
    [100, "BREAST", 90990, 350],
    [200, "BREAST", 205470, 300],
    [50, "FLY", 36490, 300],
  ],
};

describe("aquaPoints", () => {
  it("reproduces the published tables to within one point", () => {
    for (const gender of ["M", "F"] as const) {
      for (const [distance, stroke, timeMs, published] of PUBLISHED_CELLS[gender]) {
        const got = aquaPoints(timeMs, distance, stroke, "LCM", gender);
        expect(got, `${gender} ${distance} ${stroke} @ ${published}`).not.toBeNull();
        expect(
          Math.abs(got! - published),
          `${gender} ${distance} ${stroke} @ ${published} → ${got}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("truncates rather than rounding, matching meet software", () => {
    // 46.40 base: a time of 55.00 is worth 600.4… points, which reads as 600.
    expect(aquaPoints(55_000, 100, "FREE", "LCM", "M")).toBe(600);
    expect(aquaPoints(52_000, 100, "FREE", "LCM", "M")).toBe(710);
    expect(aquaPoints(165_000, 200, "BREAST", "LCM", "F")).toBe(579);
  });

  it("cubes the ratio — half the speed is an eighth of the points", () => {
    const base = baseTimeMs(100, "FREE", "LCM", "M")!;
    expect(aquaPoints(base * 2, 100, "FREE", "LCM", "M")).toBe(125);
  });

  it("rises strictly as the swimmer gets faster", () => {
    const slow = aquaPoints(70_000, 100, "FREE", "LCM", "F")!;
    const mid = aquaPoints(65_000, 100, "FREE", "LCM", "F")!;
    const fast = aquaPoints(60_000, 100, "FREE", "LCM", "F")!;
    expect(mid).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(mid);
  });

  it("lets a world-beating swim score above 1000 rather than clamping", () => {
    const base = baseTimeMs(50, "FREE", "LCM", "F")!;
    expect(aquaPoints(base - 100, 50, "FREE", "LCM", "F")!).toBeGreaterThan(1000);
  });

  it("returns null, never zero, for an event with no published base time", () => {
    // 25 m events are not scored by World Aquatics.
    expect(aquaPoints(15_000, 25, "FREE", "LCM", "F")).toBeNull();
    // 100 IM is short-course only, so it has no long-course base time.
    expect(aquaPoints(70_000, 100, "IM", "LCM", "M")).toBeNull();
  });

  it("returns null for short course until the SC tables are loaded", () => {
    expect(courseHasBaseTimes("LCM")).toBe(true);
    expect(courseHasBaseTimes("SCM")).toBe(false);
    expect(aquaPoints(46_400, 100, "FREE", "SCM", "M")).toBeNull();
  });

  it("never borrows the long-course base time for a short-course swim", () => {
    // The same time scores in LCM and refuses to score in SCM — the two courses
    // are separate tables and an unloaded one is silence, not a fallback.
    expect(aquaPoints(60_000, 100, "FREE", "LCM", "F")).not.toBeNull();
    expect(aquaPoints(60_000, 100, "FREE", "SCM", "F")).toBeNull();
  });

  it("returns null for a nonsense time instead of dividing by it", () => {
    expect(aquaPoints(0, 100, "FREE", "LCM", "F")).toBeNull();
    expect(aquaPoints(-1, 100, "FREE", "LCM", "F")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scoring a PB board
// ---------------------------------------------------------------------------

describe("scoreEventPbs", () => {
  const board = [
    pb(100, "FREE", "LCM", 62_000),
    pb(200, "BREAST", "LCM", 180_000),
    pb(50, "FLY", "LCM", 30_000),
  ];

  it("ranks strongest event first", () => {
    const scored = scoreEventPbs(board, "LCM", "F");
    const points = scored.map((s) => s.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("carries the time, date and meet through for the tooltip", () => {
    const [top] = scoreEventPbs([pb(100, "FREE", "LCM", 62_000)], "LCM", "F");
    expect(top.timeMs).toBe(62_000);
    expect(top.swimDate).toBe("2026-03-01");
    expect(top.meetName).toBe("Autumn Gala");
    expect(top.label).toBe("100 FREE");
  });

  it("skips events with no meet time — a PB board row without a headline", () => {
    const scored = scoreEventPbs(
      [pb(100, "FREE", "LCM", null), pb(50, "FREE", "LCM", 30_000)],
      "LCM",
      "F",
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].distance).toBe(50);
  });

  it("omits unscoreable events rather than drawing them at zero", () => {
    const scored = scoreEventPbs(
      [pb(25, "FREE", "LCM", 15_000), pb(50, "FREE", "LCM", 30_000)],
      "LCM",
      "F",
    );
    expect(scored.map((s) => s.distance)).toEqual([50]);
  });

  it("never mixes courses onto one board", () => {
    const scored = scoreEventPbs(
      [pb(100, "FREE", "LCM", 62_000), pb(100, "FREE", "SCM", 60_000)],
      "LCM",
      "F",
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].course).toBe("LCM");
  });

  it("orders ties by distance, so bars don't reshuffle between renders", () => {
    // Two events contrived to the same points: order must not depend on input.
    const a = scoreEventPbs(
      [pb(200, "FREE", "LCM", 112_230), pb(50, "FREE", "LCM", 23_610)],
      "LCM",
      "F",
    );
    const b = scoreEventPbs(
      [pb(50, "FREE", "LCM", 23_610), pb(200, "FREE", "LCM", 112_230)],
      "LCM",
      "F",
    );
    expect(a.map((s) => s.distance)).toEqual([50, 200]);
    expect(b.map((s) => s.distance)).toEqual([50, 200]);
  });

  it("returns an empty board for short course until the SC tables land", () => {
    expect(scoreEventPbs([pb(100, "FREE", "SCM", 60_000)], "SCM", "F")).toEqual([]);
  });
});

describe("bestPointsSwim", () => {
  it("is the single highest-scoring swim, not a sum across events", () => {
    const best = bestPointsSwim(
      [
        pb(100, "FREE", "LCM", 62_000),
        pb(200, "BREAST", "LCM", 180_000),
        pb(50, "FLY", "LCM", 30_000),
      ],
      "LCM",
      "F",
    )!;
    const all = scoreEventPbs(
      [
        pb(100, "FREE", "LCM", 62_000),
        pb(200, "BREAST", "LCM", 180_000),
        pb(50, "FLY", "LCM", 30_000),
      ],
      "LCM",
      "F",
    );
    expect(best.points).toBe(Math.max(...all.map((s) => s.points)));
    expect(best.points).toBeLessThan(all.reduce((sum, s) => sum + s.points, 0));
  });

  it("does not reward racing more events", () => {
    const specialist = bestPointsSwim([pb(100, "FREE", "LCM", 55_000)], "LCM", "F")!;
    const generalist = bestPointsSwim(
      [
        pb(100, "FREE", "LCM", 70_000),
        pb(200, "FREE", "LCM", 155_000),
        pb(50, "BACK", "LCM", 38_000),
        pb(100, "BREAST", "LCM", 95_000),
      ],
      "LCM",
      "F",
    )!;
    expect(specialist.points).toBeGreaterThan(generalist.points);
  });

  it("is null for a swimmer with no scoreable meet time", () => {
    expect(bestPointsSwim([pb(100, "FREE", "LCM", null)], "LCM", "F")).toBeNull();
    expect(bestPointsSwim([], "LCM", "F")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The per-meet trend
// ---------------------------------------------------------------------------

describe("perMeetBest", () => {
  it("gives a multi-day gala one dot, at its best swim", () => {
    const meets = perMeetBest(
      [
        result(100, "FREE", "LCM", 70_000, "2026-03-01"),
        result(50, "FREE", "LCM", 30_000, "2026-03-02"),
        result(200, "FREE", "LCM", 160_000, "2026-03-03"),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(1);
    expect(meets[0].swimDate).toBe("2026-03-01");
    const best = Math.max(
      aquaPoints(70_000, 100, "FREE", "LCM", "F")!,
      aquaPoints(30_000, 50, "FREE", "LCM", "F")!,
      aquaPoints(160_000, 200, "FREE", "LCM", "F")!,
    );
    expect(meets[0].points).toBe(best);
  });

  it("names the event behind the number, for the tooltip", () => {
    const meets = perMeetBest(
      [
        result(100, "FREE", "LCM", 75_000, "2026-03-01"),
        result(50, "FREE", "LCM", 29_000, "2026-03-01"),
      ],
      "LCM",
      "F",
    );
    expect(meets[0].label).toBe("50 Free");
    expect(meets[0].timeMs).toBe(29_000);
  });

  it("splits two galas of the same name months apart", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 32_000, "2026-03-01", "MEET", "Level 3"),
        result(50, "FREE", "LCM", 31_000, "2026-09-01", "MEET", "Level 3"),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(2);
  });

  it("keeps two differently-named galas on the same day apart", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 32_000, "2026-03-01", "MEET", "Level 3"),
        result(50, "FREE", "LCM", 31_000, "2026-03-01", "MEET", "Level 2"),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(2);
  });

  it("groups unnamed results by exact date, having nothing else to go on", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 32_000, "2026-03-01", "MEET", null),
        result(100, "FREE", "LCM", 68_000, "2026-03-01", "MEET", null),
        result(50, "FREE", "LCM", 31_000, "2026-03-02", "MEET", null),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(2);
  });

  it("scores meet swims only — trials and practice never appear", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 40_000, "2026-03-01", "MEET"),
        result(50, "FREE", "LCM", 24_000, "2026-03-01", "TIME_TRIAL"),
        result(50, "FREE", "LCM", 24_500, "2026-03-01", "PRACTICE"),
        result(50, "FREE", "LCM", 24_800, "2026-03-01", "SCHOOL_GALA"),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(1);
    expect(meets[0].timeMs).toBe(40_000);
  });

  it("can fall as well as rise, so a bad season is visible", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 30_000, "2026-01-01", "MEET", "January"),
        result(50, "FREE", "LCM", 33_000, "2026-06-01", "MEET", "June"),
      ],
      "LCM",
      "F",
    );
    expect(meets[1].points).toBeLessThan(meets[0].points);
  });

  it("returns points in date order regardless of input order", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 31_000, "2026-06-01", "MEET", "June"),
        result(50, "FREE", "LCM", 30_000, "2026-01-01", "MEET", "January"),
      ],
      "LCM",
      "F",
    );
    expect(meets.map((m) => m.swimDate)).toEqual(["2026-01-01", "2026-06-01"]);
  });

  it("skips unscoreable swims rather than plotting them at zero", () => {
    const meets = perMeetBest(
      [result(25, "FREE", "LCM", 15_000, "2026-03-01")],
      "LCM",
      "F",
    );
    expect(meets).toEqual([]);
  });

  it("never mixes courses", () => {
    const meets = perMeetBest(
      [
        result(50, "FREE", "LCM", 30_000, "2026-03-01"),
        result(50, "FREE", "SCM", 29_000, "2026-03-01"),
      ],
      "LCM",
      "F",
    );
    expect(meets).toHaveLength(1);
  });
});
