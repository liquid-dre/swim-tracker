import { describe, expect, it } from "vitest";

import {
  parseMeetProgramme,
  parseMeetWorkbook,
  parsePrintedDate,
  parsePrintedTime,
  statedCourse,
} from "./meetImport";
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

// ---------------------------------------------------------------------------
// A whole season in one workbook (§R19)
// ---------------------------------------------------------------------------
//
// The real input this was built for: "HAS 2026-2027 Seeded and Junior League
// Galas", two sheets and twelve dated fixtures, as `lib/sheetText.ts` hands it
// over — one tab-separated line per row, empty cells collapsed rather than
// padded (so column POSITION is not recoverable and never relied on).

const SEASON_WORKBOOK = [
  "Gala\tDate\tTime\tVenue\tEvent No.\tEvent",
  "1st Seeded Gala\tFriday, 11 September 2026\t6:00 PM\tLes Brown",
  "1\t50m Butterfly",
  "2\t100m Breaststroke",
  "3\t400m Freestyle",
  "2nd Seeded Gala\tSunday, 27 September 2026\t8:00 AM\tLes Brown",
  "1\t200m Freestyle",
  "2\t800m Freestyle",
  "Gala\tDate\tTime\tVenue\tEvent No.\tAge Group\tDistance\tStroke / Event",
  "1st Junior League\tSunday, 13 September 2026\t9:00 AM\tHIS",
  "1\tBoys 11 Years\t50m\tBackstroke",
  "2\tGirls 10 Years\t25m\tButterfly",
  "3\tBoys 8 & 9 Years\t25m\tFreestyle",
  "4\t9, 10, 11 Years\t100m\tBreaststroke",
  "5\tMixed Circle\t100m\tIndividual Medley",
  "6\tMixed 11 Years\t100m\tFreestyle Relay",
  "6th Junior League\tSunday, 7 February 2027\t9:00 AM\tLes Brown",
].join("\n");

describe("parseMeetWorkbook — a season in one file", () => {
  const drafts = parseMeetWorkbook(SEASON_WORKBOOK);

  it("finds every dated fixture, not just the first", () => {
    expect(drafts.map((d) => d.name)).toEqual([
      "1st Seeded Gala",
      "2nd Seeded Gala",
      "1st Junior League",
      "6th Junior League",
    ]);
  });

  it("reads a written date, weekday and all", () => {
    // `parsePrintedDate` used to read only ISO and 11/9/2026; a club programme
    // spells the month out, and nothing parsed at all before this.
    expect(drafts.map((d) => d.startDate)).toEqual([
      "2026-09-11",
      "2026-09-27",
      "2026-09-13",
      "2027-02-07",
    ]);
  });

  it("keeps the name clean of the weekday it sits beside", () => {
    // The weekday is part of the DATE match, so "Friday," never lands in the
    // meet's title.
    expect(drafts[0].name).toBe("1st Seeded Gala");
  });

  it("reads the start time as 24-hour, and the venue positionally", () => {
    // Venue is taken as the text AFTER the date, not by keyword: the real
    // venues are "Les Brown" and "HIS", neither of which says "pool".
    expect(drafts[0].startTime).toBe("18:00");
    expect(drafts[0].venue).toBe("Les Brown");
    expect(drafts[1].startTime).toBe("08:00");
    expect(drafts[2].venue).toBe("HIS");
  });

  it("numbers events PER MEET, so the second fixture is not read as duplicates", () => {
    // The bug this guards: `seenNumbers` used to be document-wide, and twelve
    // meets each numbering from 1 would discard eleven programmes entirely.
    expect(drafts[0].events.map((e) => e.eventNumber)).toEqual([1, 2, 3]);
    expect(drafts[1].events.map((e) => e.eventNumber)).toEqual([1, 2]);
    expect(drafts[1].events).toHaveLength(2);
  });

  it("resolves a four-column junior-league line, band stripped and sex kept", () => {
    const jl = drafts[2].events;
    expect(jl[0]).toMatchObject({ distance: 50, stroke: "BACK", gender: "M" });
    expect(jl[1]).toMatchObject({ distance: 25, stroke: "FLY", gender: "F" });
    // "8 & 9 Years" is a band, not a distance — 25 is the distance.
    expect(jl[2]).toMatchObject({ distance: 25, stroke: "FREE", gender: "M" });
    // A comma-listed band ("9, 10, 11 Years") must not yield 10 as a distance.
    expect(jl[3]).toMatchObject({ distance: 100, stroke: "BREAST" });
    expect(jl[4]).toMatchObject({ distance: 100, stroke: "IM", gender: "MIXED" });
  });

  it("never resolves a relay, but never drops it either", () => {
    const relay = drafts[2].events[5];
    expect(relay.rawLabel).toContain("Relay");
    expect(relay.distance).toBeUndefined();
    expect(relay.stroke).toBeUndefined();
  });

  it("keeps a fixture whose programme has not been published yet", () => {
    // A dated meet with no events belongs on the calendar NOW; a later
    // re-import fills the programme in.
    expect(drafts[3].events).toHaveLength(0);
    expect(drafts[3].startDate).toBe("2027-02-07");
    expect(drafts[3].warnings.join(" ")).toMatch(/no events listed/i);
  });

  it("states no course for any of them", () => {
    // §4.2: the parser never sets a course, not even for a 25 m programme that
    // can only be short course. The person confirming the import decides.
    for (const d of drafts) {
      expect(d).not.toHaveProperty("course");
    }
  });

  it("falls back to the single-meet parser for an ordinary one-meet document", () => {
    const one = parseMeetWorkbook("HAS 1st Seeded Gala 2026 - 11/9/2026\n1 50 Free");
    expect(one).toHaveLength(1);
    expect(one[0].name).toBe("HAS 1st Seeded Gala 2026");
  });
});

