/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Server-side authorization tests (the CLAUDE.md invariant: "coaches edit;
  viewers are read-only and see only their linked swimmer(s), enforced
  server-side in every query and mutation"). These exercise the REAL public
  functions through convex-test, so the role matrix is verified where it is
  enforced — a client can't be trusted to.
*/

// The two-dot pattern excludes *.test.ts files from the function registry.
const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });

    const swimmerA = await ctx.db.insert("swimmers", {
      name: "Ava Linked",
      dob: "2012-05-01",
      gender: "F",
      active: true,
      clubId: clubA,
      createdAt: 0,
    });
    const swimmerB = await ctx.db.insert("swimmers", {
      name: "Ben Unlinked",
      dob: "2011-03-02",
      gender: "M",
      active: true,
      clubId: clubB,
      createdAt: 0,
    });

    async function account(
      name: string,
      email: string,
      role: "SUPER_USER" | "COACH" | "VIEWER",
      clubId?: typeof clubA,
    ) {
      const userId = await ctx.db.insert("users", { name, email });
      await ctx.db.insert("profiles", {
        authId: userId,
        name,
        email,
        role,
        ...(clubId ? { clubId } : {}),
      });
      return userId;
    }

    const coachA = await account("Coach A", "coach@a.test", "COACH", clubA);
    const superUser = await account("Admin", "admin@x.test", "SUPER_USER");
    const viewer = await account("Parent", "parent@x.test", "VIEWER");

    // The viewer is linked to swimmer A only.
    const viewerProfile = await ctx.db
      .query("profiles")
      .withIndex("by_authId", (q) => q.eq("authId", viewer))
      .unique();
    await ctx.db.insert("swimmerAccess", {
      profileId: viewerProfile!._id,
      swimmerId: swimmerA,
    });

    return { clubA, clubB, swimmerA, swimmerB, coachA, superUser, viewer };
  });

  // @convex-dev/auth reads the user id from the identity subject's first
  // "|"-separated segment, so this is what a real signed-in session carries.
  const as = (userId: string) =>
    t.withIdentity({ subject: `${userId}|test-session` });

  return {
    t,
    ids,
    asCoach: as(ids.coachA),
    asSuper: as(ids.superUser),
    asViewer: as(ids.viewer),
  };
}

describe("signed-out callers", () => {
  test("cannot read coach queries", async () => {
    const { t } = await setup();
    await expect(t.query(api.swimmers.listSwimmers, {})).rejects.toThrow(
      /not signed in/i,
    );
  });

  test("cannot write", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.swimmers.addSwimmer, {
        name: "X",
        dob: "2012-01-01",
        gender: "F",
      }),
    ).rejects.toThrow(/not signed in/i);
  });
});

describe("viewer role (read-only, linked swimmers only)", () => {
  test("is rejected by coach-only queries", async () => {
    const { asViewer } = await setup();
    await expect(asViewer.query(api.swimmers.listSwimmers, {})).rejects.toThrow(
      /only coaches/i,
    );
  });

  test("is rejected by coach mutations", async () => {
    const { asViewer, ids } = await setup();
    await expect(
      asViewer.mutation(api.swimmers.addSwimmer, {
        name: "X",
        dob: "2012-01-01",
        gender: "F",
      }),
    ).rejects.toThrow(/only coaches/i);
    await expect(
      asViewer.mutation(api.swimmers.updateSwimmer, {
        swimmerId: ids.swimmerA,
        name: "Renamed by viewer",
      }),
    ).rejects.toThrow(/only coaches/i);
  });

  test("can read their linked swimmer but not an unlinked one", async () => {
    const { asViewer, ids } = await setup();
    await expect(
      asViewer.query(api.personalBests.getPersonalBests, {
        swimmerId: ids.swimmerA,
      }),
    ).resolves.toEqual([]);
    await expect(
      asViewer.query(api.personalBests.getPersonalBests, {
        swimmerId: ids.swimmerB,
      }),
    ).rejects.toThrow(/only view your own swimmer/i);
  });

  test("listForProfile scopes to linked swimmers; staff see everyone", async () => {
    const { asViewer, asCoach, ids } = await setup();

    const viewerList = await asViewer.query(api.swimmers.listForProfile, {});
    expect(viewerList.role).toBe("VIEWER");
    expect(viewerList.swimmers.map((s) => s._id)).toEqual([ids.swimmerA]);

    const coachList = await asCoach.query(api.swimmers.listForProfile, {});
    expect(coachList.role).toBe("COACH");
    expect(new Set(coachList.swimmers.map((s) => s._id))).toEqual(
      new Set([ids.swimmerA, ids.swimmerB]),
    );
  });
});

