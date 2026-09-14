/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Locks the qualifying window (§4.9) end-to-end, through the real public queries.

  The rule: a swimmer qualifies on THIS SEASON's racing. A qualifying time is an
  OFFICIAL MEET swim — never a time trial, practice swim or school gala, however
  fast — swum inside the gala's own window. Both gates always apply.

  The fixture is one swimmer with three swims of the same event, deliberately
  arranged so that every wrong implementation gives a different, visible answer:

    57.00  MEET        BEFORE the window   the lifetime best; cannot enter them
    55.00  TIME_TRIAL  inside the window   faster than everything; never counts
    61.50  MEET        inside the window   the only qualifying time there is

  (The dates are offsets from today — see `shiftDays` — so the fixture keeps
  meaning the same thing as the real calendar moves past it.)

  The cut is 58.00. So: judged on the all-time PB the swimmer reads as qualified;
  judged on the window but without the swim-type gate they read as qualified on
  the trial; judged correctly they read as NOT qualified, 3.50s short. Their PB
  board, meanwhile, must still say 57.00 — the two facts are never collapsed.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

/**
 * Dates are derived from TODAY, not written as 2026 literals.
 *
 * `logResult` refuses a swim date in the future, so a fixture pinned to a fixed
 * season would start failing the moment the real clock passed it — and would
 * have been silently untested before it. Everything here is expressed as an
 * offset, so the suite means the same thing whenever it runs.
 */
function shiftDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DOB = "2010-01-01"; // exact age is irrelevant here; the catch-all cut applies
const WINDOW = {
  qualifyingFrom: shiftDays(-120), // the season opened four months ago
  qualifyingTo: shiftDays(180), // and closes six months from now
};
const IN_WINDOW = shiftDays(-30); // a month ago: in season, and in the past
const BEFORE_WINDOW = shiftDays(-300); // last season

const CUT_MS = 58_000;
const PB_BEFORE_WINDOW = 57_000; // beats the cut, outside the window
const TRIAL_IN_WINDOW = 55_000; // beats everything, but is not an official meet
const MEET_IN_WINDOW = 61_500; // the real qualifying time

async function setup(opts: { window: boolean }) {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Club", createdAt: 0 });
    await ctx.db.insert("events", {
      distance: 100,
      stroke: "FREE",
      allowedCourses: ["SCM", "LCM"],
      label: "100 Free",
      active: true,
    });
    const swimmer = await ctx.db.insert("swimmers", {
      name: "Thandiwe Moyo",
      dob: DOB,
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

    for (const [timeMs, swimType, swimDate] of [
      [PB_BEFORE_WINDOW, "MEET", BEFORE_WINDOW],
      [TRIAL_IN_WINDOW, "TIME_TRIAL", IN_WINDOW],
      [MEET_IN_WINDOW, "MEET", IN_WINDOW],
    ] as const) {
      await ctx.db.insert("results", {
        swimmerId: swimmer,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs,
        swimType,
        swimDate,
        ageAtSwim: 16,
        enteredBy: coach,
        createdAt: 0,
      });
    }

    const sanj = await ctx.db.insert("galas", {
      code: "SANJ",
      displayName: "SA National Junior Championships",
      shortLabel: "SANJ",
      ageScope: "AGE_GRADED",
      coveredEvents: [{ distance: 100, stroke: "FREE" }],
      sortHint: 2,
      season: "2027",
      ...(opts.window ? WINDOW : {}),
    });
    // One catch-all cut so the age rule never enters into this test.
    await ctx.db.insert("standards", {
      galaId: sanj,
      course: "LCM",
      gender: "F",
      distance: 100,
      stroke: "FREE",
      age: 30,
      isCatchAllYoung: true,
      isCatchAllOld: false,
      timeMs: CUT_MS,
    });

    return { club, swimmer, coachUser, sanj };
  });

  return { t, ids, asCoach: t.withIdentity({ subject: `${ids.coachUser}|s` }) };
}

