/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { DELETE_REASON_MAX } from "./audit";

/*
  §R17 Part C — deleting a result must leave a tombstone.

  The load-bearing fact these tests protect: the time-entry log (Part B) is
  DERIVED from the live `results` rows, so a hard delete would otherwise erase
  its own evidence. Every assertion below is really one assertion — that after a
  delete, the swim, who logged it and who removed it are all still recoverable.
*/

// The two-dot pattern excludes *.test.ts files from the function registry.
const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });

    const swimmer = await ctx.db.insert("swimmers", {
      name: "Ava Linked",
      dob: "2012-05-01",
      gender: "F",
      active: true,
      clubId: club,
      createdAt: 0,
    });

    async function account(
      name: string,
      email: string,
      role: "SUPER_USER" | "COACH" | "VIEWER",
      clubId?: typeof club,
    ) {
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await ctx.db.insert("profiles", {
        authId: userId,
        name,
        email,
        role,
        ...(clubId ? { clubId } : {}),
      });
      return { userId, profileId };
    }

    const coach = await account("Coach A", "coach@a.test", "COACH", club);
    const otherCoach = await account("Coach B", "coach@b.test", "COACH", club);
    const viewer = await account("Parent", "parent@x.test", "VIEWER");

    // The viewer is linked to this swimmer, so §R15 lets them manage their own
    // school-gala entries — the delete path a coach can't otherwise observe.
    await ctx.db.insert("swimmerAccess", {
      profileId: viewer.profileId,
      swimmerId: swimmer,
    });

    // The event whitelist the result mutations validate against.
    await ctx.db.insert("events", {
      distance: 100,
      stroke: "FREE",
      allowedCourses: ["SCM", "LCM"],
      label: "100 Free",
      active: true,
    });

    return { club, swimmer, coach, otherCoach, viewer };
  });

  // @convex-dev/auth reads the user id from the identity subject's first
  // "|"-separated segment, so this is what a real signed-in session carries.
  const as = (userId: string) =>
    t.withIdentity({ subject: `${userId}|test-session` });

  return {
    t,
    ids,
    asCoach: as(ids.coach.userId),
    asOtherCoach: as(ids.otherCoach.userId),
    asViewer: as(ids.viewer.userId),
  };
}

/** Insert one result directly, bypassing the whitelist/parse path. */
async function seedResult(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: Awaited<ReturnType<typeof setup>>["ids"],
  overrides: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("results", {
      swimmerId: ids.swimmer,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeMs: 69_420,
      swimType: "MEET",
      swimDate: "2025-06-01",
      ageAtSwim: 13,
      meetName: "Autumn Open",
      venue: "Kings Park",
      enteredBy: ids.coach.profileId,
      createdAt: 1_700_000_000_000,
      ...overrides,
    }),
  );
}

const deletions = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
  t.run(async (ctx) => ctx.db.query("resultDeletions").collect());

