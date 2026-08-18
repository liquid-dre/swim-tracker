import { describe, expect, it } from "vitest";

import { buildRingScale } from "@/lib/swim";
import { byEventOrder, ringZoneBands } from "./roadBars";

// A 13-year-old's wheel: L2 (ring 1), L3 (ring 2), SANJ (ring 3), max 3.5.
const AGE_GRADED = buildRingScale(["LEVEL_2", "LEVEL_3", "SANJ"]);

describe("ringZoneBands", () => {
  it("tints each present gala's run-up, then neutral headroom", () => {
    const bands = ringZoneBands(["LEVEL_2", "LEVEL_3", "SANJ"], AGE_GRADED);
    expect(bands).toEqual([
      { from: 0, to: 1, gala: "LEVEL_2" },
      { from: 1, to: 2, gala: "LEVEL_3" },
      { from: 2, to: 3, gala: "SANJ" },
      { from: 3, to: AGE_GRADED.max, gala: null },
    ]);
  });

  it("leaves a missing gala's range as neutral track, never a borrowed tint", () => {
    // A 50 has no L3 or SANJ cut (§4.9). Its band must stop at L2 and the rest
    // must be headroom — tinting up to ring 3 would draw a SANJ zone that does
    // not exist for this event.
    const bands = ringZoneBands(["LEVEL_2"], AGE_GRADED);
    expect(bands).toEqual([
      { from: 0, to: 1, gala: "LEVEL_2" },
      { from: 1, to: AGE_GRADED.max, gala: null },
    ]);
    expect(bands.some((b) => b.gala === "SANJ")).toBe(false);
  });

  it("keeps the shared ring positions when inner galas are absent", () => {
    // A 200 Fly with no L2 cut still anchors SANJ at ring 3 — positions are a
    // property of the scale, not of which cuts this event happens to carry, or
    // bars would stop being comparable across events.
    const bands = ringZoneBands(["LEVEL_3", "SANJ"], AGE_GRADED);
    expect(bands[0]).toEqual({ from: 0, to: 2, gala: "LEVEL_3" });
    expect(bands[1]).toEqual({ from: 2, to: 3, gala: "SANJ" });
  });

  it("ignores a cut for a gala that is not on this swimmer's scale", () => {
    // SANS is not enterable at 13, so a SANS cut must not add a fourth band.
    const bands = ringZoneBands(["LEVEL_2", "SANS"], AGE_GRADED);
    expect(bands.map((b) => b.gala)).toEqual(["LEVEL_2", null]);
  });

  it("returns nothing for an empty scale", () => {
    expect(ringZoneBands(["SANJ"], buildRingScale([]))).toEqual([]);
  });

  it("emits no bands at all when the event has no cuts, just headroom", () => {
    expect(ringZoneBands([], AGE_GRADED)).toEqual([
      { from: 0, to: AGE_GRADED.max, gala: null },
    ]);
  });
});

describe("byEventOrder", () => {
  it("sorts by distance first, numerically", () => {
    const keys = ["200|FREE", "50|FREE", "1500|FREE", "100|FREE"];
    expect(keys.map((key) => ({ key })).sort(byEventOrder).map((b) => b.key)).toEqual([
      "50|FREE",
      "100|FREE",
      "200|FREE",
      "1500|FREE",
    ]);
  });

  it("orders strokes IM, Free, Back, Breast, Fly within a distance", () => {
    const keys = ["100|FLY", "100|IM", "100|BACK", "100|FREE", "100|BREAST"];
    expect(keys.map((key) => ({ key })).sort(byEventOrder).map((b) => b.key)).toEqual([
      "100|IM",
      "100|FREE",
      "100|BACK",
      "100|BREAST",
      "100|FLY",
    ]);
  });
});
