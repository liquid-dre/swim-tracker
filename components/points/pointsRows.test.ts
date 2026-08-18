import { describe, expect, it } from "vitest";

import {
  eventKey,
  eventLabels,
  eventsByKey,
  pointsBars,
  pointsDomain,
  POINTS_REFERENCE_LINES,
  referenceThresholds,
  strokesPresent,
  trendRows,
} from "./pointsRows";
import type { MeetPoint, ScoredEvent } from "@/lib/points";
import type { Stroke } from "@/lib/swim";

function scored(
  distance: number,
  stroke: Stroke,
  points: number,
  label = `${distance} ${stroke}`,
): ScoredEvent {
  return {
    distance: distance as ScoredEvent["distance"],
    stroke,
    course: "LCM",
    label,
    timeMs: 60_000,
    points,
    swimDate: "2026-03-01",
    meetName: "Autumn Gala",
  };
}

function meet(swimDate: string, points: number, meetName: string | null = "Gala"): MeetPoint {
  return {
    key: `${meetName ?? ""}|${swimDate}`,
    meetName,
    swimDate,
    points,
    label: "50 Free",
    timeMs: 30_000,
  };
}

describe("pointsDomain", () => {
  it("is a fixed 0–1000, so the axis means the same on every swimmer's page", () => {
    expect(pointsDomain([120, 340])).toEqual([0, 1000]);
    expect(pointsDomain([980])).toEqual([0, 1000]);
    expect(pointsDomain([])).toEqual([0, 1000]);
  });

  it("does not shrink to fit a weak swimmer — that would fake a strong one", () => {
    const junior = pointsDomain([210, 180, 240]);
    const senior = pointsDomain([880, 840, 790]);
    expect(junior).toEqual(senior);
  });

  it("grows rather than clipping a swim faster than the base time", () => {
    expect(pointsDomain([1004])).toEqual([0, 1100]);
    expect(pointsDomain([1200])).toEqual([0, 1200]);
  });
});

describe("referenceThresholds", () => {
  it("draws the three rulers inside a standard domain", () => {
    const lines = referenceThresholds([0, 1000], "#888");
    expect(lines.map((l) => l.value)).toEqual([...POINTS_REFERENCE_LINES]);
  });

  it("uses one neutral ink so they can't be mistaken for gala cuts", () => {
    const lines = referenceThresholds([0, 1000], "#888");
    for (const l of lines) {
      expect(l.color).toBe("#888");
      expect(l.ink).toBe("#888");
    }
  });

  it("labels each line with its number and nothing else", () => {
    expect(referenceThresholds([0, 1000], "#888").map((l) => l.label)).toEqual([
      "400",
      "600",
      "800",
    ]);
  });

  it("drops any line that would sit on or outside the drawn domain", () => {
    expect(referenceThresholds([0, 400], "#888")).toEqual([]);
    expect(referenceThresholds([0, 700], "#888").map((l) => l.value)).toEqual([400, 600]);
  });
});

describe("pointsBars", () => {
  const events = [scored(50, "FREE", 620), scored(200, "BREAST", 540)];

  it("keeps the order it was given — strongest first", () => {
    expect(pointsBars(events).map((b) => b.value)).toEqual([620, 540]);
  });

  it("labels every bar with its points, so no length is estimated by eye", () => {
    expect(pointsBars(events).map((b) => b.label)).toEqual(["620", "540"]);
  });

  it("colours by stroke", () => {
    const [free, breast] = pointsBars(events);
    expect(free.fill).toBe("var(--color-stroke-free)");
    expect(breast.fill).toBe("var(--color-stroke-breast)");
  });

  it("keys on the event, not the label, so a repeated label can't collapse a band", () => {
    const bars = pointsBars([
      scored(50, "FREE", 620, "50 Free"),
      scored(50, "BACK", 540, "50 Free"),
    ]);
    expect(new Set(bars.map((b) => b.category)).size).toBe(2);
  });
});

describe("eventKey lookups", () => {
  const events = [scored(50, "FREE", 620), scored(200, "BREAST", 540)];

  it("labels and rows resolve from the same key the bars use", () => {
    const key = eventKey(events[0]);
    expect(eventLabels(events).get(key)).toBe("50 FREE");
    expect(eventsByKey(events).get(key)?.points).toBe(620);
  });

  it("separates the same event in the two courses", () => {
    expect(eventKey({ distance: 100, stroke: "FREE", course: "LCM" })).not.toBe(
      eventKey({ distance: 100, stroke: "FREE", course: "SCM" }),
    );
  });
});

describe("strokesPresent", () => {
  it("lists only strokes on the chart, in the app's canonical order", () => {
    const legend = strokesPresent([
      scored(200, "IM", 400),
      scored(50, "BACK", 500),
      scored(100, "FREE", 600),
    ]);
    expect(legend.map((l) => l.stroke)).toEqual(["FREE", "BACK", "IM"]);
  });

  it("does not invent a stroke the swimmer has never raced", () => {
    const legend = strokesPresent([scored(100, "FREE", 600)]);
    expect(legend).toHaveLength(1);
  });

  it("is empty for an empty board", () => {
    expect(strokesPresent([])).toEqual([]);
  });
});

describe("trendRows", () => {
  it("sorts ascending by date regardless of input order", () => {
    const rows = trendRows([meet("2026-06-01", 500), meet("2026-01-01", 400, "Jan")]);
    expect(rows.map((r) => r.points)).toEqual([400, 500]);
  });

  it("gives bklit a real Date for the time axis, and epoch ms alongside", () => {
    const [row] = trendRows([meet("2026-03-01", 500)]);
    expect(row.date).toBeInstanceOf(Date);
    expect(row.t).toBe(Date.parse("2026-03-01T00:00:00Z"));
    expect(row.date.getTime()).toBe(row.t);
  });

  it("carries the meet, date and event behind the number, for the tooltip", () => {
    const [row] = trendRows([meet("2026-03-01", 500, "Autumn Gala")]);
    expect(row.meetName).toBe("Autumn Gala");
    expect(row.swimDate).toBe("2026-03-01");
    expect(row.label).toBe("50 Free");
    expect(row.timeMs).toBe(30_000);
  });

  it("keeps the real meet date even when a same-day collision nudges the axis", () => {
    const rows = trendRows([meet("2026-03-01", 500, "A"), meet("2026-03-01", 600, "B")]);
    // The axis position moves so both dots are visible; the DATE must not.
    expect(rows.map((r) => r.swimDate)).toEqual(["2026-03-01", "2026-03-01"]);
  });

  it("nudges two meets on the same day apart rather than colliding them", () => {
    const rows = trendRows([meet("2026-03-01", 500, "A"), meet("2026-03-01", 600, "B")]);
    expect(rows).toHaveLength(2);
    expect(rows[1].t).toBeGreaterThan(rows[0].t);
  });

  it("keeps the axis strictly increasing across three same-day meets", () => {
    const rows = trendRows([
      meet("2026-03-01", 1, "A"),
      meet("2026-03-01", 2, "B"),
      meet("2026-03-01", 3, "C"),
    ]);
    const ts = rows.map((r) => r.t);
    expect(ts[0]).toBeLessThan(ts[1]);
    expect(ts[1]).toBeLessThan(ts[2]);
  });

  it("drops a row with an unparseable date rather than plotting it at zero", () => {
    expect(trendRows([meet("not-a-date", 500)])).toEqual([]);
  });

  it("is empty for a swimmer with no meets", () => {
    expect(trendRows([])).toEqual([]);
  });
});
