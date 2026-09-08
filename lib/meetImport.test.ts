import { describe, expect, it } from "vitest";

import { parseMeetProgramme, parsePrintedDate, statedCourse } from "./meetImport";
import {
  compareMeetEvents,
  formatMeetDates,
  isUpcoming,
  meetDates,
  meetEventLabel,
  meetOverlapsRange,
  parseProgrammeLine,
} from "./meets";

/*
  The meet-programme parser (§R19).

  `HAS_PROGRAMME` below is the ACTUAL text of the HAS 1st Seeded Gala 2026 event
  list, exactly as `lib/pdfText.ts` reassembles it from that PDF's content
  stream — including the printer banner and the two-column headings. It is the
  regression anchor: if the parser ever stops reading this real document, or
  starts reading the banner's PRINT date as the meet date, CI says so.
*/

const HAS_PROGRAMME = `Les Brown Pool - Zimbabwe Aquatic Union - Site License
HY-TEK's MEET MANAGER 8.0 - 1/9/2026 Page 1
HAS 1ST SEEDED GALA 2026 - 11/9/2026
Event List-By Event Number
Event # Event Name Event # Event Name
101 Mixed 100 Freestyle
103 Mixed 100 Breaststroke
104 Mixed 50 Freestyle
105 Mixed 200 IM
106 Mixed 100 Butterfly
107 Mixed 200 Breaststroke
108 Mixed 100 Backstroke
109 Mixed 400 Freestyle`;

describe("parseMeetProgramme — the real HAS programme", () => {
  const draft = parseMeetProgramme(HAS_PROGRAMME);

  it("reads the meet's own name, verbatim", () => {
    expect(draft.name).toBe("HAS 1ST SEEDED GALA 2026");
  });

  it("reads the meet date day-first, not the banner's print date", () => {
    // 11/9/2026 is the meet; 1/9/2026 is when the report was printed. Reading
    // the banner would date the whole gala ten days early.
    expect(draft.startDate).toBe("2026-09-11");
  });

  it("takes the venue from the pool line, not the whole licence string", () => {
    expect(draft.venue).toBe("Les Brown Pool");
  });

  it("reads all eight events, and only those", () => {
    expect(draft.events).toHaveLength(8);
    expect(draft.events.map((e) => e.eventNumber)).toEqual([
      101, 103, 104, 105, 106, 107, 108, 109,
    ]);
  });

  it("resolves every line to a real event", () => {
    for (const event of draft.events) {
      expect(event.distance).toBeDefined();
      expect(event.stroke).toBeDefined();
      expect(event.gender).toBe("MIXED");
    }
    expect(draft.events.map(meetEventLabel)).toEqual([
      "100 Free",
      "100 Breast",
      "50 Free",
      "200 IM",
      "100 Fly",
      "200 Breast",
      "100 Back",
      "400 Free",
    ]);
  });

  it("keeps each line's own words alongside the resolved event", () => {
    expect(draft.events[0].rawLabel).toBe("Mixed 100 Freestyle");
    expect(draft.events[3].rawLabel).toBe("Mixed 200 IM");
  });

  it("says out loud that 11/9 could also have meant 9 November", () => {
    // Both halves are ≤ 12, so this printed date genuinely has two readings. We
    // take the regional one (day-first) AND say we did, so the super-user sees
    // the choice rather than inheriting it. Every event resolved, so this is the
    // only thing flagged.
    expect(draft.warnings).toHaveLength(1);
    expect(draft.warnings[0]).toContain("ambiguous");
    expect(draft.warnings[0]).toContain("2026-09-11");
  });

  it("does not silently swallow the column headings", () => {
    // The heading row is page furniture, not a skipped event, so it is neither
    // imported nor reported as a loss.
    expect(draft.skipped).toEqual([]);
  });
});