describe("deleteResult writes a tombstone", () => {
  test("snapshots the whole swim, its entry provenance and the deleter", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);

    await asCoach.mutation(api.results.deleteResult, {
      resultId,
      reason: "Logged against the wrong swimmer",
    });

    // The row is really gone — this is a hard delete, not a soft one.
    expect(await t.run(async (ctx) => ctx.db.get(resultId))).toBeNull();

    const rows = await deletions(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      // Who removed it
      actorProfileId: ids.coach.profileId,
      actorName: "Coach A",
      actorRole: "COACH",
      reason: "Logged against the wrong swimmer",
      // The swim itself — the only surviving copy
      swimmerId: ids.swimmer,
      swimmerName: "Ava Linked",
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeMs: 69_420,
      swimType: "MEET",
      swimDate: "2025-06-01",
      ageAtSwim: 13,
      meetName: "Autumn Open",
      venue: "Kings Park",
      // Who had logged it
      enteredByProfileId: ids.coach.profileId,
      enteredByName: "Coach A",
      enteredByRole: "COACH",
      originalCreatedAt: 1_700_000_000_000,
    });
  });

  test("carries the last editor when the row had been edited", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids, {
      lastEditedBy: ids.otherCoach.profileId,
      updatedAt: 1_700_000_999_000,
    });

    await asCoach.mutation(api.results.deleteResult, { resultId });

    const [row] = await deletions(t);
    expect(row.lastEditedByName).toBe("Coach B");
    expect(row.originalUpdatedAt).toBe(1_700_000_999_000);
  });

  test("leaves the edit fields unset when the row was never edited", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);

    await asCoach.mutation(api.results.deleteResult, { resultId });

    const [row] = await deletions(t);
    expect(row.lastEditedByName).toBeUndefined();
    expect(row.originalUpdatedAt).toBeUndefined();
  });

  test("logs a parent deleting their own school-gala time, as a VIEWER", async () => {
    const { t, ids, asViewer } = await setup();
    const resultId = await seedResult(t, ids, {
      swimType: "SCHOOL_GALA",
      enteredBy: ids.viewer.profileId,
      meetName: undefined,
      venue: undefined,
    });

    await asViewer.mutation(api.results.deleteResult, { resultId });

    const [row] = await deletions(t);
    expect(row.actorRole).toBe("VIEWER");
    expect(row.actorName).toBe("Parent");
    expect(row.enteredByRole).toBe("VIEWER");
    expect(row.swimType).toBe("SCHOOL_GALA");
  });

  test("a rejected delete leaves no tombstone", async () => {
    const { t, ids, asViewer } = await setup();
    // A viewer may only touch SCHOOL_GALA rows (§R15); this one is a MEET.
    const resultId = await seedResult(t, ids);

    await expect(
      asViewer.mutation(api.results.deleteResult, { resultId }),
    ).rejects.toThrow();

    expect(await deletions(t)).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.get(resultId))).not.toBeNull();
  });
});

describe("the deletion reason", () => {
  test("is trimmed", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);

    await asCoach.mutation(api.results.deleteResult, {
      resultId,
      reason: "   duplicate entry  ",
    });

    expect((await deletions(t))[0].reason).toBe("duplicate entry");
  });

  test("is capped, so one paste can't bloat every page of the log", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);

    await asCoach.mutation(api.results.deleteResult, {
      resultId,
      reason: "x".repeat(DELETE_REASON_MAX + 500),
    });

    expect((await deletions(t))[0].reason).toHaveLength(DELETE_REASON_MAX);
  });

  test("blank and absent are the same fact — no reason given", async () => {
    const { t, ids, asCoach } = await setup();
    const blankId = await seedResult(t, ids);
    const absentId = await seedResult(t, ids);

    await asCoach.mutation(api.results.deleteResult, {
      resultId: blankId,
      reason: "   ",
    });
    await asCoach.mutation(api.results.deleteResult, { resultId: absentId });

    const rows = await deletions(t);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.reason === undefined)).toBe(true);
  });
});

