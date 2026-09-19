import { describe, expect, test } from "vitest";

import { normaliseDigits, parseDigits } from "@/components/log/TimeField";
import { clockFromDigits } from "@/lib/swim";

/*
  What a time field SHOWS is not what it parses.

  `parseDigits` returns `text: null` for a digit run that is well-shaped but out
  of range (`0:60:00`), because the parent needs a gate. A field bound to that
  gate empties itself the moment a coach types a sixth minute-digit wrong — in
  the same render that inks it red and says "Seconds must be 00–59", about a
  value no longer on screen. The digits stay in state, so the box looks empty
  but is not, and backspace on an empty input fires no event.

  The rule, which both TimeField and the entry roster's RowTime follow: bind the
  input to `clockFromDigits`, which always yields a clock, and use the parse
  only to decide whether to commit.
*/

/** The binding both time fields use. */
function display(digits: string): string {
  if (digits === "") return "";
  const { minutes, ss, hh } = clockFromDigits(digits);
  return `${minutes}:${ss}:${hh}`;
}

describe("a digit run is always visible, valid or not", () => {
  test.each([
    ["6000", "0:60:00"], // 60 seconds — the case that blanked the field
    ["26000", "2:60:00"], // a mistyped 2:60.00
    ["9500", "0:95:00"],
    ["997000", "99:70:00"],
  ])("out-of-range %s still renders as %s", (digits, shown) => {
    expect(parseDigits(digits).text).toBeNull(); // the gate refuses it
    expect(display(digits)).toBe(shown); // the field still shows it
  });

  test("only an empty run renders empty, so the placeholder can show", () => {
    expect(display("")).toBe("");
    expect(display(normaliseDigits("0"))).toBe("");
  });

  test.each([["3348", "0:33:48"], ["14822", "1:48:22"], ["5", "0:00:05"]])(
    "a valid run %s renders the same clock the parser accepts",
    (digits, shown) => {
      expect(display(digits)).toBe(shown);
      expect(parseDigits(digits).text).not.toBeNull();
    },
  );
});
