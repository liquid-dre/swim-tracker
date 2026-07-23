/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Session-attendance authorization + rule tests (§R18). Exercises the REAL public
  functions through convex-test so the coach/viewer boundary, the future-session
  rule, generation/freeze, the delete guard, roster dedup and viewer note-stripping
  are all verified where they're enforced.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// Far-future window so pattern generation always materialises (dates > today), and
// a clearly-past date for freeze tests — both avoid any "today" boundary flakiness.
const SEASON_START = "2999-01-01";
const SEASON_END = "2999-01-31";
const FUTURE_MONDAY = "2999-01-04"; // a Monday in the window
const PAST_DATE = "2020-01-06"; // a Monday, safely before today

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });

    const squadX = await ctx.db.insert("squads", { name: "Seniors" });
    const squadY = await ctx.db.insert("squads", { name: "Juniors" });

    const swimmerA = await ctx.db.insert("swimmers", {
      name: "Ava Linked",
      dob: "2012-05-01",
      gender: "F",
      active: true,
      clubId: clubA,
      createdAt: 0,
    });
    const swimmerC = await ctx.db.insert("swimmers", {
      name: "Cara Club-A",
      dob: "2011-02-02",
      gender: "F",
      active: true,
      clubId: clubA,
      createdAt: 0,
    });
    const swimmerB = await ctx.db.insert("swimmers", {
      name: "Ben Club-B",
      dob: "2011-03-02",
      gender: "M",
      active: true,
      clubId: clubB,
      createdAt: 0,
    });

    // swimmerA is in BOTH squads (roster-dedup test); swimmerC in squadX only.
    await ctx.db.insert("squadMemberships", { swimmerId: swimmerA, squadId: squadX });
    await ctx.db.insert("squadMemberships", { swimmerId: swimmerA, squadId: squadY });
    await ctx.db.insert("squadMemberships", { swimmerId: swimmerC, squadId: squadX });

    await ctx.db.insert("settings", {
      key: "app",
      seasonStart: SEASON_START,
      seasonEnd: SEASON_END,
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
    const coachB = await account("Coach B", "coach@b.test", "COACH", clubB);
    const viewer = await account("Parent", "parent@x.test", "VIEWER");

    const viewerProfile = await ctx.db
      .query("profiles")
      .withIndex("by_authId", (q) => q.eq("authId", viewer))
      .unique();
    await ctx.db.insert("swimmerAccess", {
      profileId: viewerProfile!._id,
      swimmerId: swimmerA,
    });

    return { clubA, clubB, squadX, squadY, swimmerA, swimmerB, swimmerC, coachA, coachB, viewer };
  });

  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  return {
    t,
    ids,
    asCoachA: as(ids.coachA),
    asCoachB: as(ids.coachB),
    asViewer: as(ids.viewer),
  };
}

/** Create a one-off session in clubA on `date` targeting the given squads. */
async function oneOff(
  asCoach: ReturnType<Awaited<ReturnType<typeof setup>>["t"]["withIdentity"]>,
  date: string,
  squadIds: unknown[],
) {
  return await asCoach.mutation(api.sessions.createOneOffSession, {
    date,
    startMin: 990, // 16:30
    endMin: 1080, // 18:00
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    squadIds: squadIds as any,
  });
}

describe("authorization", () => {
  test("a viewer cannot create patterns, sessions or marks", async () => {
    const { asViewer, ids } = await setup();
    await expect(
      asViewer.mutation(api.sessionPatterns.createPattern, {
        name: "x",
        weekdays: [1],
        startMin: 990,
        endMin: 1080,
        squadIds: [ids.squadX],
      }),
    ).rejects.toThrow();
    await expect(oneOff(asViewer, PAST_DATE, [ids.squadX])).rejects.toThrow();
  });

  test("a coach cannot mark on another club's session", async () => {
    const { asCoachA, asCoachB, ids } = await setup();
    const sessionB = await oneOff(asCoachB, PAST_DATE, [ids.squadX]);
    // coachA doesn't manage clubB's session.
    await expect(
      asCoachA.mutation(api.attendance.markAttendance, {
        sessionId: sessionB,
        swimmerId: ids.swimmerB,
        status: "PRESENT",
      }),
    ).rejects.toThrow();
  });

  test("a coach cannot mark a swimmer outside their club", async () => {
    const { asCoachA, ids } = await setup();
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadX]);
    await expect(
      asCoachA.mutation(api.attendance.markAttendance, {
        sessionId: session,
        swimmerId: ids.swimmerB, // clubB swimmer
        status: "PRESENT",
      }),
    ).rejects.toThrow();
  });
});