describe("parsePrintedDate — written months", () => {
  it("reads a weekday-led day-first date", () => {
    expect(parsePrintedDate("Friday, 11 September 2026")).toEqual({
      iso: "2026-09-11",
      ambiguous: false,
    });
  });

  it("reads abbreviations and ordinals", () => {
    expect(parsePrintedDate("11th Sept 2026")?.iso).toBe("2026-09-11");
    expect(parsePrintedDate("1 Jun 2026")?.iso).toBe("2026-06-01");
  });

  it("reads a month-first date", () => {
    expect(parsePrintedDate("September 11, 2026")?.iso).toBe("2026-09-11");
  });

  it("never calls a written date ambiguous — the month is spelled out", () => {
    expect(parsePrintedDate("5 March 2027")?.ambiguous).toBe(false);
    // Whereas the numeric form with both halves ≤ 12 still is.
    expect(parsePrintedDate("5/3/2027")?.ambiguous).toBe(true);
  });

  it("refuses a date that does not exist", () => {
    expect(parsePrintedDate("31 February 2026")).toBeNull();
  });
});

describe("parsePrintedTime", () => {
  it("reads the am/pm forms a programme prints", () => {
    expect(parsePrintedTime("6:00 PM")).toBe("18:00");
    expect(parsePrintedTime("8:00 AM")).toBe("08:00");
    expect(parsePrintedTime("12:30 AM")).toBe("00:30");
    expect(parsePrintedTime("12:30 PM")).toBe("12:30");
    expect(parsePrintedTime("6 pm")).toBe("18:00");
  });

  it("reads a 24-hour time as written", () => {
    expect(parsePrintedTime("18:00")).toBe("18:00");
    expect(parsePrintedTime("08:05")).toBe("08:05");
  });

  it("has nothing to report when no time is printed", () => {
    expect(parsePrintedTime("Les Brown")).toBeNull();
  });
});

