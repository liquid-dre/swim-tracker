/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/*
  Coach join requests and club Permissions. A requester stays a VIEWER until a
  Super Coach of the club (or the Admin) approves them WITH a level; a club can
  never lose its last Super Coach to one of its own coaches.
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
      extra: { clubId?: Id<"clubs">; coachLevel?: "SUPER" | "SENIOR" | "JUNIOR" } = {},
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

    return {
      clubA,
      clubB,
      admin: await account("Admin", "SUPER_USER"),
      superA: await account("Super A", "COACH", { clubId: clubA }),
      superB: await account("Super B", "COACH", { clubId: clubB }),
      juniorA: await account("Junior A", "COACH", { clubId: clubA, coachLevel: "JUNIOR" }),
      applicant: await account("Applicant", "VIEWER"),
    };
  });
  const as = (who: { userId: string }) =>
    t.withIdentity({ subject: `${who.userId}|test-session` });
  return { t, ids, as };
}

describe("sign-up club picker", () => {
  test("lists club names to anyone, signed in or not", async () => {
    const { t } = await setup();
    const clubs = await t.query(api.coachPermissions.listClubsForSignup, {});
    expect(clubs.map((c) => c.name)).toEqual(["Club A", "Club B"]);
    expect(Object.keys(clubs[0]).sort()).toEqual(["_id", "name"]);
  });
});

describe("request lifecycle", () => {
  test("request → pending → approved as a level", async () => {
    const { t, ids, as } = await setup();
    const me = as(ids.applicant);
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubA });
    expect((await me.query(api.coachPermissions.myCoachRequest, {}))?.status).toBe("PENDING");

    // The applicant has no club data while waiting: still a viewer.
    const sa = as(ids.superA);
    const perms = await sa.query(api.coachPermissions.getClubPermissions, {});
    expect(perms.pending.map((p) => p.name)).toEqual(["Applicant"]);
    expect(await sa.query(api.coachPermissions.pendingCoachRequestCount, {})).toBe(1);

    await sa.mutation(api.coachPermissions.approveCoachRequest, {
      requestId: perms.pending[0].requestId,
      level: "SENIOR",
    });
    const profile = await t.run((ctx) => ctx.db.get(ids.applicant.profileId));
    expect(profile).toMatchObject({ role: "COACH", clubId: ids.clubA, coachLevel: "SENIOR" });
    expect(await me.query(api.coachPermissions.myCoachRequest, {})).toBeNull();

    const after = await sa.query(api.coachPermissions.getClubPermissions, {});
    expect(after.history.map((h) => h.type)).toEqual(["APPROVED", "REQUESTED"]);
  });

  test("a rejection holds the waiting screen until dismissed", async () => {
    const { ids, as } = await setup();
    const me = as(ids.applicant);
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubA });
    const sa = as(ids.superA);
    const { pending } = await sa.query(api.coachPermissions.getClubPermissions, {});
    await sa.mutation(api.coachPermissions.rejectCoachRequest, {
      requestId: pending[0].requestId,
      reason: "We don't know you yet.",
    });
    const mine = await me.query(api.coachPermissions.myCoachRequest, {});
    expect(mine).toMatchObject({ status: "REJECTED", reason: "We don't know you yet." });

    await me.mutation(api.coachPermissions.dismissCoachRejection, {});
    expect(await me.query(api.coachPermissions.myCoachRequest, {})).toBeNull();

    // ...and they may then ask another club.
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubB });
  });

  test("one pending request at a time; cancelling frees it", async () => {
    const { ids, as } = await setup();
    const me = as(ids.applicant);
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubA });
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubA }); // idempotent
    await expect(
      me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubB }),
    ).rejects.toThrow(/another club/);
    await me.mutation(api.coachPermissions.cancelMyCoachRequest, {});
    await me.mutation(api.coachPermissions.requestCoachAccess, { clubId: ids.clubB });
  });

  test("another club's super coach and an assistant cannot decide it", async () => {
    const { ids, as } = await setup();
    await as(ids.applicant).mutation(api.coachPermissions.requestCoachAccess, {
      clubId: ids.clubA,
    });
    const { pending } = await as(ids.superA).query(
      api.coachPermissions.getClubPermissions,
      {},
    );
    const requestId = pending[0].requestId;
    await expect(
      as(ids.superB).mutation(api.coachPermissions.approveCoachRequest, {
        requestId,
        level: "SUPER",
      }),
    ).rejects.toThrow(/own club/);
    await expect(
      as(ids.juniorA).mutation(api.coachPermissions.approveCoachRequest, {
        requestId,
        level: "SUPER",
      }),
    ).rejects.toThrow();
    await expect(
      as(ids.superB).query(api.coachPermissions.getClubPermissions, { clubId: ids.clubA }),
    ).rejects.toThrow(/own club/);
  });

  test("the Admin decides any club's requests", async () => {
    const { ids, as } = await setup();
    await as(ids.applicant).mutation(api.coachPermissions.requestCoachAccess, {
      clubId: ids.clubB,
    });
    const admin = as(ids.admin);
    const { pending } = await admin.query(api.coachPermissions.getClubPermissions, {
      clubId: ids.clubB,
    });
    await admin.mutation(api.coachPermissions.approveCoachRequest, {
      requestId: pending[0].requestId,
      level: "JUNIOR",
    });
  });

  test("a coach cannot request coach access", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.juniorA).mutation(api.coachPermissions.requestCoachAccess, {
        clubId: ids.clubB,
      }),
    ).rejects.toThrow(/already have coach access/);
  });
});

describe("managing coaches", () => {
  test("level changes are recorded; an assistant cannot make them", async () => {
    const { ids, as } = await setup();
    const sa = as(ids.superA);
    await sa.mutation(api.coachPermissions.setCoachLevel, {
      profileId: ids.juniorA.profileId,
      level: "SENIOR",
    });
    const { coaches, history } = await sa.query(api.coachPermissions.getClubPermissions, {});
    expect(coaches.find((c) => c.name === "Junior A")?.level).toBe("SENIOR");
    expect(history[0]).toMatchObject({ type: "LEVEL_CHANGED", fromLevel: "JUNIOR", toLevel: "SENIOR" });

    await expect(
      as(ids.juniorA).mutation(api.coachPermissions.setCoachLevel, {
        profileId: ids.juniorA.profileId,
        level: "SUPER",
      }),
    ).rejects.toThrow();
  });

  test("the last super coach cannot be demoted or removed by the club", async () => {
    const { ids, as } = await setup();
    const sa = as(ids.superA);
    await expect(
      sa.mutation(api.coachPermissions.setCoachLevel, {
        profileId: ids.superA.profileId,
        level: "JUNIOR",
      }),
    ).rejects.toThrow(/at least one super coach/);
    await expect(
      sa.mutation(api.coachPermissions.removeClubCoach, { profileId: ids.superA.profileId }),
    ).rejects.toThrow(/at least one super coach/);

    // With a second super coach, either can step down.
    await sa.mutation(api.coachPermissions.setCoachLevel, {
      profileId: ids.juniorA.profileId,
      level: "SUPER",
    });
    await sa.mutation(api.coachPermissions.setCoachLevel, {
      profileId: ids.superA.profileId,
      level: "SENIOR",
    });
  });

  test("removing a coach makes them a viewer", async () => {
    const { t, ids, as } = await setup();
    await as(ids.superA).mutation(api.coachPermissions.removeClubCoach, {
      profileId: ids.juniorA.profileId,
    });
    const p = await t.run((ctx) => ctx.db.get(ids.juniorA.profileId));
    expect(p?.role).toBe("VIEWER");
    expect(p?.clubId).toBeUndefined();
    expect(p?.coachLevel).toBeUndefined();
  });

  test("the age split is bounded and super-coach only", async () => {
    const { ids, as } = await setup();
    const sa = as(ids.superA);
    await sa.mutation(api.coachPermissions.setJuniorMaxAge, { juniorMaxAge: 14 });
    expect(
      (await sa.query(api.coachPermissions.getClubPermissions, {})).club.juniorMaxAge,
    ).toBe(14);
    await expect(
      sa.mutation(api.coachPermissions.setJuniorMaxAge, { juniorMaxAge: 3 }),
    ).rejects.toThrow(/between/);
    await expect(
      as(ids.juniorA).mutation(api.coachPermissions.setJuniorMaxAge, { juniorMaxAge: 10 }),
    ).rejects.toThrow();
  });
});

describe("Admin invites carry a level", () => {
  test("redeeming skips approval and closes a pending request", async () => {
    const { t, ids, as } = await setup();
    await as(ids.applicant).mutation(api.coachPermissions.requestCoachAccess, {
      clubId: ids.clubA,
    });
    const token = "tok-123";
    await t.run((ctx) =>
      ctx.db.insert("coachInvites", {
        email: "applicant@x.test",
        clubId: ids.clubA,
        token,
        createdAt: 0,
        createdBy: ids.admin.profileId,
        coachLevel: "JUNIOR",
      }),
    );
    await as(ids.applicant).mutation(api.clubs.redeemCoachInvite, { token });
    const p = await t.run((ctx) => ctx.db.get(ids.applicant.profileId));
    expect(p).toMatchObject({ role: "COACH", coachLevel: "JUNIOR", clubId: ids.clubA });
    const { pending } = await as(ids.superA).query(
      api.coachPermissions.getClubPermissions,
      {},
    );
    expect(pending).toEqual([]);
  });
});
