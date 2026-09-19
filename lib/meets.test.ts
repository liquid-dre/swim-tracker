import { describe, expect, test } from "vitest";

import {
  buildRawLabel,
  DAY_NOT_LISTED,
  cleanMeetDay,
  formatMeetDay,
  formatMeetDayDate,
  formatMeetDayShort,
  genderAllowsSwimmer,
  groupEventsByDay,
  groupLineIndicesByDay,
  groupLineRunsByDay,
  daysAreContiguous,
  lineById,
  meetDayCount,
  meetDayDate,
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

/*
  Programme DAYS — the half of a multi-day meet that makes sixty lines readable.

  Two rules carry everything below: a day is an INDEX into the meet's own span
  (so a re-dated meet keeps its running order), and an index the span does not
  reach is UNPLACED rather than clamped (so shortening a meet asks a person
  where its last day's events went instead of answering for them).
*/

/** A three-day gala, 28–30 November 2026 (Sat, Sun, Mon). */
const weekend = { startDate: "2026-11-28", endDate: "2026-11-30" };

describe("meetDayCount / meetDayDate", () => {
  test("a one-day meet is one day, however its end date is spelled", () => {
    expect(meetDayCount({ startDate: "2026-09-11" })).toBe(1);
    expect(meetDayCount({ startDate: "2026-09-11", endDate: null })).toBe(1);
    expect(
      meetDayCount({ startDate: "2026-09-11", endDate: "2026-09-11" }),
    ).toBe(1);
  });

  test("an inclusive span counts both ends", () => {
    expect(meetDayCount(weekend)).toBe(3);
    expect(meetDayDate(weekend, 1)).toBe("2026-11-28");
    expect(meetDayDate(weekend, 3)).toBe("2026-11-30");
  });

  test("a day the meet does not reach has no date, rather than the nearest one", () => {
    expect(meetDayDate(weekend, 4)).toBeNull();
    expect(meetDayDate(weekend, 0)).toBeNull();
    expect(meetDayDate(weekend, 1.5)).toBeNull();
  });
});

describe("cleanMeetDay", () => {
  test("keeps a real day of this meet", () => {
    expect(cleanMeetDay(1, 3)).toBe(1);
    expect(cleanMeetDay(3, 3)).toBe(3);
  });

  test("drops anything the span does not hold — never clamps it", () => {
    // Clamping would silently move a day-4 event onto the Monday, which is a
    // claim about the running order nothing in the document supports.
    expect(cleanMeetDay(4, 3)).toBeUndefined();
    expect(cleanMeetDay(0, 3)).toBeUndefined();
    expect(cleanMeetDay(-1, 3)).toBeUndefined();
    expect(cleanMeetDay(2.5, 3)).toBeUndefined();
    expect(cleanMeetDay(null, 3)).toBeUndefined();
    expect(cleanMeetDay(undefined, 3)).toBeUndefined();
  });
});

describe("formatMeetDay", () => {
  test("names the day and dates it, weekday first", () => {
    expect(formatMeetDayDate("2026-11-28")).toBe("Sat 28 Nov");
    expect(formatMeetDay(weekend, 2)).toBe("Day 2 · Sun 29 Nov");
  });

  test("a day the meet no longer reaches keeps its number and loses its date", () => {
    expect(formatMeetDay(weekend, 4)).toBe("Day 4");
    expect(formatMeetDayShort(weekend, 4)).toBe("Day 4");
  });

  test("the short form drops the date but never the day", () => {
    // Two spellings across the whole app, no more: the full one wherever there
    // is room, the short one only inside a control too narrow for it.
    expect(formatMeetDayShort(weekend, 2)).toBe("Day 2 · Sun");
  });
});

describe("groupEventsByDay", () => {
  const e = (rawLabel: string, day?: number, eventNumber?: number): MeetEvent => ({
    rawLabel,
    ...(day === undefined ? {} : { day }),
    ...(eventNumber === undefined ? {} : { eventNumber }),
  });

  test("a programme nobody has dayed is ONE unlabelled list, as it always was", () => {
    const events = [e("Mixed 100 Free", undefined, 2), e("Mixed 50 Back", undefined, 1)];
    const groups = groupEventsByDay(events, weekend);
    expect(groups).toHaveLength(1);
    expect(groups[0].day).toBeNull();
    expect(groups[0].label).toBe("");
    // Still in the meet's own running order.
    expect(groups[0].events.map((x) => x.eventNumber)).toEqual([1, 2]);
  });

  test("splits into dated sections, in day order, each in running order", () => {
    const events = [
      e("Mixed 100 Free", 2, 20),
      e("Mixed 50 Back", 1, 2),
      e("Mixed 200 IM", 1, 1),
      e("Mixed 400 Free", 3, 30),
    ];
    const groups = groupEventsByDay(events, weekend);
    expect(groups.map((g) => g.day)).toEqual([1, 2, 3]);
    expect(groups.map((g) => g.label)).toEqual([
      "Day 1 · Sat 28 Nov",
      "Day 2 · Sun 29 Nov",
      "Day 3 · Mon 30 Nov",
    ]);
    expect(groups[0].events.map((x) => x.eventNumber)).toEqual([1, 2]);
    expect(groups[0].date).toBe("2026-11-28");
  });

  test("a day the meet has lost collects in a trailing 'Day not set'", () => {
    // The gala was shortened to two days; the Monday's events must be visible
    // and re-placeable, not folded into the Sunday.
    const shortened = { startDate: "2026-11-28", endDate: "2026-11-29" };
    const groups = groupEventsByDay(
      [e("Mixed 100 Free", 1, 1), e("Mixed 400 Free", 3, 30)],
      shortened,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Day 1 · Sat 28 Nov",
      DAY_NOT_LISTED,
    ]);
    expect(groups[1].day).toBeNull();
    expect(groups[1].events.map((x) => x.rawLabel)).toEqual(["Mixed 400 Free"]);
  });

  test("a one-day meet never sections, whatever its lines claim", () => {
    const groups = groupEventsByDay(
      [e("Mixed 100 Free", 1), e("Mixed 50 Back", 2)],
      { startDate: "2026-09-11" },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].events).toHaveLength(2);
  });
});

