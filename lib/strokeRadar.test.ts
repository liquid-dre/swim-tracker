import { describe, expect, it } from "vitest";

import { RADAR_STROKES, strokeRadarScores, wrPercent } from "./strokeRadar";
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

describe("strokeRadarScores", () => {
  it("returns one score per spoke, in the fixed spoke order", () => {
    const scores = strokeRadarScores([], "LCM", "F");
    expect(scores.map((s) => s.stroke)).toEqual([...RADAR_STROKES]);
  });

  it("gives an unraced stroke null, never zero", () => {
    const scores = strokeRadarScores(
      [pb(100, "FREE", "LCM", WR_100_FREE_LCM_F * 1.3)],
      "LCM",
      "F",
    );
    const fly = scores.find((s) => s.stroke === "FLY")!;
    expect(fly.pct).toBeNull();
    expect(fly.events).toBe(0);
  });

  it("averages across a stroke's events", () => {
    const a = WR_100_FREE_LCM_F * 1.25; // 80%
    const wr200 = worldRecordMs(200, "FREE", "LCM", "F")!;
    const b = wr200 * 2; // 50%
    const free = strokeRadarScores(
      [pb(100, "FREE", "LCM", a), pb(200, "FREE", "LCM", b)],
      "LCM",
      "F",
    ).find((s) => s.stroke === "FREE")!;
    expect(free.events).toBe(2);
    expect(free.pct).toBeCloseTo((80 + 50) / 2, 5);
  });

  it("ignores the other course entirely", () => {
    const scores = strokeRadarScores(
      [pb(100, "FREE", "SCM", WR_100_FREE_LCM_F)],
      "LCM",
      "F",
    );
    expect(scores.find((s) => s.stroke === "FREE")!.pct).toBeNull();
  });

  it("ignores events with no headline meet time", () => {
    const scores = strokeRadarScores([pb(100, "FREE", "LCM", null)], "LCM", "F");
    expect(scores.find((s) => s.stroke === "FREE")!.events).toBe(0);
  });

  it("names the swimmer's strongest event in the stroke", () => {
    const wr200 = worldRecordMs(200, "FREE", "LCM", "F")!;
    const free = strokeRadarScores(
      [
        pb(100, "FREE", "LCM", WR_100_FREE_LCM_F * 2), // 50%
        pb(200, "FREE", "LCM", wr200 * 1.25), // 80% — the stronger one
      ],
      "LCM",
      "F",
    ).find((s) => s.stroke === "FREE")!;
    expect(free.bestEvent).toBe("200 FREE");
  });

  it("skips events with no world record without dropping the whole stroke", () => {
    const scores = strokeRadarScores(
      [
        pb(25, "FREE", "LCM", 12_000), // no WR — skipped
        pb(100, "FREE", "LCM", WR_100_FREE_LCM_F * 1.25), // 80%
      ],
      "LCM",
      "F",
    );
    const free = scores.find((s) => s.stroke === "FREE")!;
    expect(free.events).toBe(1);
    expect(free.pct).toBeCloseTo(80, 5);
  });
});