describe("the qualifying window, through the real queries (§4.9)", () => {
  test("Road to qualify measures the in-window meet swim, not the faster PB", async () => {
    const { asCoach, ids } = await setup({ window: true });
    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: ids.swimmer,
      gala: "SANJ",
    });
    const event = road?.events.find((e) => e.distance === 100);
    expect(event?.pbMs).toBe(MEET_IN_WINDOW);
    expect(event?.qualified).toBe(false);
    expect(event?.gapMs).toBe(MEET_IN_WINDOW - CUT_MS);
    // And it names the window it judged on, so the screen can say so once.
    expect(road?.qualifyingWindow).toEqual(WINDOW);
  });

  test("the status matrix reads the same swim, and no gala met", async () => {
    const { asCoach } = await setup({ window: true });
    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const cell = matrix.rows[0].cells.find((c) => c.distance === 100);
    expect(cell?.hasCut).toBe(true);
    expect(cell?.gala).toBeNull();
    expect(cell?.pbLcmMs).toBe(MEET_IN_WINDOW);
    expect(matrix.qualifyingWindows.SANJ).toEqual(WINDOW);
  });

  test("the tour list does not take this swimmer", async () => {
    const { asCoach } = await setup({ window: true });
    const tours = await asCoach.query(api.tours.getTourQualification, {});
    const sanj = tours.galas.find((g) => g.gala === "SANJ");
    expect(sanj?.swimmers).toHaveLength(0);
    expect(sanj?.qualifyingWindow).toEqual(WINDOW);
  });

  test("the PB board is untouched — the lifetime best still stands", async () => {
    // Decision #1: two facts, never collapsed. The swimmer loses a qualification
    // they cannot act on; they do not lose their personal best.
    const { asCoach, ids } = await setup({ window: true });
    const pbs = await asCoach.query(api.personalBests.getPersonalBests, {
      swimmerId: ids.swimmer,
    });
    const hundred = pbs.find((p) => p.distance === 100 && p.course === "LCM");
    expect(hundred?.headline?.timeMs).toBe(PB_BEFORE_WINDOW);
  });

  test("a time trial inside the window qualifies nobody, however fast", async () => {
    // The swim-type gate, proved separately: 55.00 is comfortably under the cut
    // and sits inside the window, and must still never appear as a qualifying
    // time or earn a gala.
    const { asCoach, ids } = await setup({ window: true });
    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: ids.swimmer,
      gala: "SANJ",
    });
    const event = road?.events.find((e) => e.distance === 100);
    expect(event?.pbMs).not.toBe(TRIAL_IN_WINDOW);
    expect(event?.qualified).toBe(false);
  });

  test("with NO window the same swimmer reads as qualified, as before", async () => {
    // The backward-compatible default, and the proof that the three tests above
    // are measuring the window rather than something else in the fixture.
    const { asCoach, ids } = await setup({ window: false });
    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: ids.swimmer,
      gala: "SANJ",
    });
    const event = road?.events.find((e) => e.distance === 100);
    expect(event?.pbMs).toBe(PB_BEFORE_WINDOW);
    expect(event?.qualified).toBe(true);
    expect(road?.qualifyingWindow).toBeNull();
  });

  test("logging an out-of-window swim reports the cut but claims no qualification", async () => {
    // The toast the coach sees when back-filling last season: worth saying the
    // swim was that fast, never worth saying they have qualified.
    const { asCoach, ids } = await setup({ window: true });
    const res = await asCoach.mutation(api.results.logResult, {
      swimmerId: ids.swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeInput: "0:56:00",
      swimType: "MEET",
      swimDate: BEFORE_WINDOW,
    });
    expect(res.newPb).toBe(true);
    expect(res.newlyMetGala).toBeNull();
    expect(res.cutBeatenOutsideWindow).toBe("SANJ");
  });

  test("logging an in-window swim under the cut DOES claim the qualification", async () => {
    const { asCoach, ids } = await setup({ window: true });
    const res = await asCoach.mutation(api.results.logResult, {
      swimmerId: ids.swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeInput: "0:56:00",
      swimType: "MEET",
      swimDate: IN_WINDOW,
    });
    expect(res.newlyMetGala).toBe("SANJ");
    expect(res.cutBeatenOutsideWindow).toBeNull();
  });

  test("a time trial under the cut announces nothing at all", async () => {
    const { asCoach, ids } = await setup({ window: true });
    const res = await asCoach.mutation(api.results.logResult, {
      swimmerId: ids.swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeInput: "0:50:00",
      swimType: "TIME_TRIAL",
      swimDate: IN_WINDOW,
    });
    expect(res.newPb).toBe(false);
    expect(res.newlyMetGala).toBeNull();
    expect(res.cutBeatenOutsideWindow).toBeNull();
  });
});