describe("groupEventsByDay — empty days inside the placed range", () => {
  const e = (rawLabel: string, day?: number): MeetEvent => ({
    rawLabel,
    ...(day === undefined ? {} : { day }),
  });

  test("draws the days nobody listed anything on, up to the last one used", () => {
    // "Nothing is swum on the Saturday" and "nobody has said yet" look
    // identical when the Saturday simply is not drawn.
    const groups = groupEventsByDay([e("Mixed 100 Free", 2)], weekend);
    expect(groups.map((g) => g.label)).toEqual([
      "Day 1 · Sat 28 Nov",
      "Day 2 · Sun 29 Nov",
    ]);
    expect(groups[0].events).toHaveLength(0);
    expect(groups[1].events).toHaveLength(1);
  });

  test("fills a gap between two placed days", () => {
    const groups = groupEventsByDay(
      [e("Mixed 100 Free", 1), e("Mixed 50 Back", 3)],
      weekend,
    );
    expect(groups.map((g) => g.events.length)).toEqual([1, 0, 1]);
  });

  test("stops at the last placed day rather than padding to the meet's end", () => {
    // Day 3 is still being worked on, not empty.
    const groups = groupEventsByDay([e("Mixed 100 Free", 1)], weekend);
    expect(groups.map((g) => g.day)).toEqual([1]);
  });

  test("unplaced lines still trail, after the empty days", () => {
    const groups = groupEventsByDay(
      [e("Mixed 100 Free", 2), e("Mixed 50 Back")],
      weekend,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Day 1 · Sat 28 Nov",
      "Day 2 · Sun 29 Nov",
      DAY_NOT_LISTED,
    ]);
  });
});

