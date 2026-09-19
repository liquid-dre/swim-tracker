import { describe, expect, test } from "vitest";

import { fromRadixValue, toRadixValue } from "./Select";

/*
  Radix decides controlled-vs-uncontrolled by `prop !== undefined`. Passing
  `value || undefined` for an empty selection therefore flipped the component to
  uncontrolled on every clear, and Radix fell back to the stale value it had
  stored while uncontrolled: pick Day 2, pick "Not listed", and the trigger
  still read "Day 2" while the data said none.

  These lock the mapping that keeps it controlled for its whole life.
*/
describe("Select's empty-value sentinel", () => {
  test("never hands Radix undefined, whatever the caller's value", () => {
    expect(toRadixValue("")).not.toBe("");
    expect(toRadixValue("")).toBeTypeOf("string");
    expect(toRadixValue("LCM")).toBe("LCM");
  });

  test("round-trips, so the sentinel never escapes the component", () => {
    for (const value of ["", "LCM", "2026-03-14", "SANJ", "__none__x"]) {
      expect(fromRadixValue(toRadixValue(value))).toBe(value);
    }
  });

  test("set then clear returns the empty string, not the previous choice", () => {
    // The exact sequence that showed a day the line no longer had.
    let value = "";
    value = fromRadixValue(toRadixValue("2"));
    expect(value).toBe("2");
    value = fromRadixValue(toRadixValue(""));
    expect(value).toBe("");
  });
});
