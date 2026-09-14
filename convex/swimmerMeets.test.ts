/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Locks `getSwimmerMeets` — the read behind the swimmer profile's Meets tab.

  Three things it must get right, each of which has a plausible wrong answer:

  BOTH DOORS. A swim reaches this app either through the sign-up sheet (a
  `meetEntries` row) or through /log with a meet chosen (a `results` row carrying
  `meetId`, and NO entry). Reading entries alone would leave the tab empty for a
  club that logs the second way, so both are read — and a swim that came through
  the sheet must not then be counted twice on its own meet.

  UPCOMING IS ONE MEET. The nearest, not the next four.

  ACCESS. A coach may read any swimmer; a viewer only their own. The gate is
  `requireSwimmerAccess`, the same one the profile itself uses.

  Dates are offsets from today (`shiftDays`) so the fixture keeps meaning the
  same thing as the calendar moves past it.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

function shiftDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const LAST_MONTH = shiftDays(-30);
const LAST_WEEK = shiftDays(-7);
const NEXT_WEEK = shiftDays(7);
const NEXT_MONTH = shiftDays(30);

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Sharks", createdAt: 0 });
    const swimmer = await ctx.db.insert("swimmers", {
      name: "Andile Kona",
      dob: "2015-01-01",
      gender: "M",
      active: true,
      clubId: club,
      createdAt: 0,
    });
    const other = await ctx.db.insert("swimmers", {
      name: "Someone Else",
      dob: "2015-01-01",
      gender: "F",
      active: true,
      clubId: club,
      createdAt: 0,
    });
    const coachUser = await ctx.db.insert("users", {
      name: "Coach",
      email: "coach@x.test",
    });
    const coach = await ctx.db.insert("profiles", {
      authId: coachUser,
      name: "Coach",
      email: "coach@x.test",
      role: "COACH",
      clubId: club,
    });
    const viewerUser = await ctx.db.insert("users", {
      name: "Parent",
      email: "parent@x.test",
    });
    const viewer = await ctx.db.insert("profiles", {
      authId: viewerUser,
      name: "Parent",
      email: "parent@x.test",
      role: "VIEWER",
    });
    await ctx.db.insert("swimmerAccess", { profileId: viewer, swimmerId: swimmer });

    // Three meets: one last month, one last week, one next week — plus a
    // further one next month, which must NOT be the one Upcoming reports.
    const meet = async (name: string, startDate: string) =>
      await ctx.db.insert("meets", {
        name,
        startDate,
        course: "LCM",
        events: [
          { id: "line-free", eventNumber: 1, rawLabel: "100 Free", distance: 100, stroke: "FREE" },
          { id: "line-back", eventNumber: 2, rawLabel: "50 Back", distance: 50, stroke: "BACK" },
        ],
        createdAt: 0,
      });

    const older = await meet("Autumn Gala", LAST_MONTH);
    const recent = await meet("1st Seeded Gala", LAST_WEEK);
    const next = await meet("2nd Seeded Gala", NEXT_WEEK);
    const later = await meet("3rd Seeded Gala", NEXT_MONTH);

    // --- the sheet door: an entry WITH a linked result, at `recent` ----------
    const swum = await ctx.db.insert("results", {
      swimmerId: swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeMs: 89_810,
      swimType: "MEET",
      swimDate: LAST_WEEK,
      ageAtSwim: 11,
      meetId: recent,
      enteredBy: coach,
      createdAt: 0,
    });
    await ctx.db.insert("meetEntries", {
      meetId: recent,
      lineId: "line-free",
      swimmerId: swimmer,
      clubId: club,
      meetStartDate: LAST_WEEK,
      swimDate: LAST_WEEK,
      rawLabel: "100 Free",
      eventNumber: 1,
      distance: 100,
      stroke: "FREE",
      resultId: swum,
      enteredBy: coach,
      createdAt: 0,
    });

    // --- the /log door: a result at `older` with NO entry row ---------------
    await ctx.db.insert("results", {
      swimmerId: swimmer,
      distance: 50,
      stroke: "BACK",
      course: "LCM",
      timeMs: 46_540,
      swimType: "MEET",
      swimDate: LAST_MONTH,
      ageAtSwim: 11,
      meetId: older,
      enteredBy: coach,
      createdAt: 0,
    });

    // --- a plan: entries at the next meet, no times yet ---------------------
    for (const [lineId, label, distance, stroke] of [
      ["line-back", "50 Back", 50, "BACK"],
      ["line-free", "100 Free", 100, "FREE"],
    ] as const) {
      await ctx.db.insert("meetEntries", {
        meetId: next,
        lineId,
        swimmerId: swimmer,
        clubId: club,
        meetStartDate: NEXT_WEEK,
        swimDate: NEXT_WEEK,
        rawLabel: label,
        eventNumber: lineId === "line-free" ? 1 : 2,
        distance,
        stroke,
        enteredBy: coach,
        createdAt: 0,
      });
    }
    // …and one at the meet AFTER it, to prove Upcoming reports the nearest.
    await ctx.db.insert("meetEntries", {
      meetId: later,
      lineId: "line-free",
      swimmerId: swimmer,
      clubId: club,
      meetStartDate: NEXT_MONTH,
      swimDate: NEXT_MONTH,
      rawLabel: "100 Free",
      eventNumber: 1,
      distance: 100,
      stroke: "FREE",
      enteredBy: coach,
      createdAt: 0,
    });

    return { club, swimmer, other, coachUser, viewerUser, recent, older, next };
  });

  return {
    t,
    ids,
    asCoach: t.withIdentity({ subject: `${ids.coachUser}|s` }),
    asViewer: t.withIdentity({ subject: `${ids.viewerUser}|s` }),
  };
}

