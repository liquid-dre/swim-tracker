import { describe, expect, it } from "vitest";

import {
  compareCategories,
  compareGaps,
  compareLookup,
  compareOptions,
  compareRows,
  compareSeries,
  compareValues,
  type CompareSwimmer,
} from "./pointsCompare";
import type { ScoredEvent } from "@/lib/points";
import type { Stroke } from "@/lib/swim";

function scored(distance: number, stroke: Stroke, points: number): ScoredEvent {
  return {
    distance: distance as ScoredEvent["distance"],
    stroke,
    course: "LCM",
    label: `${distance} ${stroke}`,
    timeMs: 60_000,
    points,
    swimDate: "2026-03-01",
    meetName: "Autumn Gala",
  };
}

function swimmer(
  swimmerId: string,
  name: string,
  events: ScoredEvent[],
): CompareSwimmer {
  return { swimmerId, name, events };
}

const JANE = swimmer("a", "Jane", [
  scored(50, "FREE", 620),
  scored(50, "BACK", 540),
  scored(100, "FREE", 600),
]);
// Ada has no 50 Back — the gap case.
const ADA = swimmer("b", "Ada", [scored(50, "FREE", 700), scored(50, "FLY", 480)]);

describe("compareCategories", () => {
  it("varies stroke when a distance is pinned", () => {
    const cats = compareCategories("DISTANCE", 50, "LCM");
    expect(cats.map((c) => c.label)).toEqual(["Free", "Back", "Breast", "Fly"]);
  });

  it("varies distance when a stroke is pinned", () => {
    const cats = compareCategories("STROKE", "FREE", "LCM");
    expect(cats.map((c) => c.label)).toEqual([
      "50m",
      "100m",
      "200m",
      "400m",
      "800m",
      "1500m",
    ]);
  });

  it("adds IM only at the distances that swim it", () => {
    expect(compareCategories("DISTANCE", 200, "LCM").map((c) => c.stroke)).toContain("IM");
    expect(compareCategories("DISTANCE", 100, "LCM").map((c) => c.stroke)).not.toContain("IM");
    expect(compareCategories("STROKE", "IM", "LCM").map((c) => c.label)).toEqual([
      "200m",
      "400m",
    ]);
  });

  it("gives freestyle-only distances a single category rather than nothing", () => {
    expect(compareCategories("DISTANCE", 800, "LCM")).toHaveLength(1);
    expect(compareCategories("DISTANCE", 1500, "LCM")).toHaveLength(1);
    expect(compareCategories("DISTANCE", 400, "LCM").map((c) => c.stroke)).toEqual([
      "FREE",
      "IM",
    ]);
  });

  it("keys each band on the event, so two modes never collide", () => {
    expect(compareCategories("DISTANCE", 50, "LCM")[0].key).toBe("50|FREE");
    expect(compareCategories("STROKE", "FREE", "LCM")[0].key).toBe("50|FREE");
  });

  it("is empty for a course with no loaded base times", () => {
    expect(compareCategories("DISTANCE", 50, "SCM")).toEqual([]);
  });

  it("gives every category a UNIQUE label within one chart", () => {
    // The chart bands on `label`, because BarXAxis prints its accessor's value
    // verbatim. Two categories sharing a label would collapse into one band.
    const selections: Array<[Parameters<typeof compareCategories>[0], number | string]> = [
      ["DISTANCE", 50],
      ["DISTANCE", 100],
      ["DISTANCE", 200],
      ["DISTANCE", 400],
      ["DISTANCE", 800],
      ["DISTANCE", 1500],
      ["STROKE", "FREE"],
      ["STROKE", "BACK"],
      ["STROKE", "BREAST"],
      ["STROKE", "FLY"],
      ["STROKE", "IM"],
    ];
    for (const [mode, key] of selections) {
      const labels = compareCategories(
        mode,
        key as never,
        "LCM",
      ).map((c) => c.label);
      expect(new Set(labels).size, `${mode} ${key}`).toBe(labels.length);
    }
  });
});

describe("compareOptions", () => {
  it("offers every scoreable distance, thin ones included", () => {
    expect(compareOptions("DISTANCE", "LCM").map((o) => o.value)).toEqual([
      "50",
      "100",
      "200",
      "400",
      "800",
      "1500",
    ]);
  });

  it("offers every scoreable stroke in the app's order", () => {
    expect(compareOptions("STROKE", "LCM").map((o) => o.value)).toEqual([
      "FREE",
      "BACK",
      "BREAST",
      "FLY",
      "IM",
    ]);
  });

  it("never offers 25m, which World Aquatics does not score", () => {
    expect(compareOptions("DISTANCE", "LCM").map((o) => o.value)).not.toContain("25");
  });

  it("is empty for a course with no loaded base times", () => {
    expect(compareOptions("DISTANCE", "SCM")).toEqual([]);
  });
});