/*
  Multi-day programmes.

  A three-day championship prints "Day 2 — Sunday 29 November 2026" over the
  Sunday half of its list. That line is DATED with text in front of it, which is
  exactly the shape `parseMeetWorkbook` splits meets on — so before days were
  understood, one gala imported as three one-day meets each holding a third of
  its events. These lock both halves of the fix: the split no longer happens,
  and the events land on the day the document put them on.
*/
describe("day headings", () => {
  const threeDay = [
    "HAS Senior Champs 2026\tSaturday, 28 November 2026\t8:00 AM\tLes Brown",
    "Day 1 - Saturday, 28 November 2026",
    "1 Girls 11-12 100 Freestyle",
    "2 Boys 11-12 100 Freestyle",
    "Day 2 - Sunday, 29 November 2026",
    "3 Girls 11-12 200 Breaststroke",
    "Day 3 - Monday, 30 November 2026",
    "4 Boys 11-12 400 Freestyle",
  ].join("\n");

  it("reads one meet, not three, and dates its last day", () => {
    const drafts = parseMeetWorkbook(threeDay);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].name).toBe("HAS Senior Champs 2026");
    expect(drafts[0].startDate).toBe("2026-11-28");
    expect(drafts[0].endDate).toBe("2026-11-30");
    expect(drafts[0].events).toHaveLength(4);
  });

  it("puts every event on the day its heading opened", () => {
    const draft = parseMeetProgramme(threeDay);
    expect(draft.events.map((e) => e.day)).toEqual([1, 1, 2, 3]);
    // And the day count matches the span it derived, so the server keeps them.
    expect(meetDates({ startDate: draft.startDate!, endDate: draft.endDate })).
      toHaveLength(3);
  });

  it("takes the DATE over the heading's own number when they disagree", () => {
    // A programme that skips the Sunday: "Day 2" is the meet's THIRD day, and
    // the date is the only reading that keeps the events on the Monday.
    const skipped = [
      "Winter Gala\tSaturday, 28 November 2026",
      "1 Girls 100 Freestyle",
      "Day 2 - Monday, 30 November 2026",
      "2 Boys 100 Freestyle",
    ].join("\n");
    const draft = parseMeetProgramme(skipped);
    expect(draft.endDate).toBe("2026-11-30");
    expect(draft.events.map((e) => e.day)).toEqual([undefined, 3]);
  });

  it("reads numbered days with no dates, and says the end date is still needed", () => {
    const undated = [
      "Winter Gala\tSaturday, 28 November 2026",
      "Day 1",
      "1 Girls 100 Freestyle",
      "Day 2",
      "2 Boys 100 Freestyle",
    ].join("\n");
    const draft = parseMeetProgramme(undated);
    expect(draft.events.map((e) => e.day)).toEqual([1, 2]);
    // Nothing dated the second day, so nothing may claim one.
    expect(draft.endDate).toBeNull();
    expect(
      draft.warnings.some((w) => w.includes("never dates the last one")),
    ).toBe(true);
  });

  it("a name in front of a date is still a meet, not a day", () => {
    const season = [
      "1st Seeded Gala\tFriday, 11 September 2026\t6:00 PM\tLes Brown",
      "1 Girls 100 Freestyle",
      "2nd Seeded Gala\tSunday, 27 September 2026\t6:00 PM\tLes Brown",
      "2 Boys 100 Freestyle",
    ].join("\n");
    const drafts = parseMeetWorkbook(season);
    expect(drafts.map((d) => d.name)).toEqual([
      "1st Seeded Gala",
      "2nd Seeded Gala",
    ]);
    // Neither is multi-day, and neither line gave its events a day.
    expect(drafts.every((d) => d.endDate === null)).toBe(true);
    expect(drafts.flatMap((d) => d.events).every((e) => e.day === undefined))
      .toBe(true);
  });

  it("a date printed BEFORE the meet's own is not a second day", () => {
    // Entries close before the gala. Reading that as a day heading would date
    // the meet backwards and move every event onto a day that never happened.
    const withCutoff = [
      "Winter Gala\tSaturday, 28 November 2026",
      "Entries close 14 November 2026",
      "1 Girls 100 Freestyle",
    ].join("\n");
    const draft = parseMeetProgramme(withCutoff);
    expect(draft.endDate).toBeNull();
    expect(draft.events[0].day).toBeUndefined();
  });

  it("leaves a one-day programme exactly as it was", () => {
    const oneDay = [
      "HAS 1ST SEEDED GALA 2026 - 11/9/2026",
      "1 Mixed 100 Freestyle",
      "2 Mixed 50 Backstroke",
    ].join("\n");
    const draft = parseMeetProgramme(oneDay);
    expect(draft.endDate).toBeNull();
    expect(draft.events.every((e) => e.day === undefined)).toBe(true);
  });
});
