import { describe, expect, it } from "vitest";

import {
  eventScore,
  RADAR_STROKES,
  radarMetric,
  strokeRadarScores,
  wrPercent,
} from "./strokeRadar";
import { baseTimeMs } from "./points";
import { worldRecordMs, type Course, type EventPB, type Stroke } from "./swim";

function pb(
  distance: number,
  stroke: Stroke,
  course: Course,
  timeMs: number | null,
): EventPB {
  return {
    distance: distance as EventPB["distance"],
    stroke,
    course,
    label: `${distance} ${stroke}`,
    headline:
      timeMs === null
        ? null
        : { timeMs, swimDate: "2026-03-01", meetName: "Meet", ageAtSwim: 15 },
    overallBest: { timeMs: timeMs ?? 1, swimDate: "2026-03-01", swimType: "MEET" },
    improvement: null,
  } as EventPB;
}

const WR_100_FREE_LCM_F = worldRecordMs(100, "FREE", "LCM", "F")!;

describe("wrPercent", () => {
  it("scores a swim level with the record at 100", () => {
    expect(wrPercent(WR_100_FREE_LCM_F, 100, "FREE", "LCM", "F")).toBeCloseTo(100);
  });

  it("scores a swim twice as slow at 50", () => {
    expect(wrPercent(WR_100_FREE_LCM_F * 2, 100, "FREE", "LCM", "F")).toBeCloseTo(50);
  });

  it("rises as the swimmer gets faster", () => {
    const slow = wrPercent(WR_100_FREE_LCM_F * 1.5, 100, "FREE", "LCM", "F")!;
    const fast = wrPercent(WR_100_FREE_LCM_F * 1.2, 100, "FREE", "LCM", "F")!;
    expect(fast).toBeGreaterThan(slow);
  });

  it("clamps at 100 rather than letting a spoke escape the chart", () => {
    expect(wrPercent(WR_100_FREE_LCM_F / 2, 100, "FREE", "LCM", "F")).toBe(100);
  });

  it("returns null for an unknown record rather than guessing", () => {
    // 25 m events carry no world record in the table.
    expect(wrPercent(20_000, 25, "FREE", "LCM", "F")).toBeNull();
  });

  it("returns null for a nonsense time instead of dividing by it", () => {
    expect(wrPercent(0, 100, "FREE", "LCM", "F")).toBeNull();
  });

  it("measures each gender against its own record", () => {
    const t = WR_100_FREE_LCM_F * 1.3;
    const asF = wrPercent(t, 100, "FREE", "LCM", "F")!;
    const asM = wrPercent(t, 100, "FREE", "LCM", "M")!;
    // The men's record is faster, so the same time rates lower against it —
    // which is exactly why the swimmer's own gender must be used.
    expect(asM).toBeLessThan(asF);
  });
});

describe("radarMetric — the course decides the scale", () => {
  it("scores long course in World Aquatics points", () => {
    expect(radarMetric("LCM")).toEqual({ metric: "POINTS", max: 1000 });
  });

  it("falls back to percent of world record where base times are missing", () => {
    // Short course, until the World Aquatics short-course tables are loaded.
    expect(radarMetric("SCM")).toEqual({ metric: "WR_PCT", max: 100 });
  });
});

describe("eventScore — one event, on the course's own metric", () => {
  it("returns points on long course", () => {
    const base = baseTimeMs(100, "FREE", "LCM", "F")!;
    expect(eventScore(base, 100, "FREE", "LCM", "F")).toBe(1000);
    expect(eventScore(base * 1.25, 100, "FREE", "LCM", "F")).toBe(512);
  });

  it("returns a percentage on short course", () => {
    const wr = worldRecordMs(100, "FREE", "SCM", "F")!;
    expect(eventScore(wr * 1.25, 100, "FREE", "SCM", "F")).toBeCloseTo(80, 5);
  });

  it("never scores one course against the other's reference", () => {
    // Same time, two courses: the numbers are on different scales entirely, so
    // they must not be equal by accident.
    const t = 60_000;
    const lcm = eventScore(t, 100, "FREE", "LCM", "F")!;
    const scm = eventScore(t, 100, "FREE", "SCM", "F")!;
    expect(lcm).toBeGreaterThan(100); // points
    expect(scm).toBeLessThanOrEqual(100); // percent
  });
});