describe("coach role (edits scoped to their own club)", () => {
  test("edits an own-club swimmer", async () => {
    const { asCoach, t, ids } = await setup();
    await asCoach.mutation(api.swimmers.updateSwimmer, {
      swimmerId: ids.swimmerA,
      name: "Ava Renamed",
    });
    const swimmer = await t.run((ctx) => ctx.db.get(ids.swimmerA));
    expect(swimmer?.name).toBe("Ava Renamed");
  });

  test("cannot edit another club's swimmer", async () => {
    const { asCoach, ids } = await setup();
    await expect(
      asCoach.mutation(api.swimmers.updateSwimmer, {
        swimmerId: ids.swimmerB,
        name: "Poached",
      }),
    ).rejects.toThrow(/own club/i);
  });

  test("creates swimmers into their own club even when another is named", async () => {
    const { asCoach, t, ids } = await setup();
    const created = await asCoach.mutation(api.swimmers.addSwimmer, {
      name: "New Kid",
      dob: "2013-07-07",
      gender: "M",
      clubId: ids.clubB, // a coach's own club always wins over this
    });
    const swimmer = await t.run((ctx) => ctx.db.get(created));
    expect(swimmer?.clubId).toBe(ids.clubA);
  });

  test("is rejected by super-user-only mutations", async () => {
    const { asCoach } = await setup();
    await expect(
      asCoach.mutation(api.settings.setSeasonStart, { seasonStart: null }),
    ).rejects.toThrow(/super-user/i);
  });
});

describe("super-user role", () => {
  test("edits swimmers in any club", async () => {
    const { asSuper, t, ids } = await setup();
    await asSuper.mutation(api.swimmers.updateSwimmer, {
      swimmerId: ids.swimmerB,
      name: "Ben Global",
    });
    const swimmer = await t.run((ctx) => ctx.db.get(ids.swimmerB));
    expect(swimmer?.name).toBe("Ben Global");
  });

  test("passes the super-user gate coaches fail", async () => {
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.settings.setSeasonStart, { seasonStart: null }),
    ).resolves.toBeNull();
  });
});

