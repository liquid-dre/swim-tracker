import { describe, expect, test } from "vitest";

import { describeTally, pickEntryToFill, tallyEntriesByMeet } from "./meetEntries";

describe("tallyEntriesByMeet", () => {
  test("counts sign-ups and how many of them have a time", () => {
    const tally = tallyEntriesByMeet([
      { meetId: "a", resultId: "r1" },
      { meetId: "a" },
      { meetId: "a" },
      { meetId: "b", resultId: "r2" },
    ]);
    expect(tally.get("a")).toEqual({ entered: 3, timed: 1 });
    expect(tally.get("b")).toEqual({ entered: 1, timed: 1 });
    expect(tally.get("c")).toBeUndefined();
  });

  test("treats an explicit null link as untimed, not as a time", () => {
    // `deleteResult` clears the link, and a freed entry is a plan again.
    expect(
      tallyEntriesByMeet([{ meetId: "a", resultId: null }]).get("a"),
    ).toEqual({ entered: 1, timed: 0 });
  });
});

describe("describeTally", () => {
  test("says only the number for a meet still to come", () => {
    expect(describeTally({ entered: 18, timed: 0 }, true)).toBe("18");
  });

  test("says what is outstanding once the meet has been swum", () => {
    expect(describeTally({ entered: 18, timed: 14 }, false)).toBe("14 of 18 timed");
  });

  test("stops nagging once every time is in", () => {
    expect(describeTally({ entered: 18, timed: 18 }, false)).toBe("18");
  });

  test("says nothing at all when nobody is entered", () => {
    expect(describeTally({ entered: 0, timed: 0 }, false)).toBe("");
  });
});

describe("pickEntryToFill", () => {
  const event = { distance: 100, stroke: "FREE" };

  test("finds the sign-up a logged time belongs to", () => {
    const entry = { distance: 100, stroke: "FREE", eventNumber: 4 };
    expect(pickEntryToFill([entry], event)).toBe(entry);
  });

  test("never steals a sign-up that already has its time", () => {
    expect(
      pickEntryToFill([{ distance: 100, stroke: "FREE", resultId: "r1" }], event),
    ).toBeNull();
  });

  test("ignores a sign-up for a different event", () => {
    expect(
      pickEntryToFill([{ distance: 50, stroke: "FREE" }], event),
    ).toBeNull();
  });

  test("takes the earlier event number when the swimmer races it twice", () => {
    // Two lines resolving to the same event is the ordinary age-banded case;
    // the meet runs in event-number order, so the first one is filled first.
    const first = { distance: 100, stroke: "FREE", eventNumber: 4 };
    const later = { distance: 100, stroke: "FREE", eventNumber: 21 };
    expect(pickEntryToFill([later, first], event)).toBe(first);
  });

  test("has no answer when the swimmer was never signed up", () => {
    // A real state, not a failure: the swim shows on the meet as one nobody was
    // entered for, which is exactly what happened.
    expect(pickEntryToFill([], event)).toBeNull();
  });
});
