import { describe, expect, it } from "vitest";

import {
  composeGreeting,
  firstNameOf,
  greetingBand,
  NEUTRAL_GREETING,
} from "./useGreeting";

// A local Date at a given hour/minute (the band reads local hours).
function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 15, hour, minute, 0, 0);
}

describe("greetingBand — local time-of-day boundaries", () => {
  it("is morning before noon, including the 11:59 edge", () => {
    expect(greetingBand(at(0, 0))).toBe("morning");
    expect(greetingBand(at(8, 30))).toBe("morning");
    expect(greetingBand(at(11, 59))).toBe("morning");
  });

  it("is afternoon from 12:00 through 16:59", () => {
    expect(greetingBand(at(12, 0))).toBe("afternoon");
    expect(greetingBand(at(15, 15))).toBe("afternoon");
    expect(greetingBand(at(16, 59))).toBe("afternoon");
  });

  it("is evening from 17:00 onward", () => {
    expect(greetingBand(at(17, 0))).toBe("evening");
    expect(greetingBand(at(21, 45))).toBe("evening");
    expect(greetingBand(at(23, 59))).toBe("evening");
  });
});

describe("firstNameOf — graceful name handling", () => {
  it("takes the first token of a full name", () => {
    expect(firstNameOf("Alex Kim")).toBe("Alex");
    expect(firstNameOf("  Bob   Smith ")).toBe("Bob");
  });

  it("returns a single-token name whole", () => {
    expect(firstNameOf("Ntando")).toBe("Ntando");
  });

  it("returns null for missing / blank names (never 'undefined')", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});

describe("composeGreeting", () => {
  it("greets by first name at the resolved band", () => {
    expect(composeGreeting("morning", "Alex Kim")).toBe("Good morning, Alex.");
    expect(composeGreeting("afternoon", "Ntando")).toBe("Good afternoon, Ntando.");
    expect(composeGreeting("evening", "Zoë Adams")).toBe("Good evening, Zoë.");
  });

  it("falls back to the neutral greeting when the band is unresolved", () => {
    expect(composeGreeting(null, "Alex")).toBe(NEUTRAL_GREETING);
  });

  it("falls back to the neutral greeting when no name is set", () => {
    expect(composeGreeting("morning", null)).toBe(NEUTRAL_GREETING);
    expect(composeGreeting("evening", undefined)).toBe(NEUTRAL_GREETING);
    expect(composeGreeting("afternoon", "  ")).toBe(NEUTRAL_GREETING);
  });
});
