import { describe, expect, it } from "vitest";

import { barBandCenterY } from "./barTooltipAnchor";

// Four event rows, 40px bands starting at 0 — the shape a road/compare chart has.
const DATA = [
  { label: "50 Free" },
  { label: "100 Free" },
  { label: "200 IM" },
  { label: "1500 Free" },
];
const BANDS: Record<string, number> = {
  "50 Free": 0,
  "100 Free": 40,
  "200 IM": 80,
  "1500 Free": 120,
};

const base = {
  hasLines: false,
  data: DATA,
  barScale: (c: string) => BANDS[c],
  bandWidth: 40,
  barXAccessor: (d: Record<string, unknown>) => d.label as string,
};

describe("barBandCenterY", () => {
  it("centres on the hovered bar's band", () => {
    expect(barBandCenterY({ ...base, index: 0 })).toBe(20);
    expect(barBandCenterY({ ...base, index: 1 })).toBe(60);
  });

  it("anchors a far-down bar far down, not at the top", () => {
    // The actual reported bug: hovering 200 IM put its tooltip beside 50 Free.
    const first = barBandCenterY({ ...base, index: 0 })!;
    const later = barBandCenterY({ ...base, index: 2 })!;
    expect(later).toBe(100);
    expect(later).toBeGreaterThan(first);
  });

  it("defers to upstream when the chart has real series", () => {
    // Charts using bklit's own <Bar> already anchor correctly; overriding them
    // would move a working tooltip.
    expect(barBandCenterY({ ...base, hasLines: true, index: 2 })).toBeNull();
  });

  it("returns null rather than 0 for an unknown category", () => {
    // A stale hover mid-filter-change must not resolve to the top of the plot,
    // which is exactly the bug being fixed.
    const stale = { ...base, barScale: () => undefined };
    expect(barBandCenterY({ ...stale, index: 1 })).toBeNull();
  });

  it("returns null when the row is missing", () => {
    expect(barBandCenterY({ ...base, index: 99 })).toBeNull();
    expect(barBandCenterY({ ...base, index: undefined })).toBeNull();
  });

  it("returns null on a chart with no band scale at all", () => {
    // Time-series charts have no barScale; they must keep upstream's path.
    expect(barBandCenterY({ ...base, barScale: undefined, index: 1 })).toBeNull();
    expect(barBandCenterY({ ...base, bandWidth: undefined, index: 1 })).toBeNull();
    expect(
      barBandCenterY({ ...base, barXAccessor: undefined, index: 1 }),
    ).toBeNull();
  });

  it("scales with band width rather than assuming a fixed row height", () => {
    const tall = { ...base, bandWidth: 100 };
    expect(barBandCenterY({ ...tall, index: 0 })).toBe(50);
  });
});
