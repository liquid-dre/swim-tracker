import { describe, expect, it } from "vitest";

import { formatDelta } from "./SwimOutcome";

/*
  `formatDelta` is the one place a millisecond gap becomes the seconds a coach
  says out loud. It used to exist twice — once in EntryRosterTable, once inlined
  in ViewerMeetEntries — and the two could have drifted without anything failing.
*/

describe("formatDelta", () => {
  it("reads a gap in seconds to two places, the way a result sheet prints it", () => {
    expect(formatDelta(1_660)).toBe("1.66s");
    expect(formatDelta(90)).toBe("0.09s");
    expect(formatDelta(0)).toBe("0.00s");
  });

  it("is unsigned — the direction is carried by the words beside it", () => {
    // The caller picks "faster" or "slower"; printing a minus here as well
    // would read as "−1.66s slower", which says the opposite of what it means.
    expect(formatDelta(-1_660)).toBe("1.66s");
  });

  it("rounds to the nearest hundredth, with toFixed's binary-float tie break", () => {
    // Worth pinning rather than assuming: an exact half like 1.005 is really
    // 1.00499… as a double, so `toFixed` gives "1.00", not "1.01". Times are
    // stored as integer ms precisely so no arithmetic depends on this — it
    // only ever affects the last digit of a displayed GAP.
    expect(formatDelta(1_234)).toBe("1.23s");
    expect(formatDelta(1_666)).toBe("1.67s");
    expect(formatDelta(1_005)).toBe("1.00s");
    expect(formatDelta(999)).toBe("1.00s");
  });
});
