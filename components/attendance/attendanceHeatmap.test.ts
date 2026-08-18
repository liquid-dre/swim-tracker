import { describe, expect, it } from "vitest";

import {
  buildHeatmapColumns,
  rateLevel,
  statusLevel,
  RATE_LEVEL_STYLES,
  seasonSummary,
  STATUS_LEVEL_STYLES,
  type HeatmapDay,
} from "./attendanceHeatmap";

function day(over: Partial<HeatmapDay> = {}): HeatmapDay {
  return { date: "2026-03-02", ratePct: null, status: null, marked: 0, ...over };
}

describe("rateLevel", () => {
  it("is empty only when nothing was marked", () => {
    expect(rateLevel(day({ marked: 0 }))).toBe(0);
  });

  it("buckets a rate into the four filled steps", () => {
    expect(rateLevel(day({ marked: 5, ratePct: 0 }))).toBe(1);
    expect(rateLevel(day({ marked: 5, ratePct: 49 }))).toBe(1);
    expect(rateLevel(day({ marked: 5, ratePct: 50 }))).toBe(2);
    expect(rateLevel(day({ marked: 5, ratePct: 74 }))).toBe(2);
    expect(rateLevel(day({ marked: 5, ratePct: 75 }))).toBe(3);
    expect(rateLevel(day({ marked: 5, ratePct: 89 }))).toBe(3);
    expect(rateLevel(day({ marked: 5, ratePct: 90 }))).toBe(4);
    expect(rateLevel(day({ marked: 5, ratePct: 100 }))).toBe(4);
  });

  it("shows an all-excused day as a session, not as empty", () => {
    // Everyone excused leaves nothing eligible to rate, but a session DID
    // happen — reading it as "no session" would hide it from the strip.
    expect(rateLevel(day({ marked: 4, ratePct: null }))).toBe(1);
  });
});

describe("statusLevel", () => {
  it("maps each status to its own level, empty when unmarked", () => {
    expect(statusLevel(day({ status: null }))).toBe(0);
    expect(statusLevel(day({ status: "ABSENT" }))).toBe(1);
    expect(statusLevel(day({ status: "EXCUSED" }))).toBe(2);
    expect(statusLevel(day({ status: "LATE" }))).toBe(3);
    expect(statusLevel(day({ status: "PRESENT" }))).toBe(4);
  });

  it("gives the four statuses four distinct levels", () => {
    const levels = (["ABSENT", "EXCUSED", "LATE", "PRESENT"] as const).map((s) =>
      statusLevel(day({ status: s })),
    );
    expect(new Set(levels).size).toBe(4);
  });
});

