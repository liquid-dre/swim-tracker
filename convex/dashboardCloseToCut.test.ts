/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Locks the dashboard's "Close to a cut" card and the panel behind it, end to
  end through getCoachDashboard: one verdict per EVENT across both courses
  (lib/closeToCut), so a long-course gap to a gala the swimmer has already made
  in short course is NOT close, and the count always equals the list's length.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// Born 1 Jan (currentYear − 15): a stable 15 on whatever date the suite runs.
const CURRENT_YEAR = new Date().getUTCFullYear();
const DOB_15 = `${CURRENT_YEAR - 15}-01-01`;

const LCM_CUT = 56_910;
const SCM_CUT = 55_000;

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Club", createdAt: 0 });
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
    const sanj = await ctx.db.insert("galas", {
      code: "SANJ",
      displayName: "SA National Junior Championships",
      shortLabel: "SANJ",
      ageScope: "AGE_GRADED",
      maxAge: 16,
      coveredEvents: [{ distance: 100, stroke: "FREE" }],
      sortHint: 2,
      season: "2027",
    });
    for (const [course, timeMs] of [
      ["LCM", LCM_CUT],
      ["SCM", SCM_CUT],
    ] as const) {
      await ctx.db.insert("standards", {
        galaId: sanj,
        course,
        gender: "M",
        distance: 100,
        stroke: "FREE",
        age: 15,
        isCatchAllYoung: false,
        isCatchAllOld: false,
        timeMs,
      });
    }

    const swimmer = async (name: string) =>
      ctx.db.insert("swimmers", {
        name,
        dob: DOB_15,
        gender: "M",
        active: true,
        clubId: club,
        createdAt: 0,
      });
    const swim = async (
      swimmerId: Awaited<ReturnType<typeof swimmer>>,
      course: "LCM" | "SCM",
      timeMs: number,
    ) =>
      ctx.db.insert("results", {
        swimmerId,
        distance: 100,
        stroke: "FREE",
        course,
        timeMs,
        swimType: "MEET",
        swimDate: `${CURRENT_YEAR - 1}-06-01`,
        ageAtSwim: 14,
        enteredBy: coach,
        createdAt: 0,
      });

    // 0.39s off the long-course cut, but short course already beats SANJ.
    const qualified = await swimmer("Already Qualified");
    await swim(qualified, "LCM", LCM_CUT + 390);
    await swim(qualified, "SCM", SCM_CUT - 200);

    // 0.39s off the long-course cut, no short-course swim: genuinely close.
    const close = await swimmer("Genuinely Close");
    await swim(close, "LCM", LCM_CUT + 390);

    // 1.5s off: outside the threshold.
    const far = await swimmer("Too Far");
    await swim(far, "LCM", LCM_CUT + 1_500);

    return { coachUser, qualified, close };
  });

  return { ids, asCoach: t.withIdentity({ subject: `${ids.coachUser}|s` }) };
}

describe("dashboard close to a cut", () => {
  test("lists only the swimmer with a gap to a gala not made in either course", async () => {
    const { asCoach, ids } = await setup();
    const dash = await asCoach.query(api.dashboard.getCoachDashboard, {});

    expect(dash.closeToCut.map((s) => s.swimmerId)).toEqual([ids.close]);
    expect(dash.closeToCut[0].events).toEqual([
      {
        distance: 100,
        stroke: "FREE",
        label: "100 Free",
        course: "LCM",
        pbMs: LCM_CUT + 390,
        nextGala: "SANJ",
        gapMs: 390,
      },
    ]);
  });

  test("the card's count is the panel's length", async () => {
    const { asCoach } = await setup();
    const dash = await asCoach.query(api.dashboard.getCoachDashboard, {});
    expect(dash.counts.closeToCut).toBe(dash.closeToCut.length);
  });
});
