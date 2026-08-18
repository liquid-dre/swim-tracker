import { describe, expect, it } from "vitest";

import { computeSeriesPathPoints } from "../series-path-utils";

/*
  Guards a LOCAL EDIT in the vendored tree (`series-path-utils.ts`).

  Upstream coerced a missing value to `y: 0`, which in SVG is the TOP of the
  plot. On a single-series chart that never fires — every row carries that
  series' key. On the group progression chart it fired constantly: swimmers
  merge onto one shared date axis, so every date one swimmer raced and another
  did not spiked the other's line to the ceiling. Two steadily improving
  swimmers rendered as a zigzag through times nobody swam.

  Nothing but a rendered chart could catch that, which is exactly why it needs a
  test now that it has been found.
*/

const xAccessor = (d: Record<string, unknown>) => d.date as Date;
const identityX = (v: Date) => v.getTime() / 1000;
const identityY = (v: number) => v;

const ROWS = [
  { date: new Date(2026, 0, 1), a: 100, b: 200 },
  { date: new Date(2026, 0, 2), a: 90 }, // b did not race
  { date: new Date(2026, 0, 3), b: 180 }, // a did not race
  { date: new Date(2026, 0, 4), a: 80, b: 170 },
];

describe("computeSeriesPathPoints", () => {
  it("drops rows where the series has no value, rather than plotting zero", () => {
    const b = computeSeriesPathPoints(ROWS, xAccessor, identityX, identityY, "b");
    expect(b).toHaveLength(3);
    expect(b.map((p) => p.y)).toEqual([200, 180, 170]);
    // The tell: a zero would sit at the top of the plot.
    expect(b.some((p) => p.y === 0)).toBe(false);
  });

  it("keeps every row for a series present throughout", () => {
    const a = computeSeriesPathPoints(ROWS, xAccessor, identityX, identityY, "a");
    expect(a.map((p) => p.y)).toEqual([100, 90, 80]);
  });

  it("joins a series' own consecutive points across another's dates", () => {
    // 'a' is absent on Jan 3, so its path runs Jan 2 → Jan 4 directly. That is
    // the honest reading of a progression line: two of the SAME swimmer's races.
    const a = computeSeriesPathPoints(ROWS, xAccessor, identityX, identityY, "a");
    const xs = a.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    expect(a).toHaveLength(3);
  });

  it("returns nothing for a series absent from every row", () => {
    expect(computeSeriesPathPoints(ROWS, xAccessor, identityX, identityY, "z")).toEqual([]);
  });

  it("ignores non-numeric values, not just undefined ones", () => {
    const rows = [
      { date: new Date(2026, 0, 1), a: 10 },
      { date: new Date(2026, 0, 2), a: null },
      { date: new Date(2026, 0, 3), a: "12" },
      { date: new Date(2026, 0, 4), a: 8 },
    ];
    const a = computeSeriesPathPoints(rows, xAccessor, identityX, identityY, "a");
    expect(a.map((p) => p.y)).toEqual([10, 8]);
  });

  it("keys points by date so the enter interpolation can match them", () => {
    const a = computeSeriesPathPoints(ROWS, xAccessor, identityX, identityY, "a");
    expect(new Set(a.map((p) => p.key)).size).toBe(a.length);
  });
});
