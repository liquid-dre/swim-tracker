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
    for (const hasEmpty of [true, false]) {
      expect(toRadixValue("", hasEmpty)).toBeTypeOf("string");
      expect(toRadixValue("LCM", hasEmpty)).toBe("LCM");
    }
  });

  test("with an empty OPTION, \"\" becomes a value Radix can match an Item to", () => {
    // Otherwise the trigger shows nothing for "Not set" / "All squads".
    expect(toRadixValue("", true)).not.toBe("");
  });

  test("with NO empty option, \"\" passes straight through so the placeholder shows", () => {
    // Radix gates the placeholder on `value === "" || value === undefined`.
    // Sending the sentinel here blanked "Choose a club" and eight others.
    expect(toRadixValue("", false)).toBe("");
  });

  test("round-trips, so the sentinel never escapes the component", () => {
    for (const hasEmpty of [true, false]) {
      for (const value of ["", "LCM", "2026-03-14", "SANJ", "__none__x"]) {
        expect(fromRadixValue(toRadixValue(value, hasEmpty))).toBe(value);
      }
    }
  });

  test("set then clear returns the empty string, not the previous choice", () => {
    // The exact sequence that showed a day the line no longer had.
    let value = "";
    value = fromRadixValue(toRadixValue("2", true));
    expect(value).toBe("2");
    value = fromRadixValue(toRadixValue("", true));
    expect(value).toBe("");
  });
});
