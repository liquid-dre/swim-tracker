import { describe, expect, it } from "vitest";

import {
  positionsToFillPath,
  positionsToStrokePath,
  type RadarPos,
} from "./radarPaths";

const p = (x: number, y: number): RadarPos => ({ x, y });

// Five spokes, matching the stroke radar: Free, Back, Breast, Fly, IM.
const FIVE: Array<RadarPos | null> = [
  p(0, -10),
  p(10, -3),
  p(6, 8),
  p(-6, 8),
  p(-10, -3),
];

describe("positionsToFillPath", () => {
  it("closes the ring when every metric has data", () => {
    expect(positionsToFillPath(FIVE)).toBe(
      "M 0,-10 L 10,-3 L 6,8 L -6,8 L -10,-3 Z",
    );
  });

  it("closes across a gap, so the series still reads as one area", () => {
    const withGap = [...FIVE];
    withGap[2] = null;
    const d = positionsToFillPath(withGap);
    expect(d).toBe("M 0,-10 L 10,-3 L -6,8 L -10,-3 Z");
    expect(d).not.toContain("6,8 L -6,8");
  });

  it("draws nothing below three points — two enclose no area", () => {
    expect(positionsToFillPath([p(0, 0), p(1, 1), null, null, null])).toBe("");
    expect(positionsToFillPath([null, null, null, null, null])).toBe("");
  });
});

describe("positionsToStrokePath", () => {
  it("closes the outline when every metric has data", () => {
    expect(positionsToStrokePath(FIVE)).toBe(
      "M 0,-10 L 10,-3 L 6,8 L -6,8 L -10,-3 Z",
    );
  });

  it("never closes once there is a gap", () => {
    const withGap = [...FIVE];
    withGap[2] = null;
    expect(positionsToStrokePath(withGap)).not.toContain("Z");
  });

  it("treats a run wrapping past the last spoke as ONE segment", () => {
    // Gap at index 1 leaves 2,3,4,0 contiguous around the cycle. That must be a
    // single move-to, not one segment for 2-3-4 and another for 0 alone.
    const withGap = [...FIVE];
    withGap[1] = null;
    const d = positionsToStrokePath(withGap);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).toBe("M 6,8 L -6,8 L -10,-3 L 0,-10");
  });

  it("splits into two segments when two gaps separate two runs", () => {
    // Six spokes with gaps at 2 and 5 leaves runs 3-4 and 5-0 (wrapping), so
    // two move-tos. Five spokes cannot produce this: two gaps there always
    // strand a lone point, which is dropped.
    const six: Array<RadarPos | null> = [
      p(0, -10),
      p(9, -5),
      null,
      p(0, 10),
      p(-9, 5),
      null,
    ];
    const d = positionsToStrokePath(six);
    expect(d.match(/M /g)).toHaveLength(2);
    expect(d).toBe("M 0,10 L -9,5 M 0,-10 L 9,-5");
  });

  it("drops a point stranded between two gaps", () => {
    // Gaps at 1 and 3 leave spoke 2 alone; the wrapping run 4-0 is all that can
    // be stroked.
    const withGaps = [...FIVE];
    withGaps[1] = null;
    withGaps[3] = null;
    const d = positionsToStrokePath(withGaps);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).toBe("M -10,-3 L 0,-10");
  });

  it("drops a lone point rather than drawing a zero-length stroke", () => {
    // Only spoke 0 has data — there is no segment to draw, just the tick the
    // component renders on the empty spokes.
    const lone: Array<RadarPos | null> = [p(0, -10), null, null, null, null];
    expect(positionsToStrokePath(lone)).toBe("");
  });

  it("returns nothing for no metrics at all", () => {
    expect(positionsToStrokePath([])).toBe("");
    expect(positionsToStrokePath([null, null])).toBe("");
  });

  it("keeps a gap from being drawn as a point on the axis", () => {
    // The whole reason for the edit: a missing metric must not contribute a
    // coordinate at all, least of all the origin.
    const withGap = [...FIVE];
    withGap[2] = null;
    expect(positionsToStrokePath(withGap)).not.toContain("0,0");
    expect(positionsToFillPath(withGap)).not.toContain("0,0");
  });
});
