import { describe, expect, test } from "vitest";

import {
  buildRawLabel,
  genderAllowsSwimmer,
  lineById,
  normaliseMeetName,
  reconcileLines,
  splitLineByGender,
  type MeetEvent,
} from "./meets";

/*
  Programme EDITING — the half of lib/meets.ts that exists because sign-ups
  point at lines.

  Line parsing has its own coverage in lib/meetImport.test.ts, against the real
  HAS programme. What is tested here is identity: that a line keeps the same id
  through the two things that happen to programmes (an edit, and a re-import
  that replaces the whole array), because that id is the only thing standing
  between a corrected PDF and a stranded sign-up.
*/

/** A deterministic id source, so a test can name the ids it expects. */
function minter(prefix = "new") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const line = (over: Partial<MeetEvent> & { rawLabel: string }): MeetEvent => over;

describe("normaliseMeetName", () => {
  test("ignores case and spacing, and nothing else", () => {
    expect(normaliseMeetName("HAS 1ST SEEDED  GALA 2026")).toBe(
      normaliseMeetName("HAS 1st Seeded Gala 2026"),
    );
    expect(normaliseMeetName("  Winter Gala\t2026 ")).toBe("winter gala 2026");
    // Punctuation is a real difference — two meets may genuinely differ by it.
    expect(normaliseMeetName("St. Mary's Gala")).not.toBe(
      normaliseMeetName("St Marys Gala"),
    );
  });
});

describe("reconcileLines", () => {
  test("mints an id for every line of a brand-new programme", () => {
    const { lines, droppedIds } = reconcileLines(
      [],
      [line({ rawLabel: "Mixed 100 Free" }), line({ rawLabel: "Mixed 50 Fly" })],
      minter(),
    );
    expect(lines.map((l) => l.id)).toEqual(["new-1", "new-2"]);
    expect(droppedIds).toEqual([]);
  });

  test("keeps the id a line already carries, so an edit never re-mints", () => {
    const existing = [line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 1 })];
    // The editor round-trips ids, so the incoming line still knows its own.
    const { lines } = reconcileLines(
      existing,
      [line({ id: "a", rawLabel: "Girls 100 Freestyle", eventNumber: 1 })],
      minter(),
    );
    expect(lines[0].id).toBe("a");
    expect(lines[0].rawLabel).toBe("Girls 100 Freestyle");
  });

  test("re-matches an import by number and label, which carry no ids", () => {
    // This is the case the whole mechanism exists for: the same programme
    // re-parsed from a corrected PDF arrives with no ids at all.
    const existing = [
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 1 }),
      line({ id: "b", rawLabel: "Mixed 50 Fly", eventNumber: 2 }),
    ];
    const { lines, droppedIds } = reconcileLines(
      existing,
      [
        line({ rawLabel: "MIXED 100  FREE", eventNumber: 1 }),
        line({ rawLabel: "Mixed 50 Fly", eventNumber: 2 }),
      ],
      minter(),
    );
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(droppedIds).toEqual([]);
  });

  test("gives two identical lines two different ids, never one", () => {
    // A programme really does repeat an event across age bands, and the parser
    // strips the band — so two lines can arrive indistinguishable. Collapsing
    // them onto one id would merge two races' sign-ups.
    const existing = [
      line({ id: "a", rawLabel: "Boys 100 Free", eventNumber: 3 }),
      line({ id: "b", rawLabel: "Boys 100 Free", eventNumber: 3 }),
    ];
    const { lines } = reconcileLines(
      existing,
      [
        line({ rawLabel: "Boys 100 Free", eventNumber: 3 }),
        line({ rawLabel: "Boys 100 Free", eventNumber: 3 }),
      ],
      minter(),
    );
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
  });

  test("reports the lines nothing claimed, so entries are never stranded silently", () => {
    const existing = [
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 1 }),
      line({ id: "b", rawLabel: "Mixed 50 Fly", eventNumber: 2 }),
    ];
    const { lines, droppedIds } = reconcileLines(
      existing,
      [
        line({ rawLabel: "Mixed 100 Free", eventNumber: 1 }),
        line({ rawLabel: "Mixed 200 Back", eventNumber: 9 }),
      ],
      minter(),
    );
    expect(lines.map((l) => l.id)).toEqual(["a", "new-1"]);
    expect(droppedIds).toEqual(["b"]);
  });

  test("does not let a stale id from elsewhere claim a line", () => {
    const { lines } = reconcileLines(
      [line({ id: "a", rawLabel: "Mixed 100 Free" })],
      [line({ id: "gone", rawLabel: "Mixed 50 Fly" })],
      minter(),
    );
    expect(lines[0].id).toBe("new-1");
  });
});