describe("strokeRadarScores", () => {
  const BASE_100_FREE_LCM_F = baseTimeMs(100, "FREE", "LCM", "F")!;

  it("returns one score per spoke, in the fixed spoke order", () => {
    const scores = strokeRadarScores([], "LCM", "F");
    expect(scores.map((s) => s.stroke)).toEqual([...RADAR_STROKES]);
  });

  it("gives an unraced stroke null, never zero", () => {
    const scores = strokeRadarScores(
      [pb(100, "FREE", "LCM", BASE_100_FREE_LCM_F * 1.3)],
      "LCM",
      "F",
    );
    const fly = scores.find((s) => s.stroke === "FLY")!;
    expect(fly.value).toBeNull();
    expect(fly.events).toBe(0);
  });

  it("averages a stroke's events in points on long course", () => {
    const base200 = baseTimeMs(200, "FREE", "LCM", "F")!;
    const free = strokeRadarScores(
      [
        pb(100, "FREE", "LCM", BASE_100_FREE_LCM_F * 1.25), // 512 pts
        pb(200, "FREE", "LCM", base200 * 2), // 125 pts
      ],
      "LCM",
      "F",
    ).find((s) => s.stroke === "FREE")!;
    expect(free.events).toBe(2);
    expect(free.value).toBeCloseTo((512 + 125) / 2, 5);
  });

  it("averages a stroke's events in percent on short course", () => {
    const wr100 = worldRecordMs(100, "FREE", "SCM", "F")!;
    const wr200 = worldRecordMs(200, "FREE", "SCM", "F")!;
    const free = strokeRadarScores(
      [
        pb(100, "FREE", "SCM", wr100 * 1.25), // 80%
        pb(200, "FREE", "SCM", wr200 * 2), // 50%
      ],
      "SCM",
      "F",
    ).find((s) => s.stroke === "FREE")!;
    expect(free.events).toBe(2);
    expect(free.value).toBeCloseTo((80 + 50) / 2, 5);
  });

  it("ignores the other course entirely", () => {
    const scores = strokeRadarScores(
      [pb(100, "FREE", "SCM", BASE_100_FREE_LCM_F)],
      "LCM",
      "F",
    );
    expect(scores.find((s) => s.stroke === "FREE")!.value).toBeNull();
  });

  it("ignores events with no headline meet time", () => {
    const scores = strokeRadarScores([pb(100, "FREE", "LCM", null)], "LCM", "F");
    expect(scores.find((s) => s.stroke === "FREE")!.events).toBe(0);
  });

  it("names the swimmer's strongest event in the stroke", () => {
    const base200 = baseTimeMs(200, "FREE", "LCM", "F")!;
    const free = strokeRadarScores(
      [
        pb(100, "FREE", "LCM", BASE_100_FREE_LCM_F * 2), // 125 pts
        pb(200, "FREE", "LCM", base200 * 1.25), // 512 pts — the stronger one
      ],
      "LCM",
      "F",
    ).find((s) => s.stroke === "FREE")!;
    expect(free.bestEvent).toBe("200 FREE");
  });

  it("skips an unscoreable event without dropping the whole stroke", () => {
    const scores = strokeRadarScores(
      [
        pb(25, "FREE", "LCM", 12_000), // no base time — skipped
        pb(100, "FREE", "LCM", BASE_100_FREE_LCM_F * 1.25), // 512 pts
      ],
      "LCM",
      "F",
    );
    const free = scores.find((s) => s.stroke === "FREE")!;
    expect(free.events).toBe(1);
    expect(free.value).toBeCloseTo(512, 5);
  });
});
