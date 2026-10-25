/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Own club only (docs/access-control.md). Every coach — Super, Senior or
  Junior — reads only their own club; the Admin reads every club. And the
  backfill that has to happen first: swimmers and squads with no club are
  invisible to every coach until the Admin gives them one (Admin › Unassigned).
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });
    const swimmer = (name: string, clubId?: typeof clubA) =>
      ctx.db.insert("swimmers", {
        name,
        dob: "2012-01-01",
        gender: "F",
        active: true,
        ...(clubId ? { clubId } : {}),
        createdAt: 0,
      });
    const ava = await swimmer("Ava A", clubA);
    const bea = await swimmer("Bea B", clubB);
    const lost = await swimmer("Lost Legacy"); // no club

    const squadA = await ctx.db.insert("squads", { name: "A squad", clubId: clubA });
    const squadB = await ctx.db.insert("squads", { name: "B squad", clubId: clubB });
    const legacyA = await ctx.db.insert("squads", { name: "Legacy all-A" });
    const legacyMixed = await ctx.db.insert("squads", { name: "Legacy mixed" });
    await ctx.db.insert("squadMemberships", { swimmerId: ava, squadId: legacyA });
    await ctx.db.insert("squadMemberships", { swimmerId: ava, squadId: legacyMixed });
    await ctx.db.insert("squadMemberships", { swimmerId: bea, squadId: legacyMixed });

    async function account(
      name: string,
      role: "SUPER_USER" | "COACH",
      extra: { clubId?: typeof clubA; coachLevel?: "JUNIOR" } = {},
    ) {
      const email = `${name.toLowerCase().replace(/\s+/g, ".")}@x.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await ctx.db.insert("profiles", {
        authId: userId,
        name,
        email,
        role,
        ...extra,
      });
      return { userId, profileId };
    }
    const coachA = await account("Coach A", "COACH", { clubId: clubA });
    const juniorA = await account("Junior A", "COACH", { clubId: clubA, coachLevel: "JUNIOR" });
    const admin = await account("Admin", "SUPER_USER");

    // One meet swim each, so the leaderboard has rows from both clubs.
    for (const swimmerId of [ava, bea]) {
      await ctx.db.insert("results", {
        swimmerId,
        distance: 50,
        stroke: "FREE",
        course: "LCM",
        timeMs: 30_000,
        swimType: "MEET",
        swimDate: "2025-06-01",
        ageAtSwim: 13,
        enteredBy: coachA.profileId,
        createdAt: 0,
      });
    }
    return {
      clubA,
      clubB,
      ava,
      bea,
      lost,
      squadA,
      squadB,
      legacyA,
      legacyMixed,
      coachA,
      juniorA,
      admin,
    };
  });
  const as = (who: { userId: string }) =>
    t.withIdentity({ subject: `${who.userId}|test-session` });
  return { t, ids, as };
}

describe("every coach reads only their own club", () => {
  test("roster, comparison and squads", async () => {
    const { ids, as } = await setup();
    for (const who of [ids.coachA, ids.juniorA]) {
      const c = as(who);
      const roster = await c.query(api.swimmers.listSwimmers, {});
      expect(roster.map((r) => r.name)).toEqual(["Ava A"]);

      const board = await c.query(api.analysis.getEventComparison, {
        distance: 50,
        stroke: "FREE",
        course: "LCM",
      });
      expect(board.rows.map((r) => r.swimmerId)).toEqual([ids.ava]);

      const squads = await c.query(api.squads.listSquads, {});
      expect(squads.map((s) => s.name)).toEqual(["A squad"]);
    }
  });

  test("a direct read of another club's swimmer is refused", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.coachA).query(api.trainingNotes.getSwimmerTrainingNotes, {
        swimmerId: ids.bea,
      }),
    ).rejects.toThrow(/another club/);
    await expect(
      as(ids.juniorA).query(api.analysis.getRoadToQualify, {
        swimmerId: ids.bea,
        gala: "SANJ",
      }),
    ).rejects.toThrow(/another club/);
    // Even through another club's squad id, the roster stays own-club.
    const viaSquad = await as(ids.coachA).query(api.swimmers.listSwimmers, {
      squadId: ids.legacyMixed,
    });
    expect(viaSquad.map((r) => r.name)).toEqual(["Ava A"]);
  });

  test("another club's squad cannot be edited", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.coachA).mutation(api.squads.updateSquad, { squadId: ids.squadB, name: "Mine" }),
    ).rejects.toThrow(/own club/);
  });

  test("the audit trail is the club's own", async () => {
    const { ids, as } = await setup();
    const log = await as(ids.coachA).query(api.audit.listTimeEntryLog, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(log.page.map((r) => r.swimmerId)).toEqual([ids.ava]);
  });

  test("the Admin reads every club", async () => {
    const { ids, as } = await setup();
    const roster = await as(ids.admin).query(api.swimmers.listSwimmers, {});
    expect(roster.map((r) => r.name).sort()).toEqual(["Ava A", "Bea B", "Lost Legacy"]);
  });
});

describe("Admin › Unassigned backfill", () => {
  test("lists clubless swimmers and squads, suggesting unanimous squads", async () => {
    const { ids, as } = await setup();
    const u = await as(ids.admin).query(api.clubs.listUnassigned, {});
    expect(u.swimmers.map((s) => s.name)).toEqual(["Lost Legacy"]);
    const byName = new Map(u.squads.map((s) => [s.name, s]));
    expect(byName.get("Legacy all-A")?.suggestedClubId).toBe(ids.clubA);
    expect(byName.get("Legacy mixed")?.suggestedClubId).toBeNull();
  });

  test("infers unanimous squads only, then bulk-assigns the rest", async () => {
    const { t, ids, as } = await setup();
    const admin = as(ids.admin);
    expect(await admin.mutation(api.clubs.inferSquadClubs, {})).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(ids.legacyA)))?.clubId).toBe(ids.clubA);
    expect((await t.run((ctx) => ctx.db.get(ids.legacyMixed)))?.clubId).toBeUndefined();

    await admin.mutation(api.clubs.bulkAssignClub, {
      clubId: ids.clubB,
      swimmerIds: [ids.lost],
      squadIds: [ids.legacyMixed],
    });
    const u = await admin.query(api.clubs.listUnassigned, {});
    expect(u.swimmers).toEqual([]);
    expect(u.squads).toEqual([]);
  });

  test("is the Admin's alone", async () => {
    const { ids, as } = await setup();
    await expect(as(ids.coachA).query(api.clubs.listUnassigned, {})).rejects.toThrow();
    await expect(as(ids.coachA).mutation(api.clubs.inferSquadClubs, {})).rejects.toThrow();
  });
});