describe("buildRawLabel", () => {
  test("words a resolved line the way a programme would", () => {
    expect(buildRawLabel({ distance: 100, stroke: "FREE" })).toBe("Mixed 100 Free");
    expect(buildRawLabel({ gender: "M", distance: 200, stroke: "IM" })).toBe(
      "Boys 200 IM",
    );
    expect(buildRawLabel({ gender: "F", distance: 50, stroke: "FLY" })).toBe(
      "Girls 50 Fly",
    );
  });

  test("has nothing to say about an unresolved line", () => {
    expect(buildRawLabel({ gender: "MIXED" })).toBeNull();
  });
});

describe("splitLineByGender", () => {
  test("keeps the original id on the boys' line so its entries survive", () => {
    const [boys, girls] = splitLineByGender(
      line({ id: "a", rawLabel: "Mixed 100 Free", eventNumber: 4, distance: 100, stroke: "FREE" }),
      minter(),
    );
    expect(boys).toMatchObject({
      id: "a",
      gender: "M",
      rawLabel: "Boys 100 Free",
      eventNumber: 4,
    });
    expect(girls).toMatchObject({
      id: "new-1",
      gender: "F",
      rawLabel: "Girls 100 Free",
      eventNumber: 5,
    });
  });

  test("swaps the sex word on a line it cannot re-word from scratch", () => {
    const [boys, girls] = splitLineByGender(
      line({ id: "a", rawLabel: "Mixed 4 x 50 Medley Relay" }),
      minter(),
    );
    expect(boys.rawLabel).toBe("Boys 4 x 50 Medley Relay");
    expect(girls.rawLabel).toBe("Girls 4 x 50 Medley Relay");
    // Still unresolved — splitting a relay does not make it a swimmer's event.
    expect(boys.distance).toBeUndefined();
  });

  test("leaves a numberless line numberless rather than inventing an order", () => {
    const [, girls] = splitLineByGender(line({ id: "a", rawLabel: "Mixed 50 Back" }), minter());
    expect(girls.eventNumber).toBeUndefined();
  });
});

describe("genderAllowsSwimmer", () => {
  test("a stated sex scope admits only its own", () => {
    expect(genderAllowsSwimmer("M", "M")).toBe(true);
    expect(genderAllowsSwimmer("M", "F")).toBe(false);
    expect(genderAllowsSwimmer("F", "F")).toBe(true);
    expect(genderAllowsSwimmer("F", "M")).toBe(false);
  });

  test("mixed and unstated admit everyone", () => {
    expect(genderAllowsSwimmer("MIXED", "F")).toBe(true);
    expect(genderAllowsSwimmer(undefined, "M")).toBe(true);
  });
});

describe("lineById", () => {
  test("finds a line, and finds nothing for an id that is not there", () => {
    const events = [line({ id: "a", rawLabel: "Mixed 100 Free" })];
    expect(lineById(events, "a")?.rawLabel).toBe("Mixed 100 Free");
    expect(lineById(events, "b")).toBeNull();
    // A line written before ids shipped matches nothing, which is how the
    // pre-backfill window is refused rather than mis-linked by position.
    expect(lineById([line({ rawLabel: "Mixed 100 Free" })], "a")).toBeNull();
  });
});
