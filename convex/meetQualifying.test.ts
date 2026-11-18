/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  A meet's own qualifying table — the server boundary. Proves the write is the
  super-user's alone and that every reader sees only the swimmers they may read:
  a parent their own child, a coach their own club.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });
    async function account(
      name: string,
      role: "SUPER_USER" | "COACH" | "VIEWER",
      clubId?: typeof clubA,
    ) {
      const userId = await ctx.db.insert("users", { name, email: `${name}@x.test` });
      const profileId = await ctx.db.insert("profiles", {
        authId: userId, name, email: `${name}@x.test`, role,
        ...(clubId ? { clubId } : {}),
      });
      return { userId, profileId };
    }
    const admin = await account("admin", "SUPER_USER");
    const coach = await account("coach", "COACH", clubA);
    const parent = await account("parent", "VIEWER");

    const swimmer = (name: string, clubId: typeof clubA, gender: "M" | "F") =>
      ctx.db.insert("swimmers", {
        name, dob: "2012-04-01", gender, active: true, clubId, createdAt: 0,
      });
    const jane = await swimmer("Jane", clubA, "F");
    const tom = await swimmer("Tom", clubA, "M");
    const other = await swimmer("Other club", clubB, "F");
    await ctx.db.insert("swimmerAccess", { profileId: parent.profileId, swimmerId: jane });

    const meetId = await ctx.db.insert("meets", {
      name: "HAS Championships 2026", startDate: "2026-11-21",
      endDate: "2026-11-22", course: "LCM", events: [], createdAt: 0,
    });
    // Jane: 1:20.00 long-course meet swim — under the 14 girls' 1:23.69.
    await ctx.db.insert("results", {
      swimmerId: jane, distance: 100, stroke: "FREE", course: "LCM",
      timeMs: 80000, swimType: "MEET", swimDate: "2026-10-10", ageAtSwim: 14,
      meetName: "3rd seeded", enteredBy: coach.profileId, createdAt: 0,
    });
    return { admin, coach, parent, jane, tom, other, meetId };
  });
  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  return {
    t, ids,
    asAdmin: as(ids.admin.userId),
    asCoach: as(ids.coach.userId),
    asParent: as(ids.parent.userId),
  };
}

describe("meet qualifying tables", () => {
  test("only the super-user may attach or remove one", async () => {
    const { ids, asCoach, asParent, asAdmin } = await setup();
    const args = { meetId: ids.meetId, presetKey: "HAS_CHAMPS_2026" };
    await expect(asCoach.mutation(api.meetQualifying.applyMeetQualifyingPreset, args)).rejects.toThrow();
    await expect(asParent.mutation(api.meetQualifying.applyMeetQualifyingPreset, args)).rejects.toThrow();
    await asAdmin.mutation(api.meetQualifying.applyMeetQualifyingPreset, {
      ...args, qualifyingFrom: "2026-08-24",
    });
    await expect(asCoach.mutation(api.meetQualifying.removeMeetQualifying, { meetId: ids.meetId })).rejects.toThrow();

    const table = await asParent.query(api.meetQualifying.getMeetQualifyingTable, { meetId: ids.meetId });
    expect(table?.cuts).toHaveLength(96);
    expect(table?.qualifyingTo).toBe("2026-11-20");

    await asAdmin.mutation(api.meetQualifying.removeMeetQualifying, { meetId: ids.meetId });
    expect(await asParent.query(api.meetQualifying.getMeetQualifiers, { meetId: ids.meetId })).toBeNull();
  });

  test("refuses a first counting day on or after the meet", async () => {
    const { ids, asAdmin } = await setup();
    await expect(
      asAdmin.mutation(api.meetQualifying.applyMeetQualifyingPreset, {
        meetId: ids.meetId, presetKey: "HAS_CHAMPS_2026", qualifyingFrom: "2026-11-21",
      }),
    ).rejects.toThrow(/before the meet/);
  });

  test("a parent sees their own swimmer; a coach their own club", async () => {
    const { ids, asAdmin, asCoach, asParent } = await setup();
    await asAdmin.mutation(api.meetQualifying.applyMeetQualifyingPreset, {
      meetId: ids.meetId, presetKey: "HAS_CHAMPS_2026", qualifyingFrom: "2026-08-24",
    });

    const mine = await asParent.query(api.meetQualifying.getMeetQualifiers, { meetId: ids.meetId });
    expect(mine?.viewer).toBe(true);
    expect(mine?.swimmers.map((s) => s.name)).toEqual(["Jane"]);
    expect(mine?.swimmers[0].exactAge).toBe(14);
    expect(mine?.swimmers[0].metCount).toBe(1);
    expect(mine?.swimmers[0].events[0]).toMatchObject({ met: true, bestMs: 80000, cutMs: 83690 });

    const club = await asCoach.query(api.meetQualifying.getMeetQualifiers, { meetId: ids.meetId });
    expect(club?.viewer).toBe(false);
    expect(club?.swimmers.map((s) => s.name)).toEqual(["Jane", "Tom"]);

    const all = await asAdmin.query(api.meetQualifying.getMeetQualifiers, { meetId: ids.meetId });
    expect(all?.swimmers).toHaveLength(3);
  });

  test("deleting the meet takes its table with it", async () => {
    const { t, ids, asAdmin } = await setup();
    await asAdmin.mutation(api.meetQualifying.applyMeetQualifyingPreset, {
      meetId: ids.meetId, presetKey: "HAS_CHAMPS_2026",
    });
    await asAdmin.mutation(api.meets.deleteMeet, { meetId: ids.meetId });
    const left = await t.run((ctx) => ctx.db.query("meetQualifying").collect());
    expect(left).toHaveLength(0);
  });
});