describe("compareSeries", () => {
  it("keys positionally, never by name", () => {
    const series = compareSeries([JANE, ADA]);
    expect(series.map((s) => s.dataKey)).toEqual(["s0", "s1"]);
  });

  it("gives two swimmers with the same name distinct keys", () => {
    const series = compareSeries([
      swimmer("a", "Jane Doe", []),
      swimmer("b", "Jane Doe", []),
    ]);
    expect(series[0].dataKey).not.toBe(series[1].dataKey);
  });

  it("assigns colour by position, so it is stable across categories", () => {
    const series = compareSeries([JANE, ADA]);
    expect(series[0].color).not.toBe(series[1].color);
    expect(compareSeries([JANE, ADA])[1].color).toBe(series[1].color);
  });

  it("keeps selection order rather than ranking by score", () => {
    // Ada outscores Jane at 50 Free, but Jane was picked first and stays first.
    expect(compareSeries([JANE, ADA]).map((s) => s.name)).toEqual(["Jane", "Ada"]);
  });

  it("does not repeat a colour within the six-swimmer cap", () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      swimmer(`id${i}`, `S${i}`, []),
    );
    const colors = compareSeries(six).map((s) => s.color);
    expect(new Set(colors).size).toBe(6);
  });
});

describe("compareRows", () => {
  const rows = compareRows([JANE, ADA], "DISTANCE", 50, "LCM");

  it("returns one row per category, in category order", () => {
    expect(rows.map((r) => r.label)).toEqual(["Free", "Back", "Breast", "Fly"]);
  });

  it("carries each swimmer's points under their own key", () => {
    expect(rows[0].s0).toBe(620); // Jane, 50 Free
    expect(rows[0].s1).toBe(700); // Ada, 50 Free
  });

  it("omits the key entirely for an unraced event — never a zero", () => {
    const back = rows[1];
    expect(back.s0).toBe(540); // Jane raced it
    expect("s1" in back).toBe(false); // Ada did not
    expect(back.s1).toBeUndefined();
  });

  it("leaves a row with no key at all when nobody raced the event", () => {
    const breast = rows[2];
    expect("s0" in breast).toBe(false);
    expect("s1" in breast).toBe(false);
  });

  it("keeps a swimmer in the same slot after another is removed", () => {
    // Ada is s1 alongside Jane; alone she becomes s0 and keeps her value.
    const alone = compareRows([ADA], "DISTANCE", 50, "LCM");
    expect(alone[0].s0).toBe(700);
    expect(rows[0].s1).toBe(700);
  });

  it("pivots the same swimmers by stroke", () => {
    const byStroke = compareRows([JANE, ADA], "STROKE", "FREE", "LCM");
    expect(byStroke.map((r) => r.label)).toEqual([
      "50m",
      "100m",
      "200m",
      "400m",
      "800m",
      "1500m",
    ]);
    expect(byStroke[0].s0).toBe(620); // Jane, 50 Free
    expect(byStroke[1].s0).toBe(600); // Jane, 100 Free
    expect("s1" in byStroke[1]).toBe(false); // Ada has no 100 Free
  });

  it("draws the single-group case rather than erroring", () => {
    const eight = compareRows([JANE, ADA], "DISTANCE", 800, "LCM");
    expect(eight).toHaveLength(1);
    expect(eight[0].label).toBe("Free");
  });

  it("is empty for a course with no loaded base times", () => {
    expect(compareRows([JANE], "DISTANCE", 50, "SCM")).toEqual([]);
  });
});

describe("compareLookup", () => {
  it("resolves the scored swim behind a bar, keyed like the rows", () => {
    const lookup = compareLookup([JANE, ADA], "DISTANCE", 50, "LCM");
    expect(lookup.get("50|FREE")?.get("s1")?.points).toBe(700);
    expect(lookup.get("50|FREE")?.get("s1")?.timeMs).toBe(60_000);
  });

  it("holds no entry where a swimmer did not race", () => {
    const lookup = compareLookup([JANE, ADA], "DISTANCE", 50, "LCM");
    expect(lookup.get("50|BACK")?.has("s0")).toBe(true);
    expect(lookup.get("50|BACK")?.has("s1")).toBe(false);
  });
});

describe("compareGaps", () => {
  it("names who has not raced what", () => {
    const gaps = compareGaps([JANE, ADA], "DISTANCE", 50, "LCM");
    const ada = gaps.find((g) => g.name === "Ada")!;
    expect(ada.missing).toContain("50 Back");
    expect(ada.missing).toContain("50 Breast");
  });

  it("lists nobody when everyone has raced everything", () => {
    const full = swimmer("c", "Full", [
      scored(50, "FREE", 600),
      scored(50, "BACK", 600),
      scored(50, "BREAST", 600),
      scored(50, "FLY", 600),
    ]);
    expect(compareGaps([full], "DISTANCE", 50, "LCM")).toEqual([]);
  });

  it("uses the app's event labels, not raw keys", () => {
    const gaps = compareGaps([ADA], "DISTANCE", 50, "LCM");
    expect(gaps[0].missing.every((m) => m.startsWith("50 "))).toBe(true);
  });
});

describe("compareValues", () => {
  it("collects every plotted point and ignores the row's own fields", () => {
    const rows = compareRows([JANE, ADA], "DISTANCE", 50, "LCM");
    expect(compareValues(rows).sort((a, b) => a - b)).toEqual([480, 540, 620, 700]);
  });

  it("is empty when nothing is plotted", () => {
    expect(compareValues([{ category: "50|FREE", label: "Free" }])).toEqual([]);
  });
});
