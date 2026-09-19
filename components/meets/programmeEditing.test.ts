import { describe, expect, test } from "vitest";

import { compareMeetEvents, type MeetEvent } from "@/lib/meets";
import {
  addCustomLine,
  addWhitelistLine,
  canMoveLine,
  countLinesByDay,
  courseMismatches,
  eventFitsCourse,
  eventOptions,
  moveLine,
  nextEventNumber,
  removeLine,
  reorderBlockedReason,
  resolveLine,
  setDayFrom,
  setLineDay,
  setLineGender,
  splitLine,
  unresolveLine,
  updateLine,
  validateLines,
} from "./programmeEditing";
import { rankedNotice } from "./ProgrammeEditor";

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

  test("numbers an unnumbered programme, because that is what an order IS", () => {
    // `compareMeetEvents` falls back to distance-and-stroke for unnumbered
    // lines and NEVER to array position, so without numbers this move would be
    // invisible on the meet page. Asking to reorder is the coach stating an
    // order, so it is honest to record one — unlike merely adding a line.
    const moved = moveLine(lines, 2, -1);
    expect(moved.map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(moved.map((l) => l.eventNumber)).toEqual([1, 2, 3]);
    // And the numbers now agree with the array, so the two orders cannot drift.
    expect([...moved].sort(compareMeetEvents).map((l) => l.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("refuses a move on a half-numbered programme", () => {
    // Half a running order is not one, and guessing which half to extend would
    // be inventing the meet's schedule.
    const mixed = [
      line({ id: "a", rawLabel: "a", eventNumber: 1 }),
      line({ id: "b", rawLabel: "b" }),
    ];
    expect(canMoveLine(mixed, 0, 1)).toBe(false);
    expect(moveLine(mixed, 0, 1).map((l) => l.id)).toEqual(["a", "b"]);
    expect(reorderBlockedReason(mixed)).toMatch(/numbered and some aren't/);
    expect(reorderBlockedReason(lines)).toBeNull();
  });

  test("a move off either end does nothing, rather than wrapping around", () => {
    expect(moveLine(lines, 0, -1).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(moveLine(lines, 2, 1).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(canMoveLine(lines, 0, -1)).toBe(false);
    expect(canMoveLine(lines, 2, 1)).toBe(false);
    expect(canMoveLine(lines, 0, 1)).toBe(true);
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
    expect(validateLines(split)).toEqual([]);
  });
});

describe("validateLines", () => {
  test("passes a programme the server would accept", () => {
    const lines = addWhitelistLine([], { distance: 100, stroke: "FREE" }, minter());
    expect(validateLines(lines)).toEqual([]);
  });

  test("names an empty line by its event number, and says which line it is", () => {
    // "Event 104 has no name" is not actionable in a sixty-line drawer unless
    // something can take you to Event 104.
    expect(
      validateLines([
        line({ rawLabel: "ok" }),
        line({ rawLabel: "  ", eventNumber: 104 }),
      ]),
    ).toEqual([{ message: "Event 104 has no name.", index: 1 }]);
  });

  test("reports every problem, not just the first", () => {
    // Eight bad lines should be one pass, not eight rounds of fix-blocked-fix.
    const problems = validateLines([
      line({ rawLabel: "" }),
      line({ rawLabel: "ok" }),
      line({ rawLabel: "" }),
    ]);
    expect(problems.map((p) => p.index)).toEqual([0, 2]);
  });

  test("catches half an event", () => {
    expect(
      validateLines([{ rawLabel: "x", distance: 100 } as MeetEvent])[0].message,
    ).toMatch(/half an event/);
  });

  test("refuses two events claiming the same number", () => {
    // The number IS the running order, so a duplicate leaves every read surface
    // ordering the pair arbitrarily.
    expect(
      validateLines([
        line({ rawLabel: "a", eventNumber: 4 }),
        line({ rawLabel: "b", eventNumber: 4 }),
      ]),
      // BOTH rows are named, because both are at fault: marking only the
      // second would leave the coach looking at one row for a problem about two.
    ).toEqual([
      { message: expect.stringMatching(/both numbered 4/), index: 0 },
      { message: expect.stringMatching(/both numbered 4/), index: 1 },
    ]);
  });

  test("counts the lines this meet's pool cannot run, without blocking", () => {
    // A warning the coach meets, rather than a rule that holds a name
    // correction hostage — and a count, because the per-line note is on a tab
    // they may not be looking at.
    const lines = addWhitelistLine([], { distance: 100, stroke: "IM" }, minter());
    expect(courseMismatches(lines, "LCM")).toEqual([0]);
    expect(courseMismatches(lines, "SCM")).toEqual([]);
    // Nothing to say while the pool is still unknown.
    expect(courseMismatches(lines, null)).toEqual([]);
  });

  test("does not block a save on a rule the server does not enforce", () => {
    // A course-incompatible line is a per-line warning, not a problem. Blocking
    // here would make a legacy programme unsaveable for ANY edit — including a
    // one-character fix to the meet's name — which the server would have
    // allowed.
    const lines = addWhitelistLine([], { distance: 100, stroke: "IM" }, minter());
    expect(validateLines(lines)).toEqual([]);
    expect(eventFitsCourse(100, "IM", "LCM")).toBe(false);
    expect(eventFitsCourse(100, "IM", "SCM")).toBe(true);
  });
});

/*
  DAYS. Which day a line is swum on is a fact about the meet's schedule, so it
  outlives the two edits most likely to take it: clearing the line's event, and
  clearing the day itself.
*/
describe("setLineDay", () => {
  const lines: MeetEvent[] = [
    { id: "a", rawLabel: "Mixed 100 Free", distance: 100, stroke: "FREE" },
    { id: "b", rawLabel: "Mixed 50 Back", distance: 50, stroke: "BACK" },
  ];

  test("puts a line on a day, and leaves its neighbours alone", () => {
    const next = setLineDay(lines, 1, 2);
    expect(next[1].day).toBe(2);
    expect(next[0]).toBe(lines[0]);
  });

  test("clearing a day REMOVES the key, rather than setting it undefined", () => {
    // Convex validates the document it is handed, and an explicit `undefined`
    // is not an omitted field.
    const next = setLineDay(setLineDay(lines, 0, 3), 0, undefined);
    expect("day" in next[0]).toBe(false);
  });
});

describe("unresolveLine", () => {
  test("keeps the day: a relay still happens on the Saturday", () => {
    const next = unresolveLine(
      [{ id: "a", rawLabel: "4 x 50 Medley Relay", distance: 50, stroke: "FREE", day: 2 }],
      0,
    );
    expect(next[0].day).toBe(2);
    expect(next[0].distance).toBeUndefined();
  });
});

describe("setDayFrom", () => {
  const lines: MeetEvent[] = [
    { id: "a", rawLabel: "Mixed 100 Free" },
    { id: "b", rawLabel: "Mixed 50 Back" },
    { id: "c", rawLabel: "Mixed 200 Fly" },
    { id: "d", rawLabel: "Mixed 400 Free" },
  ];

  test("places a three-day programme in three clicks, top down", () => {
    // The domain's own interaction: a document states "Day 2" once, above a
    // block. Setting each boundary from the top down must never need an undo.
    const placed = setDayFrom(setDayFrom(setDayFrom(lines, 0, 1), 2, 2), 3, 3);
    expect(placed.map((l) => l.day)).toEqual([1, 1, 2, 3]);
  });

  test("leaves everything above the boundary alone", () => {
    const next = setDayFrom(setDayFrom(lines, 0, 1), 2, 2);
    expect(next[0]).toEqual({ id: "a", rawLabel: "Mixed 100 Free", day: 1 });
    expect(next[1].day).toBe(1);
  });
});

describe("countLinesByDay", () => {
  test("counts each day, and everything the meet's span cannot hold", () => {
    const { byDay, unplaced } = countLinesByDay(
      [
        { rawLabel: "a", day: 1 },
        { rawLabel: "b", day: 1 },
        { rawLabel: "c", day: 2 },
        { rawLabel: "d" },
        // Day 4 of a three-day meet is unplaced, not a fourth bucket.
        { rawLabel: "e", day: 4 },
      ],
      3,
    );
    expect(byDay).toEqual([2, 1, 0]);
    expect(unplaced).toBe(2);
  });
});

/*
  The programme editor shows at most ONE message above its list. Ranking is the
  whole point of that: suppressing four notices is only a saving if what it hid
  was less urgent than what survived. An earlier pass claimed this order in a
  comment and implemented the opposite, so it is tested rather than asserted.
*/
describe("rankedNotice", () => {
  const none = {
    reorderBlocked: null,
    interleaved: false,
    mismatched: 0,
    wouldNumber: false,
    teaching: false,
  };

  test("says nothing when there is nothing to say", () => {
    expect(rankedNotice(none)).toBeNull();
  });

  test("an unexplained dead control outranks everything", () => {
    // A reorder block kills both arrows on every row and nothing else on
    // screen explains that.
    const all = {
      reorderBlocked: "Half these events have numbers.",
      interleaved: true,
      mismatched: 3,
      wouldNumber: true,
      teaching: true,
    };
    expect(rankedNotice(all)?.text).toBe("Half these events have numbers.");
  });

  test("the renumber warning outranks the mismatch, because only it is unique", () => {
    // `wouldNumber` is the sole warning that moving one row renumbers sixty.
    // The mismatch is also on the Details tab, in the tab label and on each
    // offending row, so it is the one that loses least by being suppressed.
    const both = { ...none, wouldNumber: true, mismatched: 3 };
    expect(rankedNotice(both)?.text).toContain("will number them all");
  });

  test("the mismatch outranks interleaved days, which block nothing", () => {
    // Interleaving changes how the meet page will look and nothing more; a
    // mismatched line can never take a time.
    const both = { ...none, mismatched: 3, interleaved: true };
    expect(rankedNotice(both)?.text).toContain("can't be swum in this meet's course");
  });

  test("a warning always outranks teaching", () => {
    const both = { ...none, interleaved: true, teaching: true };
    const notice = rankedNotice(both)!;
    expect(notice.tone).toBe("warn");
    expect(notice.text).toContain("appears more than once");
  });

  test("teaching is what is left when nothing is wrong", () => {
    const notice = rankedNotice({ ...none, teaching: true })!;
    expect(notice.tone).toBe("muted");
    expect(notice.text).toContain("…and below");
  });

  test("one event and many read differently", () => {
    expect(rankedNotice({ ...none, mismatched: 1 })?.text).toMatch(/^One event/);
    expect(rankedNotice({ ...none, mismatched: 4 })?.text).toMatch(/^4 events/);
  });
});