describe("marking rules", () => {
  test("future session accepts only EXCUSED", async () => {
    const { asCoachA, ids } = await setup();
    const future = await oneOff(asCoachA, FUTURE_MONDAY, [ids.squadX]);
    await expect(
      asCoachA.mutation(api.attendance.markAttendance, {
        sessionId: future,
        swimmerId: ids.swimmerA,
        status: "PRESENT",
      }),
    ).rejects.toThrow();
    // EXCUSED is allowed ahead of time.
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: future,
      swimmerId: ids.swimmerA,
      status: "EXCUSED",
    });
    await expect(
      asCoachA.mutation(api.attendance.markAllRemainingPresent, { sessionId: future }),
    ).rejects.toThrow();
  });

  test("a swimmer not on the roster can't be marked", async () => {
    const { asCoachA, ids } = await setup();
    // Session targets squadY only; swimmerC is in squadX only → not on roster.
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadY]);
    await expect(
      asCoachA.mutation(api.attendance.markAttendance, {
        sessionId: session,
        swimmerId: ids.swimmerC,
        status: "PRESENT",
      }),
    ).rejects.toThrow();
  });

  test("mark-all-remaining-present fills only the unmarked", async () => {
    const { asCoachA, ids } = await setup();
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadX]); // roster: A + C
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: session,
      swimmerId: ids.swimmerA,
      status: "ABSENT",
    });
    const { marked } = await asCoachA.mutation(api.attendance.markAllRemainingPresent, {
      sessionId: session,
    });
    expect(marked).toBe(1); // only swimmerC was unmarked
    const roster = await asCoachA.query(api.sessions.getSessionRoster, { sessionId: session });
    const byName = Object.fromEntries(roster.roster.map((r) => [r.name, r.status]));
    expect(byName["Ava Linked"]).toBe("ABSENT");
    expect(byName["Cara Club-A"]).toBe("PRESENT");
  });

  test("cannot mark a cancelled session", async () => {
    const { asCoachA, ids } = await setup();
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadX]);
    await asCoachA.mutation(api.sessions.cancelSession, { sessionId: session });
    await expect(
      asCoachA.mutation(api.attendance.markAttendance, {
        sessionId: session,
        swimmerId: ids.swimmerA,
        status: "PRESENT",
      }),
    ).rejects.toThrow();
  });
});

describe("roster", () => {
  test("a swimmer in two target squads appears once", async () => {
    const { asCoachA, ids } = await setup();
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadX, ids.squadY]);
    const roster = await asCoachA.query(api.sessions.getSessionRoster, { sessionId: session });
    const avaRows = roster.roster.filter((r) => r.name === "Ava Linked");
    expect(avaRows).toHaveLength(1);
  });
});

describe("delete guard", () => {
  test("cannot delete a marked one-off; can delete a clean one-off", async () => {
    const { asCoachA, ids } = await setup();
    const clean = await oneOff(asCoachA, PAST_DATE, [ids.squadX]);
    const marked = await oneOff(asCoachA, PAST_DATE, [ids.squadX]);
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: marked,
      swimmerId: ids.swimmerA,
      status: "PRESENT",
    });
    await expect(
      asCoachA.mutation(api.sessions.deleteSession, { sessionId: marked }),
    ).rejects.toThrow();
    await asCoachA.mutation(api.sessions.deleteSession, { sessionId: clean }); // ok
  });

  test("cannot delete a pattern-generated session", async () => {
    const { asCoachA, ids, t } = await setup();
    await asCoachA.mutation(api.sessionPatterns.createPattern, {
      name: "Evening",
      weekdays: [1],
      startMin: 990,
      endMin: 1080,
      squadIds: [ids.squadX],
    });
    const generated = await t.run(async (ctx) => ctx.db.query("sessions").take(50));
    const patternSession = generated.find((s) => s.patternId);
    expect(patternSession).toBeDefined();
    await expect(
      asCoachA.mutation(api.sessions.deleteSession, { sessionId: patternSession!._id }),
    ).rejects.toThrow();
  });
});

