import { describe, expect, test } from "vitest";

import type { MeetEvent } from "@/lib/meets";
import {
  addCustomLine,
  addWhitelistLine,
  canMoveLine,
  eventOptions,
  moveLine,
  nextEventNumber,
  removeLine,
  resolveLine,
  setLineGender,
  splitLine,
  unresolveLine,
  updateLine,
  validateLines,
} from "./programmeEditing";

/*
  The programme editor's rules, checked against the real whitelist rather than
  by clicking around a drawer.
*/

function minter(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const line = (over: Partial<MeetEvent> & { rawLabel: string }): MeetEvent => over;

describe("eventOptions", () => {
  test("disables what the meet's course cannot swim rather than hiding it", () => {
    // "100 IM is short course only" is a fact about swimming; a silently
    // missing row would read as a bug in the app instead.
    const longCourse = eventOptions("LCM", "IM");
    const hundredIm = longCourse.find((o) => o.label === "100 IM");
    expect(hundredIm).toBeDefined();
    expect(hundredIm?.allowed).toBe(false);
    // Spelled the way the Details tab spells it, not in codes.
    expect(hundredIm?.reason).toBe("100 IM is short course only.");

    expect(
      eventOptions("SCM", "IM").find((o) => o.label === "100 IM")?.allowed,
    ).toBe(true);
  });

  test("offers everything while the course is still unknown", () => {
    expect(eventOptions(null, "").every((o) => o.allowed)).toBe(true);
  });

  test("searches on the event's words as well as its distance", () => {
    expect(eventOptions(null, "breast").every((o) => o.stroke === "BREAST")).toBe(true);
    expect(eventOptions(null, "1500")).toHaveLength(1);
    expect(eventOptions(null, "zzz")).toEqual([]);
  });
});

describe("nextEventNumber", () => {
  test("continues the meet's own sequence", () => {
    expect(nextEventNumber([line({ rawLabel: "a", eventNumber: 104 })])).toBe(105);
  });

  test("leaves an unnumbered programme unnumbered", () => {
    // Inventing a running order the document never stated would be a claim,
    // not a convenience.
    expect(nextEventNumber([line({ rawLabel: "a" })])).toBeUndefined();
    expect(nextEventNumber([])).toBeUndefined();
  });
});

describe("adding", () => {
  test("words a whitelisted event the way a programme would, and defaults to mixed", () => {
    const [added] = addWhitelistLine([], { distance: 100, stroke: "FREE" }, minter());
    expect(added).toMatchObject({
      id: "id-1",
      rawLabel: "Mixed 100 Free",
      gender: "MIXED",
      distance: 100,
      stroke: "FREE",
    });
  });

  test("keeps a line the whitelist has no room for, unresolved", () => {
    const [added] = addCustomLine([], "  4 x 50   Medley Relay ", minter());
    expect(added).toMatchObject({ rawLabel: "4 x 50 Medley Relay", gender: "MIXED" });
    expect(added.distance).toBeUndefined();
  });
});

describe("updateLine", () => {
  test("keeps a generated label in step with the event", () => {
    const lines = addWhitelistLine([], { distance: 100, stroke: "FREE" }, minter());
    expect(setLineGender(lines, 0, "F")[0].rawLabel).toBe("Girls 100 Free");
  });

  test("never overwrites words somebody typed", () => {
    // Once a label is the source document's own words, those words are the
    // record — re-sexing the line must not rewrite them.
    const lines = [
      line({ id: "a", rawLabel: "13-14 100 Freestyle", distance: 100, stroke: "FREE" }),
    ];
    expect(setLineGender(lines, 0, "F")[0].rawLabel).toBe("13-14 100 Freestyle");
  });

  test("clears an event number that could not be one", () => {
    const lines = [line({ id: "a", rawLabel: "x", eventNumber: 4 })];
    expect(updateLine(lines, 0, { eventNumber: undefined })[0].eventNumber).toBeUndefined();
  });

  test("leaves every other line untouched", () => {
    const lines = [line({ id: "a", rawLabel: "a" }), line({ id: "b", rawLabel: "b" })];
    expect(updateLine(lines, 0, { rawLabel: "changed" })[1]).toBe(lines[1]);
  });
});

describe("resolving", () => {
  test("refuses an event that does not exist", () => {
    // 50 IM is off the whitelist (§4.3): the programme may SAY it, but the line
    // may not claim it, because everything downstream would key on it.
    const lines = [line({ id: "a", rawLabel: "50 IM" })];
    expect(resolveLine(lines, 0, { distance: 50, stroke: "IM" })[0].distance).toBeUndefined();
  });

  test("clearing an event keeps the words and the number", () => {
    const lines = [
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 3, distance: 100, stroke: "FREE" }),
    ];
    expect(unresolveLine(lines, 0)[0]).toEqual({
      id: "a",
      rawLabel: "Mixed 100 Free",
      gender: undefined,
      eventNumber: 3,
    });
  });
});

