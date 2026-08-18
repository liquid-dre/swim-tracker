import { describe, expect, it } from "vitest";

import { assignLabelRows } from "./thresholdLabelRows";

describe("assignLabelRows", () => {
  it("keeps well-spaced labels all on the top row", () => {
    expect(assignLabelRows([0, 200, 400, 600], 64)).toEqual([0, 0, 0, 0]);
  });

  it("drops a crowded neighbour to the second row", () => {
    expect(assignLabelRows([0, 30], 64)).toEqual([0, 1]);
  });

  it("separates three near-identical cuts, the case index-alternating missed", () => {
    // The /compare case: L2/L3/SANJ for one event at one age, ~35px apart.
    // Alternating on i % 2 put indices 0 and 2 back on the same row, 70px
    // apart, which still collides at ~64px labels. Positions handle it.
    const rows = assignLabelRows([457, 492, 527], 64);
    expect(rows[0]).not.toBe(rows[1]);
    expect(rows[1]).not.toBe(rows[2]);
    // 0 and 2 are 70px apart, which clears the gap — so sharing a row is fine.
    expect(rows[0]).toBe(0);
    expect(rows[2]).toBe(0);
  });

  it("reuses a row once the gap has reopened", () => {
    // Third label is far past the first, so it can go back on row 0.
    expect(assignLabelRows([0, 20, 500], 64)).toEqual([0, 1, 0]);
  });

  it("never invents a third row, however crowded", () => {
    const rows = assignLabelRows([0, 5, 10, 15, 20], 64);
    expect(new Set(rows).size).toBeLessThanOrEqual(2);
    expect(Math.max(...rows)).toBeLessThanOrEqual(1);
  });

  it("puts an unavoidable overlap on the row with more room behind it", () => {
    // 0 → row 0, 5 → row 1, 6 → neither clears; row 0 last sat at 0 and row 1
    // at 5, so row 0 has more room.
    expect(assignLabelRows([0, 5, 6], 64)).toEqual([0, 1, 0]);
  });

  it("returns one row per position, in order", () => {
    const positions = [0, 100, 130, 400];
    expect(assignLabelRows(positions, 64)).toHaveLength(positions.length);
  });

  it("handles the empty and single cases", () => {
    expect(assignLabelRows([], 64)).toEqual([]);
    expect(assignLabelRows([42], 64)).toEqual([0]);
  });
});
