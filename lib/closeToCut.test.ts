import { describe, it, expect } from "vitest";
import {
  CLOSE_TO_CUT_MS,
  closeToCutVerdict,
  compareCloseEvents,
  compareCloseSwimmers,
  type CloseEvent,
} from "./closeToCut";
import { uniformPb } from "./swim";

describe("closeToCutVerdict — one verdict per event, both courses", () => {
  // SANJ hardest → L2 easiest, in both courses.
  const cuts = {
    LCM: { SANJ: 58_000, LEVEL_3: 60_000, LEVEL_2: 63_000 },
    SCM: { SANJ: 56_000, LEVEL_3: 58_000, LEVEL_2: 61_000 },
  };

  it("is close inside the threshold, measured against the next gala up", () => {
    // Long course meets L3 (59.5 ≤ 60.0); 1.5s off SANJ. Short course 56.4 is
    // 0.40s off the SANJ short-course cut — the nearer course wins.
    expect(closeToCutVerdict(uniformPb({ LCM: 59_500, SCM: 56_400 }), cuts)).toEqual({
      course: "SCM",
      pbMs: 56_400,
      nextGala: "SANJ",
      gapMs: 400,
    });
  });

  it("is NOT close when the other course already meets that gala", () => {
    // Long course is 0.40s off SANJ, but short course already beats SANJ:
    // the event is qualified at the top gala, so there is nothing to chase.
    expect(closeToCutVerdict(uniformPb({ LCM: 58_400, SCM: 55_900 }), cuts)).toBeNull();
  });

  it("includes exactly one second and excludes anything beyond it", () => {
    const lcmOnly = { LCM: cuts.LCM, SCM: {} };
    expect(
      closeToCutVerdict(uniformPb({ LCM: 63_000 + CLOSE_TO_CUT_MS }), lcmOnly)?.gapMs,
    ).toBe(CLOSE_TO_CUT_MS);
    expect(
      closeToCutVerdict(uniformPb({ LCM: 63_000 + CLOSE_TO_CUT_MS + 10 }), lcmOnly),
    ).toBeNull();
  });

  it("is null with no qualifying time, or no cut at all", () => {
    expect(closeToCutVerdict(uniformPb({}), cuts)).toBeNull();
    expect(closeToCutVerdict(uniformPb({ LCM: 60_000 }), { LCM: {}, SCM: {} })).toBeNull();
  });

  it("reads each gala's own qualifying window", () => {
    // Only L2's window holds the fast swim; SANJ/L3 see nothing — so the event
    // meets L2 and is measured against L3 on the time L3's window allows.
    const pb = {
      LEVEL_2: { LCM: 60_400 },
      LEVEL_3: { LCM: 60_400 },
    };
    expect(closeToCutVerdict(pb, { LCM: cuts.LCM, SCM: {} })).toEqual({
      course: "LCM",
      pbMs: 60_400,
      nextGala: "LEVEL_3",
      gapMs: 400,
    });
  });
});

describe("close-to-cut ordering", () => {
  const ev = (distance: 50 | 100, gapMs: number): CloseEvent => ({
    distance,
    stroke: "FREE",
    label: `${distance} Free`,
    course: "LCM",
    pbMs: 60_000,
    nextGala: "LEVEL_3",
    gapMs,
  });

  it("sorts events closest first, then canonical event order", () => {
    const list = [ev(100, 500), ev(50, 900), ev(50, 500)];
    expect(list.sort(compareCloseEvents).map((e) => [e.distance, e.gapMs])).toEqual([
      [50, 500],
      [100, 500],
      [50, 900],
    ]);
  });

  it("sorts swimmers by their closest event, then name", () => {
    const list = [
      { name: "Zoe", events: [ev(50, 300)] },
      { name: "Bea", events: [ev(50, 700)] },
      { name: "Amy", events: [ev(100, 300)] },
    ];
    expect(list.sort(compareCloseSwimmers).map((s) => s.name)).toEqual([
      "Amy",
      "Zoe",
      "Bea",
    ]);
  });
});
