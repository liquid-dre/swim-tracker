import { describe, expect, it } from "vitest";
import { markFor, pivotSeries, type RowSeries } from "./progressionRows";

/*
  The pivot from "one array per swimmer" (Recharts) to "one row per date with a
  key per swimmer" (bklit).

  The risk this covers is specific: if a swimmer with no swim on some other
  swimmer's date gets a `0` or a `null` instead of NO KEY, their line dives to
  the axis floor and the chart shows a swim that never happened. Everything below
  is really one property — a gap stays a gap.
*/

function swimmer(name: string, points: Array<[number, number]>): RowSeries {
  return {
    name,
    color: `${name}-colour`,
    points: points.map(([t, timeMs]) => ({
      t,
      timeMs,
      mark: "meet" as const,
      swimType: "MEET" as const,
      isPB: false,
    })),
  };
}

const DAY = 86_400_000;

describe("pivotSeries", () => {
  it("gives each series its own positional keys", () => {
    // Positional, not name-derived: a swimmer's name can contain anything, and
    // these strings become object keys and dataKey props.
    const { keys } = pivotSeries([
      swimmer("Ava", [[0, 62_000]]),
      swimmer("O'Brien-Smith Jr.", [[0, 61_000]]),
    ]);
    expect(keys.map((k) => k.value)).toEqual(["s0", "s1"]);
    expect(keys.map((k) => k.mark)).toEqual(["s0mark", "s1mark"]);
    expect(keys.map((k) => k.name)).toEqual(["Ava", "O'Brien-Smith Jr."]);
  });

  it("merges two swimmers onto one ascending date axis", () => {
    const { rows } = pivotSeries([
      swimmer("Ava", [
        [2 * DAY, 62_000],
        [0, 63_000],
      ]),
      swimmer("Ben", [[DAY, 59_000]]),
    ]);
    expect(rows.map((r) => r.t)).toEqual([0, DAY, 2 * DAY]);
    expect(rows[0].s0).toBe(63_000);
    expect(rows[2].s0).toBe(62_000);
    expect(rows[1].s1).toBe(59_000);
  });

  it("leaves a swimmer's key ABSENT on a date they did not swim", () => {
    // The headline property. Absent — not 0, not null — because that is what
    // makes bklit's Line and our SwimDots skip the point and bridge the gap.
    const { rows } = pivotSeries([
      swimmer("Ava", [[0, 62_000]]),
      swimmer("Ben", [[DAY, 59_000]]),
    ]);
    expect(rows[0].s0).toBe(62_000);
    expect("s1" in rows[0]).toBe(false);
    expect(rows[0].s1).toBeUndefined();
    expect("s0" in rows[1]).toBe(false);
  });

  it("keeps the FASTER of two swims on the same date", () => {
    // Insertion order must not decide which time the chart draws — the PB rule
    // everywhere else in the app is "fastest wins", so it wins here too.
    const slowFirst = pivotSeries([
      swimmer("Ava", [
        [0, 63_000],
        [0, 61_000],
      ]),
    ]);
    const fastFirst = pivotSeries([
      swimmer("Ava", [
        [0, 61_000],
        [0, 63_000],
      ]),
    ]);
    expect(slowFirst.rows).toHaveLength(1);
    expect(slowFirst.rows[0].s0).toBe(61_000);
    expect(fastFirst.rows[0].s0).toBe(61_000);
  });

  it("carries the mark and tooltip fields alongside each value", () => {
    const { rows } = pivotSeries([
      {
        name: "Ava",
        color: "c",
        points: [
          {
            t: 0,
            timeMs: 62_000,
            mark: "pb",
            swimType: "MEET",
            isPB: true,
          },
        ],
      },
    ]);
    expect(rows[0].s0mark).toBe("pb");
    expect(rows[0].s0type).toBe("MEET");
    expect(rows[0].s0pb).toBe(true);
  });

  it("ships a real Date for bklit's time scale, and keeps epoch ms for our overlays", () => {
    const { rows } = pivotSeries([swimmer("Ava", [[1_700_000_000_000, 62_000]])]);
    expect(rows[0].date).toBeInstanceOf(Date);
    expect(rows[0].date.getTime()).toBe(1_700_000_000_000);
    expect(rows[0].t).toBe(1_700_000_000_000);
  });

  it("drops an unparseable date rather than planting a row at NaN", () => {
    const { rows } = pivotSeries([
      swimmer("Ava", [
        [Number.NaN, 62_000],
        [0, 61_000],
      ]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].t).toBe(0);
  });

  it("returns nothing for no series", () => {
    const { rows, keys } = pivotSeries([]);
    expect(rows).toEqual([]);
    expect(keys).toEqual([]);
  });
});

describe("markFor", () => {
  it("marks a school gala as unofficial even when it is also a PB", () => {
    // §R15: the mark's first job is to say "not an official time". A parent-entered
    // school gala wearing the PB ring would read as a verified best.
    expect(
      markFor({ swimType: "SCHOOL_GALA", isMeet: false, isPB: true }),
    ).toBe("schoolGala");
  });

  it("ranks PB above meet, and meet above trial", () => {
    expect(markFor({ swimType: "MEET", isMeet: true, isPB: true })).toBe("pb");
    expect(markFor({ swimType: "MEET", isMeet: true, isPB: false })).toBe("meet");
    expect(markFor({ swimType: "TIME_TRIAL", isMeet: false, isPB: false })).toBe(
      "trial",
    );
    expect(markFor({ swimType: "PRACTICE", isMeet: false, isPB: false })).toBe(
      "trial",
    );
  });
});