describe("parsePrintedDate", () => {
  it("reads day-first", () => {
    expect(parsePrintedDate("11/9/2026")?.iso).toBe("2026-09-11");
    expect(parsePrintedDate("28/11/2026")?.iso).toBe("2026-11-28");
  });

  it("flags a genuinely ambiguous date rather than choosing silently", () => {
    // 9/11/2026 could be 9 Nov or 11 Sep. We read day-first AND say so.
    expect(parsePrintedDate("9/11/2026")).toEqual({
      iso: "2026-11-09",
      ambiguous: true,
    });
    // 28/11 cannot be a month, so there is nothing to flag.
    expect(parsePrintedDate("28/11/2026")?.ambiguous).toBe(false);
  });

  it("prefers an unambiguous ISO date when one is present", () => {
    expect(parsePrintedDate("Gala 2026-09-11")).toEqual({
      iso: "2026-09-11",
      ambiguous: false,
    });
  });

  it("refuses a date that is not real", () => {
    expect(parsePrintedDate("31/2/2026")).toBeNull();
    expect(parsePrintedDate("11/13/2026")).toBeNull();
    expect(parsePrintedDate("11/9/1899")).toBeNull();
    expect(parsePrintedDate("no date here")).toBeNull();
  });
});

describe("parseProgrammeLine", () => {
  it("resolves the strokes a programme actually prints", () => {
    expect(parseProgrammeLine("Mixed 100 Butterfly")).toMatchObject({
      distance: 100,
      stroke: "FLY",
      gender: "MIXED",
    });
    expect(parseProgrammeLine("Girls 200 Individual Medley")).toMatchObject({
      distance: 200,
      stroke: "IM",
      gender: "F",
    });
    expect(parseProgrammeLine("Boys 50 Back")).toMatchObject({
      distance: 50,
      stroke: "BACK",
      gender: "M",
    });
    expect(parseProgrammeLine("Women's 800 Free")).toMatchObject({
      distance: 800,
      stroke: "FREE",
      gender: "F",
    });
  });

  it("ignores an age band when finding the distance", () => {
    // Without stripping the band, "11-12" would read 11 as a distance candidate
    // (it isn't a racing distance) or, worse, "13-14 400 Free" could confuse.
    expect(parseProgrammeLine("Boys 11-12 100 Freestyle")).toMatchObject({
      distance: 100,
      stroke: "FREE",
    });
    expect(parseProgrammeLine("Girls 13 & over 200 Back")).toMatchObject({
      distance: 200,
      stroke: "BACK",
    });
  });

  it("keeps a relay on the programme but never resolves it to an event", () => {
    // A relay time belongs to a team, not a swimmer, so giving it an event
    // identity would let it into per-swimmer comparisons it must never enter.
    const relay = parseProgrammeLine("Mixed 4x50 Free Relay", 110);
    expect(relay).toMatchObject({ rawLabel: "Mixed 4x50 Free Relay", eventNumber: 110 });
    expect(relay?.distance).toBeUndefined();
    expect(relay?.stroke).toBeUndefined();
  });

  it("keeps an off-whitelist event by name, without an event identity", () => {
    // 50 IM is not a real event in this app (§4.3) — but if a meet runs one, the
    // programme still says so, and hiding it would misrepresent the meet.
    const im = parseProgrammeLine("Mixed 50 IM");
    expect(im?.rawLabel).toBe("Mixed 50 IM");
    expect(im?.distance).toBeUndefined();
  });

  it("resolves 25 m and 100 IM, which are real events with no cut", () => {
    // Coverage ("no gala has a cut for this") is a different fact from
    // "this is not an event". Both of these are real SCM events.
    expect(parseProgrammeLine("Boys 25 Freestyle")).toMatchObject({
      distance: 25,
      stroke: "FREE",
    });
    expect(parseProgrammeLine("Mixed 100 IM")).toMatchObject({
      distance: 100,
      stroke: "IM",
    });
  });

  it("returns null only for an empty line", () => {
    expect(parseProgrammeLine("   ")).toBeNull();
    expect(parseProgrammeLine("Diving")).not.toBeNull();
  });
});