describe("getSwimmerMeets", () => {
  test("Upcoming is the NEAREST meet, with its events in programme order", async () => {
    const { asCoach, ids } = await setup();
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    expect(data.upcoming?.name).toBe("2nd Seeded Gala");
    expect(data.upcoming?.startDate).toBe(NEXT_WEEK);
    // Entered back-first, but event 1 comes first — the event number IS the
    // running order (`compareMeetEvents`).
    expect(data.upcoming?.events.map((e) => e.eventNumber)).toEqual([1, 2]);
    // Nothing swum yet: a plan, not a missing value.
    expect(data.upcoming?.events.every((e) => e.timeMs === null)).toBe(true);
  });

  test("Past includes a meet reached only through a logged result", async () => {
    // No `meetEntries` row exists for Autumn Gala — only a result carrying its
    // meetId. Entries-only would drop this meet entirely.
    const { asCoach, ids } = await setup();
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    const autumn = data.past.find((m) => m.name === "Autumn Gala");
    expect(autumn).toBeDefined();
    expect(autumn?.events).toHaveLength(1);
    expect(autumn?.events[0].timeMs).toBe(46_540);
    // A logged swim is not attached to a programme line: guessing one from
    // (distance, stroke) is exactly what lineId exists to prevent.
    expect(autumn?.events[0].lineId).toBeNull();
    expect(autumn?.events[0].eventNumber).toBeNull();
  });

  test("a swim entered on the sheet appears ONCE, not twice", async () => {
    // The entry at 1st Seeded Gala carries a resultId, and that result also
    // carries the meetId. Merging naively would list the same swim twice.
    const { asCoach, ids } = await setup();
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    const seeded = data.past.find((m) => m.name === "1st Seeded Gala");
    expect(seeded?.events).toHaveLength(1);
    expect(seeded?.events[0].timeMs).toBe(89_810);
    expect(seeded?.events[0].lineId).toBe("line-free");
  });

  test("Past is newest first", async () => {
    const { asCoach, ids } = await setup();
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    expect(data.past.map((m) => m.name)).toEqual([
      "1st Seeded Gala",
      "Autumn Gala",
    ]);
    expect(data.pastTruncated).toBe(false);
  });

  test("a meet running TODAY counts as upcoming, not past", async () => {
    // `isUpcoming` reads the end date, so a coach mid-gala finds the meet where
    // they left it rather than having it move under them halfway through.
    const { t, asCoach, ids } = await setup();
    const todayMeet = await t.run(async (ctx) => {
      const id = await ctx.db.insert("meets", {
        name: "Today Gala",
        startDate: shiftDays(0),
        course: "LCM",
        events: [
          { id: "l", eventNumber: 1, rawLabel: "100 Free", distance: 100, stroke: "FREE" },
        ],
        createdAt: 0,
      });
      await ctx.db.insert("meetEntries", {
        meetId: id,
        lineId: "l",
        swimmerId: ids.swimmer,
        clubId: ids.club,
        meetStartDate: shiftDays(0),
        swimDate: shiftDays(0),
        rawLabel: "100 Free",
        eventNumber: 1,
        distance: 100,
        stroke: "FREE",
        enteredBy: (await ctx.db.query("profiles").first())!._id,
        createdAt: 0,
      });
      return id;
    });
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    expect(data.upcoming?.meetId).toBe(todayMeet);
    expect(data.past.some((m) => m.name === "Today Gala")).toBe(false);
  });

  test("a swimmer with no meets at all gets empty lists, not an error", async () => {
    const { asCoach, ids } = await setup();
    const data = await asCoach.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.other,
    });
    expect(data).toEqual({ upcoming: null, past: [], pastTruncated: false });
  });

  test("a viewer reads their own swimmer and is refused another", async () => {
    const { asViewer, ids } = await setup();
    const mine = await asViewer.query(api.meetEntries.getSwimmerMeets, {
      swimmerId: ids.swimmer,
    });
    expect(mine.upcoming?.name).toBe("2nd Seeded Gala");

    await expect(
      asViewer.query(api.meetEntries.getSwimmerMeets, { swimmerId: ids.other }),
    ).rejects.toThrow(/only view your own swimmer/i);
  });
});