describe("buildHeatmapColumns", () => {
  const lvl = (d: HeatmapDay) => rateLevel(d);

  it("returns nothing for an inverted or unparseable range", () => {
    expect(buildHeatmapColumns([], "2026-03-10", "2026-03-01", lvl)).toEqual([]);
    expect(buildHeatmapColumns([], "nonsense", "2026-03-01", lvl)).toEqual([]);
  });

  it("gives every column seven bins, one per weekday", () => {
    const cols = buildHeatmapColumns([], "2026-03-01", "2026-03-28", lvl);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(c.bins).toHaveLength(7);
      expect(c.bins.map((b) => b.bin)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it("numbers columns from zero, ascending", () => {
    const cols = buildHeatmapColumns([], "2026-03-01", "2026-03-28", lvl);
    expect(cols.map((c) => c.bin)).toEqual(cols.map((_, i) => i));
  });

  it("backs the grid up to the Sunday on or before the range start", () => {
    // 2026-03-04 is a Wednesday; column 0 must still start on Sunday the 1st.
    const cols = buildHeatmapColumns([], "2026-03-04", "2026-03-20", lvl);
    const first = cols[0].bins[0].date;
    expect(first.getDay()).toBe(0);
    expect(first.getDate()).toBe(1);
  });

  it("places a day's level on its real weekday", () => {
    // 2026-03-04 is a Wednesday → bin 3.
    const cols = buildHeatmapColumns(
      [day({ date: "2026-03-04", marked: 6, ratePct: 100 })],
      "2026-03-01",
      "2026-03-07",
      lvl,
    );
    expect(cols[0].bins[3].count).toBe(4);
    expect(cols[0].bins[3].date.getDate()).toBe(4);
  });

  it("leaves days outside the range empty even when data exists for them", () => {
    // The padding days before the range start must not pick up a level.
    const cols = buildHeatmapColumns(
      [day({ date: "2026-03-02", marked: 6, ratePct: 100 })],
      "2026-03-04",
      "2026-03-14",
      lvl,
    );
    // Monday the 2nd sits in column 0, bin 1 — before the range, so empty.
    expect(cols[0].bins[1].count).toBe(0);
  });

  it("keeps every bin at midnight across a daylight-saving boundary", () => {
    // Stepping by a flat 24h drifts an hour at a DST change, which would push
    // later bins onto the wrong day. Every date must stay at midnight.
    const cols = buildHeatmapColumns([], "2026-01-01", "2026-12-31", lvl);
    for (const c of cols) {
      for (const b of c.bins) {
        expect(b.date.getHours()).toBe(0);
        expect(b.date.getMinutes()).toBe(0);
      }
    }
  });

  it("covers a full year without losing or duplicating a day", () => {
    const cols = buildHeatmapColumns([], "2026-01-01", "2026-12-31", lvl);
    const isos = cols.flatMap((c) =>
      c.bins.map((b) => `${b.date.getFullYear()}-${b.date.getMonth()}-${b.date.getDate()}`),
    );
    expect(new Set(isos).size).toBe(isos.length);
    expect(isos.length).toBe(cols.length * 7);
  });
});

describe("STATUS_LEVEL_STYLES", () => {
  /*
    The bug this guards: `heatmapLevelPatternRenderOptions` strokes the pattern
    in `patternColor` and paints the tile beneath it in `color`. Set both to the
    same token and the hatching is drawn in the tile's own colour and vanishes,
    leaving four categories told apart by hue alone — a DESIGN.md §8 violation
    that renders correctly in every unit test and only shows up on screen.
  */
  it("never strokes a pattern in its own tile colour", () => {
    for (const style of STATUS_LEVEL_STYLES) {
      if (style.fillMode !== "pattern") continue;
      expect(style.patternColor).toBeDefined();
      expect(style.patternColor).not.toBe(style.color);
    }
  });

  it("gives every patterned level a real pattern", () => {
    for (const style of STATUS_LEVEL_STYLES) {
      if (style.fillMode !== "pattern") continue;
      expect(style.pattern).toBeDefined();
      expect(style.pattern).not.toBe("none");
    }
  });

  it("distinguishes the four statuses by more than hue", () => {
    // Levels 1-4 are Absent / Excused / Late / Present. Three carry a texture;
    // Present is deliberately solid, so three distinct patterns is the bar.
    const patterns = STATUS_LEVEL_STYLES.slice(1)
      .filter((s) => s.fillMode === "pattern")
      .map((s) => s.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(patterns.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every level a distinct colour as well", () => {
    const colors = STATUS_LEVEL_STYLES.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("leaves the ordinal rate ramp unpatterned", () => {
    // The rate ramp IS ordinal, so intensity is the honest encoding and texture
    // would be noise.
    for (const style of RATE_LEVEL_STYLES) {
      expect(style.fillMode).toBe("solid");
    }
  });
});

describe("seasonSummary", () => {
  it("says so plainly when nothing is recorded", () => {
    expect(seasonSummary([], false)).toMatch(/No attendance recorded/);
    expect(seasonSummary([day({ marked: 0 })], true)).toMatch(/No attendance recorded/);
  });

  it("counts a swimmer's season by status, with late counted as attended", () => {
    const out = seasonSummary(
      [
        day({ date: "2026-01-05", marked: 1, status: "PRESENT" }),
        day({ date: "2026-01-06", marked: 1, status: "LATE" }),
        day({ date: "2026-01-07", marked: 1, status: "ABSENT" }),
        day({ date: "2026-01-08", marked: 1, status: "EXCUSED" }),
      ],
      true,
    );
    expect(out).toContain("4 session days");
    expect(out).toContain("2 attended (1 late)");
    expect(out).toContain("1 absent");
    expect(out).toContain("1 excused");
  });

  it("averages the squad rate and names the extremes", () => {
    const out = seasonSummary(
      [
        day({ date: "2026-01-05", marked: 8, ratePct: 100 }),
        day({ date: "2026-01-06", marked: 8, ratePct: 50 }),
      ],
      false,
    );
    expect(out).toContain("averaging 75% turnout");
    expect(out).toContain("best 100%");
    expect(out).toContain("worst 50%");
  });

  it("ignores unrateable days when averaging", () => {
    // An all-excused day has marks but no eligible denominator; it must not be
    // averaged in as a zero.
    const out = seasonSummary(
      [
        day({ date: "2026-01-05", marked: 4, ratePct: null }),
        day({ date: "2026-01-06", marked: 8, ratePct: 80 }),
      ],
      false,
    );
    expect(out).toContain("averaging 80% turnout");
    expect(out).toContain("2 session days");
  });
});