describe("an age band never becomes a distance", () => {
  it("a spreadsheet's age column is stripped before the distance is read", () => {
    // The hazard a four-column programme creates: the age group and the distance
    // are both bare numbers, and the age comes first.
    expect(parseProgrammeLine("Boys 25 years 100 Free")).toMatchObject({
      distance: 100,
      stroke: "FREE",
    });
    expect(parseProgrammeLine("Girls 9/U years 25 Freestyle")).toMatchObject({
      distance: 25,
      stroke: "FREE",
    });
    expect(parseProgrammeLine("Boys 50 yrs 200 Breaststroke")).toMatchObject({
      distance: 200,
      stroke: "BREAST",
    });
  });
  it("the bands it already read still work", () => {
    expect(parseProgrammeLine("Girls 11-12 100 Free")).toMatchObject({ distance: 100 });
    expect(parseProgrammeLine("Boys 10&U 50 Back")).toMatchObject({ distance: 50 });
  });
});

describe("parseMeetProgramme — other inputs", () => {
  it("reads a CSV of event number and name", () => {
    const draft = parseMeetProgramme(
      ["eventNumber,event", "1,Girls 100 Free", "2,Boys 100 Free"].join("\n"),
    );
    expect(draft.events.map((e) => e.eventNumber)).toEqual([1, 2]);
    expect(draft.events[0].gender).toBe("F");
  });

  it("reads a bare list with no event numbers at all", () => {
    const draft = parseMeetProgramme("Mixed 100 Free\nMixed 200 IM");
    expect(draft.events).toHaveLength(2);
    expect(draft.events[0].eventNumber).toBeUndefined();
  });

  it("ignores a repeated event number instead of stacking a duplicate", () => {
    const draft = parseMeetProgramme(
      "101 Mixed 100 Freestyle\n101 Mixed 100 Freestyle",
    );
    expect(draft.events).toHaveLength(1);
    expect(draft.skipped).toHaveLength(1);
    expect(draft.skipped[0].reason).toContain("duplicate");
  });

  it("says so when it found no date, rather than inventing one", () => {
    const draft = parseMeetProgramme("101 Mixed 100 Freestyle");
    expect(draft.startDate).toBeNull();
    expect(draft.warnings.join(" ")).toContain("No date found");
  });

  it("reports a line it set aside, so nothing disappears silently", () => {
    const draft = parseMeetProgramme(
      "Warm-up from 07:00\n101 Mixed 100 Freestyle",
    );
    expect(draft.events).toHaveLength(1);
    expect(draft.skipped.map((s) => s.text)).toContain("Warm-up from 07:00");
  });

  it("warns when part of the programme could not be resolved", () => {
    const draft = parseMeetProgramme(
      "101 Mixed 100 Freestyle\n102 Mixed 4x50 Free Relay",
    );
    expect(draft.events).toHaveLength(2);
    expect(draft.warnings.join(" ")).toContain("1 event");
  });

  it("returns an empty draft for empty input", () => {
    const draft = parseMeetProgramme("");
    expect(draft.events).toEqual([]);
    expect(draft.warnings.join(" ")).toContain("No events");
  });
});

describe("statedCourse", () => {
  it("reads a course a document states in words", () => {
    expect(statedCourse("1st Junior Gala\nShort Course")?.course).toBe("SCM");
    expect(statedCourse("Long Course Championships")?.course).toBe("LCM");
    expect(statedCourse("Held in the 25m pool")?.course).toBe("SCM");
  });
  it("says nothing when the document says nothing, or says both", () => {
    expect(statedCourse("HAS 1st Seeded Gala - 11/9/2026")).toBeNull();
    // A 50 m event on a line is not a statement about the pool.
    expect(statedCourse("101 Mixed 50 Freestyle")).toBeNull();
    expect(statedCourse("Short course day 1, long course day 2")).toBeNull();
  });
});