describe("generation and freeze", () => {
  test("createPattern materialises future Mondays; regeneration freezes marked and past, refreshes the rest", async () => {
    const { asCoachA, ids, t } = await setup();
    const { generated } = await asCoachA.mutation(api.sessionPatterns.createPattern, {
      name: "Evening",
      weekdays: [1],
      startMin: 990,
      endMin: 1080,
      squadIds: [ids.squadX],
    });
    expect(generated).toBeGreaterThanOrEqual(4); // Mondays in Jan 2999

    const sessions = await t.run(async (ctx) =>
      ctx.db.query("sessions").withIndex("by_date").take(100),
    );
    const patternId = sessions.find((s) => s.patternId)!.patternId!;

    // Mark one future session EXCUSED (allowed ahead of time) — it must freeze.
    const toMark = sessions[0];
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: toMark._id,
      swimmerId: ids.swimmerA,
      status: "EXCUSED",
    });

    // Inject a genuinely-past session for this pattern to test the date<today branch.
    const pastId = await t.run(async (ctx) =>
      ctx.db.insert("sessions", {
        clubId: ids.clubA,
        date: PAST_DATE,
        startMin: 990,
        endMin: 1080,
        squadIds: [ids.squadX],
        patternId,
        status: "SCHEDULED" as const,
        overridden: false,
        createdBy: (await ctx.db.query("profiles").first())!._id,
        createdAt: 0,
      }),
    );

    // Change the pattern's start time; regeneration refreshes only clean future rows.
    await asCoachA.mutation(api.sessionPatterns.updatePattern, {
      patternId,
      startMin: 1020, // 17:00
    });

    const after = await t.run(async (ctx) => ctx.db.query("sessions").take(200));
    const marked = after.find((s) => s._id === toMark._id)!;
    const past = after.find((s) => s._id === pastId)!;
    const cleanFuture = after.filter(
      (s) => s.patternId === patternId && s._id !== toMark._id && s.date >= "2999",
    );
    expect(marked.startMin).toBe(990); // frozen (had a mark)
    expect(past.startMin).toBe(990); // frozen (in the past)
    expect(cleanFuture.every((s) => s.startMin === 1020)).toBe(true); // refreshed
  });

  test("a hand-overridden future session survives regeneration", async () => {
    const { asCoachA, ids, t } = await setup();
    await asCoachA.mutation(api.sessionPatterns.createPattern, {
      name: "Evening",
      weekdays: [1],
      startMin: 990,
      endMin: 1080,
      squadIds: [ids.squadX],
    });
    const sessions = await t.run(async (ctx) => ctx.db.query("sessions").take(100));
    const target = sessions[0];
    const patternId = target.patternId!;
    // Hand-edit one occurrence to 06:00.
    await asCoachA.mutation(api.sessions.updateSession, {
      sessionId: target._id,
      startMin: 360,
      endMin: 420,
    });
    await asCoachA.mutation(api.sessionPatterns.updatePattern, { patternId, startMin: 1020 });
    const after = await t.run(async (ctx) => ctx.db.get(target._id));
    expect(after!.startMin).toBe(360); // override preserved
  });
});

describe("viewer note-stripping", () => {
  test("a viewer sees status but not a private note unless flagged visible", async () => {
    const { asCoachA, asViewer, ids } = await setup();
    const session = await oneOff(asCoachA, PAST_DATE, [ids.squadX]);
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: session,
      swimmerId: ids.swimmerA,
      status: "LATE",
      note: "arrived 10 min late",
      noteVisibleToViewer: false,
    });

    const view1 = await asViewer.query(api.attendance.getViewerCalendar, {
      from: "2019-01-01",
      to: "2021-12-31",
    });
    const s1 = view1.sessions.find((s) => s._id === session);
    expect(s1).toBeDefined();
    const a1 = s1!.perSwimmer.find((p) => p.swimmerId === ids.swimmerA)!;
    expect(a1.status).toBe("LATE");
    expect(a1.note).toBeNull(); // hidden from the viewer

    // Flag the note visible → the viewer now sees it.
    await asCoachA.mutation(api.attendance.markAttendance, {
      sessionId: session,
      swimmerId: ids.swimmerA,
      status: "LATE",
      note: "arrived 10 min late",
      noteVisibleToViewer: true,
    });
    const view2 = await asViewer.query(api.attendance.getViewerCalendar, {
      from: "2019-01-01",
      to: "2021-12-31",
    });
    const a2 = view2.sessions
      .find((s) => s._id === session)!
      .perSwimmer.find((p) => p.swimmerId === ids.swimmerA)!;
    expect(a2.note).toBe("arrived 10 min late");
  });

  test("a viewer cannot read a swimmer they aren't linked to", async () => {
    const { asViewer, ids } = await setup();
    await expect(
      asViewer.query(api.attendance.getViewerCalendar, {
        from: "2019-01-01",
        to: "2021-12-31",
        swimmerId: ids.swimmerB,
      }),
    ).rejects.toThrow();
  });
});