describe("reordering and removing", () => {
  const lines = [
    line({ id: "a", rawLabel: "a" }),
    line({ id: "b", rawLabel: "b" }),
    line({ id: "c", rawLabel: "c" }),
  ];

  test("swaps neighbours", () => {
    expect(moveLine(lines, 1, -1).map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(moveLine(lines, 1, 1).map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  test("carries the event numbers with the move", () => {
    // Every read surface sorts by event number, so a move that changed only
    // array positions would appear to work and then not stick.
    const numbered = [
      line({ id: "a", rawLabel: "a", eventNumber: 1 }),
      line({ id: "b", rawLabel: "b", eventNumber: 2 }),
    ];
    const moved = moveLine(numbered, 1, -1);
    expect(moved.map((l) => l.id)).toEqual(["b", "a"]);
    expect(moved.map((l) => l.eventNumber)).toEqual([1, 2]);
  });

  test("leaves an unnumbered programme's positions as the only order", () => {
    expect(moveLine(lines, 1, -1).map((l) => l.eventNumber)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("refuses a move that could not stick", () => {
    // A numbered line and an unnumbered one cannot swap: the number decides the
    // order, one of them has not got one, and `compareMeetEvents` would hoist
    // the numbered line back above regardless of the array.
    const mixed = [
      line({ id: "a", rawLabel: "a", eventNumber: 1 }),
      line({ id: "b", rawLabel: "b" }),
    ];
    expect(canMoveLine(mixed, 0, 1)).toBe(false);
    expect(moveLine(mixed, 0, 1).map((l) => l.id)).toEqual(["a", "b"]);

    expect(canMoveLine(lines, 0, 1)).toBe(true);
    expect(canMoveLine(lines, 0, -1)).toBe(false);
    expect(canMoveLine(lines, 2, 1)).toBe(false);
  });

  test("a move off either end does nothing, rather than wrapping around", () => {
    expect(moveLine(lines, 0, -1).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(moveLine(lines, 2, 1).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  test("removes exactly one line", () => {
    expect(removeLine(lines, 1).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("splitLine", () => {
  test("puts the two races where the one was, boys keeping the id", () => {
    const lines = [
      line({ id: "before", rawLabel: "x" }),
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 4, distance: 100, stroke: "FREE" }),
      line({ id: "after", rawLabel: "y" }),
    ];
    const split = splitLine(lines, 1, minter());
    expect(split.map((l) => l.id)).toEqual(["before", "a", "id-1", "after"]);
    expect(split[1]).toMatchObject({ gender: "M", rawLabel: "Boys 100 Free", eventNumber: 4 });
    expect(split[2]).toMatchObject({ gender: "F", rawLabel: "Girls 100 Free", eventNumber: 5 });
  });

  test("shifts the rest of the programme up, so no number is claimed twice", () => {
    // Splitting event 4 inserts a 5, and event 5 already belongs to somebody.
    const lines = [
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 4, distance: 100, stroke: "FREE" }),
      line({ id: "b", rawLabel: "Mixed 50 Fly", eventNumber: 5 }),
      line({ id: "c", rawLabel: "Mixed 200 Back", eventNumber: 6 }),
    ];
    const split = splitLine(lines, 0, minter());
    expect(split.map((l) => l.eventNumber)).toEqual([4, 5, 6, 7]);
    expect(validateLines(split, null)).toBeNull();
  });
});

describe("validateLines", () => {
  test("passes a programme the server would accept", () => {
    const lines = addWhitelistLine([], { distance: 100, stroke: "FREE" }, minter());
    expect(validateLines(lines, "LCM")).toBeNull();
  });

  test("names an empty line by its event number, and says which line it is", () => {
    // "Event 104 has no name" is not actionable in a sixty-line drawer unless
    // something can take you to Event 104.
    expect(
      validateLines(
        [line({ rawLabel: "ok" }), line({ rawLabel: "  ", eventNumber: 104 })],
        null,
      ),
    ).toEqual({ message: "Event 104 has no name.", index: 1 });
  });

  test("catches half an event", () => {
    expect(
      validateLines([{ rawLabel: "x", distance: 100 } as MeetEvent], null)
        ?.message,
    ).toMatch(/half an event/);
  });

  test("refuses two events claiming the same number", () => {
    // The number IS the running order, so a duplicate leaves every read surface
    // ordering the pair arbitrarily.
    expect(
      validateLines(
        [
          line({ rawLabel: "a", eventNumber: 4 }),
          line({ rawLabel: "b", eventNumber: 4 }),
        ],
        null,
      ),
    ).toEqual({ message: expect.stringMatching(/both numbered 4/), index: 1 });
  });

  test("catches an event that cannot be swum in this meet's pool", () => {
    // Not fatal on the server, but the line would be untimeable — better heard
    // now than at the poolside.
    const lines = addWhitelistLine([], { distance: 100, stroke: "IM" }, minter());
    expect(validateLines(lines, "LCM")?.message).toMatch(
      /can't be swum in this meet's course/,
    );
    expect(validateLines(lines, "SCM")).toBeNull();
  });
});