describe("a spreadsheet-shaped programme", () => {
  // What `lib/sheetText.ts` hands over: one tab-separated line per row.
  const TEXT = [
    "1st Junior Gala",
    "Short Course",
    "Event #\tAge Group\tDistance\tEvent",
    "1\tBoys 11 years\t50\tBackstroke",
    "2\tGirls 9/U years\t25\tFreestyle",
    "3\tMixed 11 years\t100\tFreestyle relay",
  ].join("\n");

  it("reads a column layout as numbered programme lines", () => {
    const draft = parseMeetProgramme(TEXT);
    expect(draft.events.map((e) => [e.eventNumber, e.distance, e.stroke])).toEqual([
      [1, 50, "BACK"],
      [2, 25, "FREE"],
      [3, undefined, undefined], // a relay never resolves
    ]);
  });

  it("reports the course the file states without ever setting it", () => {
    const draft = parseMeetProgramme(TEXT);
    expect(draft.warnings.join(" ")).toContain("Short Course");
    // The draft carries no course of its own — the person confirming decides.
    expect(Object.keys(draft)).not.toContain("course");
  });

  it("treats the spreadsheet's column heading row as furniture", () => {
    const draft = parseMeetProgramme(TEXT);
    expect(draft.skipped.map((k) => k.text)).not.toContain(
      "Event #\tAge Group\tDistance\tEvent",
    );
  });
});

describe("meet dates", () => {
  it("gives a single-day meet exactly one date", () => {
    expect(meetDates({ startDate: "2026-09-11" })).toEqual(["2026-09-11"]);
    expect(meetDates({ startDate: "2026-09-11", endDate: null })).toEqual([
      "2026-09-11",
    ]);
  });

  it("spans every day of a multi-day meet", () => {
    expect(
      meetDates({ startDate: "2026-11-28", endDate: "2026-11-30" }),
    ).toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]);
  });

  it("crosses a month boundary", () => {
    expect(
      meetDates({ startDate: "2026-10-31", endDate: "2026-11-02" }),
    ).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("overlaps a range on any of its days, not only its first", () => {
    const meet = { startDate: "2026-10-31", endDate: "2026-11-02" };
    // The month of November contains only the meet's TAIL — it must still show.
    expect(meetOverlapsRange(meet, "2026-11-01", "2026-11-30")).toBe(true);
    expect(meetOverlapsRange(meet, "2026-10-01", "2026-10-31")).toBe(true);
    expect(meetOverlapsRange(meet, "2026-12-01", "2026-12-31")).toBe(false);
  });

  it("counts a meet as upcoming until its LAST day is past", () => {
    const meet = { startDate: "2026-11-28", endDate: "2026-11-30" };
    expect(isUpcoming(meet, "2026-11-29")).toBe(true); // mid-meet
    expect(isUpcoming(meet, "2026-11-30")).toBe(true); // final day
    expect(isUpcoming(meet, "2026-12-01")).toBe(false);
  });

  it("formats dates without repeating the month or year", () => {
    expect(formatMeetDates({ startDate: "2026-09-11" })).toBe("11 Sep 2026");
    expect(
      formatMeetDates({ startDate: "2026-11-28", endDate: "2026-11-30" }),
    ).toBe("28–30 Nov 2026");
    expect(
      formatMeetDates({ startDate: "2026-10-31", endDate: "2026-11-02" }),
    ).toBe("31 Oct – 2 Nov 2026");
    expect(
      formatMeetDates({ startDate: "2026-12-30", endDate: "2027-01-02" }),
    ).toBe("30 Dec 2026 – 2 Jan 2027");
  });
});

describe("compareMeetEvents", () => {
  it("keeps the meet's own running order when it numbers its events", () => {
    const events = [
      { rawLabel: "b", eventNumber: 105 },
      { rawLabel: "a", eventNumber: 101 },
    ];
    expect([...events].sort(compareMeetEvents).map((e) => e.rawLabel)).toEqual([
      "a",
      "b",
    ]);
  });

  it("falls back to canonical event order when there are no numbers", () => {
    const events = [
      { rawLabel: "200 IM", distance: 200 as const, stroke: "IM" as const },
      { rawLabel: "50 Free", distance: 50 as const, stroke: "FREE" as const },
    ];
    expect([...events].sort(compareMeetEvents).map((e) => e.rawLabel)).toEqual([
      "50 Free",
      "200 IM",
    ]);
  });
});
