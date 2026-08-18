import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/swim";
import { cutSegment, pickValueTicks } from "./geometry";
import type { CutLine } from "./GalaCutOverlay";

/*
  The two pieces of arithmetic behind the chart parts bklit does not ship.

  Both are here because getting them wrong is not a crash — it is a chart that
  quietly says something untrue: a stepped qualifying cut flattened into one
  full-width rule, or a y axis whose labels do not sit on their gridlines.
*/

// A linear stand-in for the chart's scales: 1 unit in = 1 px out, so an
// assertion reads as the value itself rather than as a pixel conversion.
const atX = (ms: number) => ms;
const atY = (ms: number) => ms;
const INNER_WIDTH = 800;

/** A dated segment: the cut that applied over one stretch of age. */
function segment(over: Partial<CutLine> = {}): CutLine {
  return {
    key: "seg",
    color: "red",
    dash: "4 3",
    y: 62_000,
    full: false,
    x1: 100,
    x2: 500,
    ...over,
  };
}

describe("cutSegment", () => {
  it("spans the whole plot for an open gala, ignoring its dates", () => {
    // SANS and SANY publish one cut for every age, so the line is not bounded by
    // a birthday — and it must not be bounded by the x1/x2 that happen to be set.
    const line = cutSegment(
      segment({ full: true, x1: 100, x2: 500 }),
      atX,
      atY,
      INNER_WIDTH,
    );
    expect(line).toEqual({ x1: 0, x2: INNER_WIDTH, y1: 62_000, y2: 62_000 });
  });

  it("draws an age-graded cut only across the stretch it applied to", () => {
    const line = cutSegment(segment(), atX, atY, INNER_WIDTH);
    expect(line).toEqual({ x1: 100, x2: 500, y1: 62_000, y2: 62_000 });
    // Horizontal: one cut, one value, for that whole stretch.
    expect(line.y1).toBe(line.y2);
  });

  it("turns a birthday into a VERTICAL riser between the two cuts", () => {
    // The step: 62.00 before the birthday, 61.00 after. The riser is what makes
    // the two dated segments read as one continuous standard.
    const line = cutSegment(
      segment({ y: 62_000, y2: 61_000, x1: 300, x2: 500 }),
      atX,
      atY,
      INNER_WIDTH,
    );
    expect(line.x1).toBe(300);
    expect(line.x2).toBe(300); // vertical — both ends at the birthday
    expect(line.y1).toBe(62_000);
    expect(line.y2).toBe(61_000);
  });

  it("keeps a riser vertical even when x2 says otherwise", () => {
    // `y2` decides the shape, not `x2`. A riser carrying a stale x2 must still be
    // vertical, or a birthday would render as a diagonal smear across the plot.
    const line = cutSegment(
      segment({ y: 62_000, y2: 61_000, x1: 300, x2: 999 }),
      atX,
      atY,
      INNER_WIDTH,
    );
    expect(line.x1).toBe(line.x2);
  });

  it("a full-width flag does not defeat a riser", () => {
    // Both set is contradictory input; the riser has to win, because collapsing
    // it to a full-width rule would draw a cut at one age across every age.
    const line = cutSegment(
      segment({ full: true, y: 62_000, y2: 61_000, x1: 300 }),
      atX,
      atY,
      INNER_WIDTH,
    );
    expect(line.x1).toBe(300);
    expect(line.x2).toBe(300);
    expect(line.y2).toBe(61_000);
  });
});

describe("pickValueTicks", () => {
  it("labels every tick when they all read differently", () => {
    const ticks = pickValueTicks([58_000, 59_000, 60_000], formatTime);
    expect(ticks.map((t) => t.label)).toEqual(["0:58:00", "0:59:00", "1:00:00"]);
    expect(ticks.map((t) => t.value)).toEqual([58_000, 59_000, 60_000]);
  });

  it("drops ticks that format identically, keeping the first", () => {
    // A tight domain makes d3 hand back values a hundredth apart; formatTime
    // renders hundredths, so several can collapse to one string. Drawing all of
    // them stacks identical labels on the same spot.
    const ticks = pickValueTicks([58_000, 58_002, 58_004, 58_010], formatTime);
    expect(ticks).toEqual([
      { value: 58_000, label: "0:58:00" },
      { value: 58_010, label: "0:58:01" },
    ]);
  });

  it("keeps the surviving label on a real tick value", () => {
    // The FIRST duplicate wins rather than an average, so the label still sits on
    // a gridline the chart actually drew.
    const ticks = pickValueTicks([58_004, 58_002, 58_000], formatTime);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].value).toBe(58_004);
  });

  it("works for any formatter, not just times", () => {
    const ticks = pickValueTicks([0, 25, 50, 75, 100], (v) => `${v}%`);
    expect(ticks.map((t) => t.label)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
  });

  it("returns nothing for an empty scale rather than a stray zero", () => {
    expect(pickValueTicks([], formatTime)).toEqual([]);
  });
});
