import { describe, expect, it } from "vitest";

import { squadMedianPct, type SeasonBar } from "./seasonBars";

function bar(pct: number, name = `s${pct}`): SeasonBar {
  return { swimmerId: name, name, pct, sub: "" };
}

describe("squadMedianPct", () => {
  it("returns null below two swimmers — one person has no middle", () => {
    expect(squadMedianPct([])).toBeNull();
    expect(squadMedianPct([bar(4.2)])).toBeNull();
  });

  it("takes the central value for an odd count", () => {
    expect(squadMedianPct([bar(1), bar(5), bar(3)])).toBe(3);
  });

  it("means the two central values for an even count", () => {
    expect(squadMedianPct([bar(1), bar(2), bar(4), bar(5)])).toBe(3);
  });

  it("does not depend on input order", () => {
    const asc = [bar(0.4), bar(1.1), bar(2.9), bar(8.2), bar(9.9)];
    const desc = [...asc].reverse();
    expect(squadMedianPct(desc)).toBe(squadMedianPct(asc));
  });

  it("sorts numerically, not lexicographically", () => {
    // A string sort would order these 10, 2, 9 and return 2.
    expect(squadMedianPct([bar(10), bar(2), bar(9)])).toBe(9);
  });

  it("resists the outlier that would drag a mean off the squad", () => {
    // Mean here is 8.2 — above every swimmer but one, so a mean line would
    // separate nobody. The median sits inside the pack, which is the point.
    const squad = [bar(0.5), bar(0.8), bar(1.2), bar(1.5), bar(37)];
    expect(squadMedianPct(squad)).toBe(1.2);
  });

  it("does not mutate the caller's array", () => {
    const squad = [bar(9), bar(1), bar(5)];
    squadMedianPct(squad);
    expect(squad.map((b) => b.pct)).toEqual([9, 1, 5]);
  });
});