describe("listDeletedTimeLog", () => {
  const page = { numItems: 50, cursor: null };

  test("is coach-only — a viewer can never read it", async () => {
    const { t, ids, asViewer } = await setup();
    const resultId = await seedResult(t, ids, {
      swimType: "SCHOOL_GALA",
      enteredBy: ids.viewer.profileId,
    });
    await asViewer.mutation(api.results.deleteResult, { resultId });

    // The viewer's own deletion is logged, but the log itself is closed to them.
    await expect(
      asViewer.query(api.audit.listDeletedTimeLog, { paginationOpts: page }),
    ).rejects.toThrow();
  });

  test("returns newest-deleted first", async () => {
    const { t, ids, asCoach } = await setup();
    const first = await seedResult(t, ids, { timeMs: 61_000 });
    const second = await seedResult(t, ids, { timeMs: 62_000 });

    await asCoach.mutation(api.results.deleteResult, { resultId: first });
    await asCoach.mutation(api.results.deleteResult, { resultId: second });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
    });
    expect(log.page.map((r) => r.timeMs)).toEqual([62_000, 61_000]);
  });

  test("filters by swim type server-side", async () => {
    const { t, ids, asCoach } = await setup();
    const meet = await seedResult(t, ids);
    const trial = await seedResult(t, ids, { swimType: "TIME_TRIAL" });
    await asCoach.mutation(api.results.deleteResult, { resultId: meet });
    await asCoach.mutation(api.results.deleteResult, { resultId: trial });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
      swimType: "TIME_TRIAL",
    });
    expect(log.page).toHaveLength(1);
    expect(log.page[0].swimType).toBe("TIME_TRIAL");
  });

  test("filters by who deleted it", async () => {
    const { t, ids, asCoach, asViewer } = await setup();
    const byCoach = await seedResult(t, ids);
    const byParent = await seedResult(t, ids, {
      swimType: "SCHOOL_GALA",
      enteredBy: ids.viewer.profileId,
    });
    await asCoach.mutation(api.results.deleteResult, { resultId: byCoach });
    await asViewer.mutation(api.results.deleteResult, { resultId: byParent });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
      deletedBy: ids.viewer.profileId,
    });
    expect(log.page).toHaveLength(1);
    expect(log.page[0].actorRole).toBe("VIEWER");
  });

  test("filters by swimmer", async () => {
    const { t, ids, asCoach } = await setup();
    const otherSwimmer = await t.run(async (ctx) =>
      ctx.db.insert("swimmers", {
        name: "Ben Other",
        dob: "2011-03-02",
        gender: "M",
        active: true,
        clubId: ids.club,
        createdAt: 0,
      }),
    );
    const mine = await seedResult(t, ids);
    const theirs = await seedResult(t, ids, { swimmerId: otherSwimmer });
    await asCoach.mutation(api.results.deleteResult, { resultId: mine });
    await asCoach.mutation(api.results.deleteResult, { resultId: theirs });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
      swimmerId: otherSwimmer,
    });
    expect(log.page).toHaveLength(1);
    expect(log.page[0].swimmerName).toBe("Ben Other");
  });

  test("renders the event label and keeps the reason", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);
    await asCoach.mutation(api.results.deleteResult, {
      resultId,
      reason: "mistyped the seconds",
    });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
    });
    expect(log.page[0].label).toBe("100 Free");
    expect(log.page[0].reason).toBe("mistyped the seconds");
  });

  test("reports no reason as null, not an empty string", async () => {
    const { t, ids, asCoach } = await setup();
    const resultId = await seedResult(t, ids);
    await asCoach.mutation(api.results.deleteResult, { resultId });

    const log = await asCoach.query(api.audit.listDeletedTimeLog, {
      paginationOpts: page,
    });
    expect(log.page[0].reason).toBeNull();
  });
});

describe("the deleted swim leaves the derived surfaces", () => {
  test("a deleted headline PB falls back to the next-fastest meet time", async () => {
    const { t, ids, asCoach } = await setup();
    const fastest = await seedResult(t, ids, { timeMs: 61_000 });
    await seedResult(t, ids, { timeMs: 65_000 });

    const before = await asCoach.query(api.personalBests.getPersonalBests, {
      swimmerId: ids.swimmer,
    });
    expect(before.find((p) => p.course === "LCM")?.headline?.timeMs).toBe(61_000);

    await asCoach.mutation(api.results.deleteResult, { resultId: fastest });

    // Nothing to invalidate — PBs are derived on every read (personalBests.ts).
    const after = await asCoach.query(api.personalBests.getPersonalBests, {
      swimmerId: ids.swimmer,
    });
    expect(after.find((p) => p.course === "LCM")?.headline?.timeMs).toBe(65_000);
  });
});