describe("groupLineIndicesByDay", () => {
  const e = (rawLabel: string, day?: number, eventNumber?: number): MeetEvent => ({
    rawLabel,
    ...(day === undefined ? {} : { day }),
    ...(eventNumber === undefined ? {} : { eventNumber }),
  });

  test("produces the SAME bands as the read view, over positions", () => {
    // The editor bands with this and the meet page bands with
    // `groupEventsByDay`. If they ever disagree, a coach assigns days against
    // one shape and lands on another — a near-miss that looks verified.
    const lines = [e("a", 2, 20), e("b"), e("c", 1, 1)];
    const byIndex = groupLineIndicesByDay(lines, weekend);
    const byEvent = groupEventsByDay(lines, weekend);
    expect(byIndex.map((g) => g.label)).toEqual(byEvent.map((g) => g.label));
    expect(byIndex.map((g) => g.day)).toEqual(byEvent.map((g) => g.day));
    expect(byIndex.map((g) => g.indices.length)).toEqual(
      byEvent.map((g) => g.events.length),
    );
  });

  test("keeps the caller's ARRAY order inside a band, not the running order", () => {
    // The editor addresses lines by index; re-sorting them would break every
    // move, split and remove it performs.
    const lines = [e("a", 1, 9), e("b", 1, 2)];
    expect(groupLineIndicesByDay(lines, weekend)[0].indices).toEqual([0, 1]);
    // The read view, by contrast, sorts into the meet's own running order.
    expect(
      groupEventsByDay(lines, weekend)[0].events.map((x) => x.eventNumber),
    ).toEqual([2, 9]);
  });

  test("a one-day meet is one unlabelled band holding every index", () => {
    const lines = [e("a", 1), e("b")];
    const groups = groupLineIndicesByDay(lines, { startDate: "2026-09-11" });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].indices).toEqual([0, 1]);
  });
});

describe("groupLineRunsByDay / daysAreContiguous", () => {
  const e = (rawLabel: string, day?: number): MeetEvent => ({
    rawLabel,
    ...(day === undefined ? {} : { day }),
  });

  test("never reorders — a row keeps its position when its day is picked", () => {
    // The editor bands with this. Bucketing would lift line 2 out of the
    // trailing group and drop it above lines 0 and 1, out from under the finger
    // that just set it, while every "and everything below" count still
    // described the array.
    const lines = [e("a"), e("b"), e("c", 1)];
    const runs = groupLineRunsByDay(lines, weekend);
    expect(runs.flatMap((r) => r.indices)).toEqual([0, 1, 2]);
    expect(runs.map((r) => r.label)).toEqual([
      DAY_NOT_LISTED,
      "Day 1 · Sat 28 Nov",
    ]);
  });

  test("a contiguous programme bands the same as the meet page", () => {
    const lines = [e("a", 1), e("b", 1), e("c", 2), e("d", 3)];
    expect(groupLineRunsByDay(lines, weekend).map((r) => r.label)).toEqual(
      groupEventsByDay(lines, weekend).map((g) => g.label),
    );
    expect(daysAreContiguous(lines, weekend)).toBe(true);
  });

  test("an interleaved programme repeats a band, and says it is not contiguous", () => {
    // The one state where the editor and the meet page genuinely differ, so it
    // is the one state the editor warns about rather than hiding.
    const lines = [e("a", 1), e("b", 2), e("c", 1)];
    expect(groupLineRunsByDay(lines, weekend).map((r) => r.day)).toEqual([
      1, 2, 1,
    ]);
    expect(daysAreContiguous(lines, weekend)).toBe(false);
  });

  test("nothing dayed is one unlabelled run, as the read view is one group", () => {
    const lines = [e("a"), e("b")];
    const runs = groupLineRunsByDay(lines, weekend);
    expect(runs).toHaveLength(1);
    expect(runs[0].label).toBe("");
  });

  test("a one-day meet never bands", () => {
    const runs = groupLineRunsByDay([e("a", 1)], { startDate: "2026-09-11" });
    expect(runs).toHaveLength(1);
    expect(runs[0].label).toBe("");
  });
});
