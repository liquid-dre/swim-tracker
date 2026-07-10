/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Locks the qualification-age rule (§4.9, corrected): a swimmer is judged
  against the cut for the age they ARE FOR THE COMPETITION — the tour date
  when set, else their CURRENT age — never the age a past PB was swum. The bug
  this guards against: a swimmer who beat an easier younger cut kept reading as
  qualified after ageing into a harder cut their time doesn't meet. Exercised
  end-to-end through the real public queries, for every qualification surface.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// Born 1 Jan (currentYear − 15): solidly 15 today, every day of the year,
// whatever real date the suite runs on (computeAge = year diff, month/day never
// decrements past a 1-Jan birthday). So "current age" is a stable 15.
const CURRENT_YEAR = new Date().getUTCFullYear();
const DOB_15 = `${CURRENT_YEAR - 15}-01-01`;

// SANJ Men 100 Free cuts: 14 → 58.69, 15 → 56.91 (from the official table).
const CUT_14 = 58_690;
const CUT_15 = 56_910;
// A PB swum at 14 that BEATS the 14 cut but is SLOWER than the 15 cut. Under the
// old age-at-swim rule this read as SANJ; under the corrected rule it must not.
const PB_MS = 57_500;

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Club", createdAt: 0 });
    // The matrix and road build their event columns from the whitelist table.
    await ctx.db.insert("events", {
      distance: 100,
      stroke: "FREE",
      allowedCourses: ["SCM", "LCM"],
      label: "100 Free",
      active: true,
    });
    const swimmer = await ctx.db.insert("swimmers", {
      name: "Sibusiso Fayayo",
      dob: DOB_15,
      gender: "M",
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

    // The headline PB, swum at 14 (in a prior year).
    await ctx.db.insert("results", {
      swimmerId: swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeMs: PB_MS,
      swimType: "MEET",
      swimDate: `${CURRENT_YEAR - 1}-06-01`,
      ageAtSwim: 14,
      enteredBy: coach,
      createdAt: 0,
    });
    for (const [age, timeMs] of [
      [14, CUT_14],
      [15, CUT_15],
    ] as const) {
      await ctx.db.insert("standards", {
        tier: "SANJ",
        gender: "M",
        distance: 100,
        stroke: "FREE",
        age,
        isCatchAllYoung: false,
        isCatchAllOld: false,
        timeMs,
      });
    }

    return { club, swimmer, coachUser };
  });

  return { t, ids, asCoach: t.withIdentity({ subject: `${ids.coachUser}|s` }) };
}

describe("qualification is judged at current age, not age-at-swim (§4.9)", () => {
  test("Road to qualify does NOT mark the event qualified (PB slower than the 15 cut)", async () => {
    const { asCoach, ids } = await setup();
    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: ids.swimmer,
      tier: "SANJ",
    });
    const evt = road?.events.find((e) => e.distance === 100 && e.stroke === "FREE");
    expect(evt).toBeDefined();
    expect(evt!.cutMs).toBe(CUT_15); // resolved at 15, not 14
    expect(evt!.qualified).toBe(false); // 57.50 > 56.91
  });

  test("Tour qualification does NOT list the swimmer under SANJ", async () => {
    const { asCoach, ids } = await setup();
    const qual = await asCoach.query(api.tours.getTourQualification, {});
    const sanj = qual.tiers.find((x) => x.tier === "SANJ")!;
    expect(sanj.swimmers.map((s) => s.swimmerId)).not.toContain(ids.swimmer);
  });

  test("Status matrix cell shows NO tier met for the event", async () => {
    const { asCoach, ids } = await setup();
    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const row = matrix.rows.find((r) => r.swimmerId === ids.swimmer)!;
    const cell = row.cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    expect(cell.tier).toBeNull(); // not SANJ, not anything — 57.50 misses the 15 cut
  });

  test("BUT a tour date at age 14 DOES qualify (age on tour day is what counts)", async () => {
    const { asCoach, ids, t } = await setup();
    // A SANJ tour dated in the year the swimmer was 14 → judged at 14 → qualifies.
    await t.run(async (ctx) => {
      await ctx.db.insert("tours", {
        tier: "SANJ",
        date: `${CURRENT_YEAR - 1}-06-15`,
      });
    });
    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: ids.swimmer,
      tier: "SANJ",
    });
    const evt = road?.events.find((e) => e.distance === 100 && e.stroke === "FREE");
    expect(evt!.cutMs).toBe(CUT_14); // resolved at the tour-day age, 14
    expect(evt!.qualified).toBe(true); // 57.50 < 58.69
  });
});