describe("tours (dates are super-user reference data; qualification is role-scoped)", () => {
  test("coaches and viewers cannot write tour dates", async () => {
    const { asCoach, asViewer } = await setup();
    await expect(
      asCoach.mutation(api.tours.setTour, { tier: "SANJ", date: "2026-12-01" }),
    ).rejects.toThrow(/super-user/i);
    await expect(
      asViewer.mutation(api.tours.clearTour, { tier: "SANJ" }),
    ).rejects.toThrow(/super-user/i);
  });

  test("qualification is scoped: a viewer sees ONLY their linked swimmer", async () => {
    const { t, asViewer, asCoach, ids } = await setup();

    // Both swimmers qualify for SANJ 100 Free — Ava (F, linked to the viewer)
    // and Ben (M, unlinked).
    await t.run(async (ctx) => {
      const coachProfile = await ctx.db
        .query("profiles")
        .withIndex("by_authId", (q) => q.eq("authId", ids.coachA))
        .unique();
      for (const [swimmerId, gender] of [
        [ids.swimmerA, "F"],
        [ids.swimmerB, "M"],
      ] as const) {
        await ctx.db.insert("results", {
          swimmerId,
          distance: 100,
          stroke: "FREE",
          course: "LCM",
          timeMs: 69_000,
          swimType: "MEET",
          swimDate: "2025-06-01",
          ageAtSwim: 13,
          enteredBy: coachProfile!._id,
          createdAt: 0,
        });
        await ctx.db.insert("standards", {
          tier: "SANJ",
          gender,
          distance: 100,
          stroke: "FREE",
          age: 13,
          isCatchAllYoung: false,
          isCatchAllOld: false,
          timeMs: 70_000,
        });
      }
    });

    // The coach sees both; the viewer sees only Ava — across EVERY tier.
    const coachView = await asCoach.query(api.tours.getTourQualification, {});
    expect(
      new Set(
        coachView.tiers.flatMap((x) => x.swimmers.map((s) => s.swimmerId)),
      ),
    ).toEqual(new Set([ids.swimmerA, ids.swimmerB]));

    const viewerView = await asViewer.query(api.tours.getTourQualification, {});
    expect(
      viewerView.tiers.flatMap((x) => x.swimmers.map((s) => s.swimmerId)),
    ).toEqual([ids.swimmerA]);
    expect(viewerView.hasSwimmers).toBe(true);
  });

  test("a tour date flips qualification to the age on tour day", async () => {
    const { t, asSuper, asCoach, ids } = await setup();

    // Ava (dob 2012-05-01) swam a 100 Free LCM meet PB of 1:09.00 at age 13.
    // SANJ cuts: 1:10.00 at 13, 1:08.00 at 14 — she makes the 13 cut only.
    await t.run(async (ctx) => {
      const coachProfile = await ctx.db
        .query("profiles")
        .withIndex("by_authId", (q) => q.eq("authId", ids.coachA))
        .unique();
      await ctx.db.insert("results", {
        swimmerId: ids.swimmerA,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs: 69_000,
        swimType: "MEET",
        swimDate: "2025-06-01",
        ageAtSwim: 13,
        enteredBy: coachProfile!._id,
        createdAt: 0,
      });
      for (const cut of [
        { age: 13, timeMs: 70_000 },
        { age: 14, timeMs: 68_000 },
      ]) {
        await ctx.db.insert("standards", {
          tier: "SANJ",
          gender: "F",
          distance: 100,
          stroke: "FREE",
          age: cut.age,
          isCatchAllYoung: false,
          isCatchAllOld: false,
          timeMs: cut.timeMs,
        });
      }
    });

    // No tour date: judged at the age the PB was swum (13) → SANJ qualified.
    const before = await asCoach.query(api.tours.getTourQualification, {});
    const sanjBefore = before.tiers.find((x) => x.tier === "SANJ")!;
    expect(sanjBefore.swimmers.map((s) => s.swimmerId)).toEqual([ids.swimmerA]);

    // SANJ tour after her 14th birthday: judged at 14 (cut 1:08.00) → out.
    await asSuper.mutation(api.tours.setTour, {
      tier: "SANJ",
      date: "2026-12-01",
      name: "SANJ Nationals",
    });
    const after = await asCoach.query(api.tours.getTourQualification, {});
    const sanjAfter = after.tiers.find((x) => x.tier === "SANJ")!;
    expect(sanjAfter.tour).toEqual({ name: "SANJ Nationals", date: "2026-12-01" });
    expect(sanjAfter.swimmers).toEqual([]);

    // Clearing the date restores the as-swum judgement.
    await asSuper.mutation(api.tours.clearTour, { tier: "SANJ" });
    const restored = await asCoach.query(api.tours.getTourQualification, {});
    expect(
      restored.tiers.find((x) => x.tier === "SANJ")!.swimmers.map((s) => s.swimmerId),
    ).toEqual([ids.swimmerA]);
  });
});
