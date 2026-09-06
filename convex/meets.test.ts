/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/*
  Meets — the server boundary (§R19). Exercises the REAL public functions through
  convex-test, because the thing worth proving is not that a form hides a button
  but that a coach who calls the mutation directly is refused.

  Also pins the rules a meet's data must hold whatever the UI does: an end date
  never before the start, a single-day meet stored with NO end date rather than a
  duplicate one, a programme line that cannot claim an event this app does not
  have, and an import that corrects a meet without blanking the details the
  document it came from never mentioned.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });

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

    const superUser = await account("Admin", "admin@x.test", "SUPER_USER");
    const coach = await account("Coach", "coach@x.test", "COACH", club);
    const viewer = await account("Parent", "parent@x.test", "VIEWER");

    const swimmer = await ctx.db.insert("swimmers", {
      name: "Jane Doe",
      dob: "2012-04-01",
      gender: "F",
      active: true,
      clubId: club,
      createdAt: 0,
    });

    return {
      superUser: superUser.userId,
      coach: coach.userId,
      coachProfile: coach.profileId,
      viewer: viewer.userId,
      club,
      swimmer,
    };
  });

  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  return {
    t,
    ids,
    asSuper: as(ids.superUser),
    asCoach: as(ids.coach),
    asViewer: as(ids.viewer),
  };
}

/**
 * Sign a swimmer up for one programme line, straight into the table.
 *
 * The entry MUTATIONS have their own suite; what these tests need is only the
 * row's existence, so that the guards protecting it can be exercised without
 * depending on how it got there.
 */
async function signUp(
  { t, ids }: Pick<Awaited<ReturnType<typeof setup>>, "t" | "ids">,
  meetId: Id<"meets">,
  lineId: string,
  swimDate = "2026-09-12",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("meetEntries", {
      meetId,
      lineId,
      swimmerId: ids.swimmer,
      clubId: ids.club,
      meetStartDate: swimDate,
      swimDate,
      rawLabel: "Mixed 100 Freestyle",
      enteredBy: ids.coachProfile,
      createdAt: 0,
    }),
  );
}

/** The HAS programme, as the import sheet would hand it over. */
const HAS_EVENTS = [
  { eventNumber: 101, rawLabel: "Mixed 100 Freestyle", gender: "MIXED" as const, distance: 100 as const, stroke: "FREE" as const },
  { eventNumber: 103, rawLabel: "Mixed 100 Breaststroke", gender: "MIXED" as const, distance: 100 as const, stroke: "BREAST" as const },
  { eventNumber: 104, rawLabel: "Mixed 50 Freestyle", gender: "MIXED" as const, distance: 50 as const, stroke: "FREE" as const },
];

async function seedMeet(
  asSuper: Awaited<ReturnType<typeof setup>>["asSuper"],
  overrides: Record<string, unknown> = {},
) {
  return await asSuper.mutation(api.meets.createMeet, {
    name: "1st seeded",
    startDate: "2026-09-12",
    events: [],
    ...overrides,
  });
}

describe("who may write a meet", () => {
  test("only the super-user creates, edits, imports or deletes", async () => {
    const { asSuper, asCoach, asViewer } = await setup();
    const meetId = await seedMeet(asSuper);

    const args = { name: "Anything", startDate: "2026-09-12", events: [] };
    for (const actor of [asCoach, asViewer]) {
      await expect(actor.mutation(api.meets.createMeet, args)).rejects.toThrow(
        /super-user/i,
      );
      await expect(
        actor.mutation(api.meets.updateMeet, { meetId, ...args }),
      ).rejects.toThrow(/super-user/i);
      await expect(
        actor.mutation(api.meets.importMeet, { meetId, ...args, events: HAS_EVENTS }),
      ).rejects.toThrow(/super-user/i);
      await expect(
        actor.mutation(api.meets.deleteMeet, { meetId }),
      ).rejects.toThrow(/super-user/i);
    }

    // Nothing got through: the meet is untouched and still there.
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet?.name).toBe("1st seeded");
  });

  test("every signed-in role reads the calendar", async () => {
    const { asSuper, asCoach, asViewer } = await setup();
    await seedMeet(asSuper, { events: HAS_EVENTS });

    // Meets are global reference data: a viewer needs "when is my next gala"
    // as much as a coach does, and a fixture list holds nothing swimmer-scoped.
    for (const actor of [asSuper, asCoach, asViewer]) {
      const meets = await actor.query(api.meets.listMeets, {});
      expect(meets).toHaveLength(1);
      expect(meets[0].events).toHaveLength(3);
    }
  });

  test("a signed-out caller reads nothing", async () => {
    const { t, asSuper } = await setup();
    await seedMeet(asSuper);
    await expect(t.query(api.meets.listMeets, {})).rejects.toThrow(/signed in/i);
  });
});

describe("meet dates", () => {
  test("refuses an end date before the start", async () => {
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Backwards",
        startDate: "2026-11-30",
        endDate: "2026-11-28",
        events: [],
      }),
    ).rejects.toThrow(/before the start/i);
  });

  test("stores a single-day meet with no end date, even if one was sent", async () => {
    // "Ends the same day it starts" and "has no end date" must not be two
    // representations of one fact — they would render identically and compare
    // differently.
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, {
      startDate: "2026-09-12",
      endDate: "2026-09-12",
    });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet?.endDate).toBeNull();
  });

  test("refuses a run longer than a month", async () => {
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Typo'd year",
        startDate: "2026-09-12",
        endDate: "2027-09-12",
        events: [],
      }),
    ).rejects.toThrow(/longer than/i);
  });

  test("refuses a date that is not a real date", async () => {
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Nope",
        startDate: "2026-02-31",
        events: [],
      }),
    ).rejects.toThrow(/real date|YYYY-MM-DD/i);
  });
});

describe("programme validation", () => {
  test("keeps a line this app has no event for, without an event identity", async () => {
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, {
      events: [{ rawLabel: "Mixed 4x50 Free Relay", eventNumber: 110 }],
    });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    // No distance/stroke: a relay is programme content, never a swimmer's event.
    expect(meet?.events[0]).toMatchObject({
      rawLabel: "Mixed 4x50 Free Relay",
      eventNumber: 110,
    });
    expect(meet?.events[0]).not.toHaveProperty("distance");
    expect(meet?.events[0]).not.toHaveProperty("stroke");
    // Every stored line carries an identity, minted server-side, so a sign-up
    // has something to point at that survives an edit or a re-import.
    expect(typeof meet?.events[0].id).toBe("string");
  });

  test("refuses two events claiming one number", async () => {
    // The number IS the running order, so a duplicate makes every read surface
    // order the pair arbitrarily. Enforced here, not only in the form.
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Clashing",
        startDate: "2026-09-12",
        events: [
          { rawLabel: "Mixed 100 Free", eventNumber: 4 },
          { rawLabel: "Mixed 50 Fly", eventNumber: 4 },
        ],
      }),
    ).rejects.toThrow(/both numbered 4/i);
  });

  test("refuses a line claiming an event that does not exist", async () => {
    // 50 IM is off the whitelist (§4.3). The programme may SAY "50 IM"; it may
    // not be stored as the event, because everything downstream would key on it.
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Bad",
        startDate: "2026-09-12",
        events: [{ rawLabel: "Mixed 50 IM", distance: 50, stroke: "IM" }],
      }),
    ).rejects.toThrow(/not a real event/i);
  });

  test("refuses half an event", async () => {
    const { asSuper } = await setup();
    await expect(
      asSuper.mutation(api.meets.createMeet, {
        name: "Bad",
        startDate: "2026-09-12",
        events: [{ rawLabel: "Mixed 100", distance: 100 }],
      }),
    ).rejects.toThrow(/half an event/i);
  });
});

describe("import", () => {
  test("replaces a programme rather than appending to it", async () => {
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });

    const res = await asSuper.mutation(api.meets.importMeet, {
      meetId,
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      events: [HAS_EVENTS[0]],
    });
    expect(res).toMatchObject({ created: false, eventCount: 1 });

    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet?.events).toHaveLength(1);
  });

  test("corrects the seeded name and date it was attached to", async () => {
    // The whole point of attaching rather than creating: the seeded row says
    // 12 Sep and "1st seeded"; the real programme says the 11th and gives the
    // meet its full name. One meet, corrected — not two a day apart.
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper);

    await asSuper.mutation(api.meets.importMeet, {
      meetId,
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      venue: "Les Brown Pool",
      events: HAS_EVENTS,
    });

    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet).toMatchObject({
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      venue: "Les Brown Pool",
    });
    const all = await asSuper.query(api.meets.listMeets, {});
    expect(all).toHaveLength(1);
  });

  test("leaves details the programme never mentions alone", async () => {
    // A programme states no course, no end date and no gala tag. Blanking them
    // because the document is silent would destroy what someone typed in.
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, {
      startDate: "2026-11-28",
      endDate: "2026-11-30",
      course: "LCM",
      galaCode: "SANJ",
    });

    await asSuper.mutation(api.meets.importMeet, {
      meetId,
      name: "HAS senior champs",
      startDate: "2026-11-28",
      events: HAS_EVENTS,
    });

    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet).toMatchObject({
      endDate: "2026-11-30",
      course: "LCM",
      galaCode: "SANJ",
    });
  });

  test("refuses a programme dated after the meet's end date", async () => {
    // The import leaves endDate alone, so a later start date would leave the
    // meet dated backwards — and isUpcoming reads the END date, so a future
    // meet would quietly start reading as Past.
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, {
      name: "HAS senior champs",
      startDate: "2026-11-28",
      endDate: "2026-11-30",
    });

    await expect(
      asSuper.mutation(api.meets.importMeet, {
        meetId,
        name: "HAS senior champs",
        startDate: "2026-12-05",
        events: HAS_EVENTS,
      }),
    ).rejects.toThrow(/end date/i);

    // Refused outright: the programme is not half-applied.
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet).toMatchObject({ startDate: "2026-11-28", endDate: "2026-11-30" });
    expect(meet?.events).toEqual([]);
  });

  test("accepts a start date inside the meet's own span", async () => {
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, {
      startDate: "2026-11-28",
      endDate: "2026-11-30",
    });
    await asSuper.mutation(api.meets.importMeet, {
      meetId,
      name: "HAS senior champs",
      startDate: "2026-11-29",
      events: HAS_EVENTS,
    });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    expect(meet).toMatchObject({ startDate: "2026-11-29", endDate: "2026-11-30" });
  });

  test("creates a new meet when none is chosen", async () => {
    const { asSuper } = await setup();
    const res = await asSuper.mutation(api.meets.importMeet, {
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      events: HAS_EVENTS,
    });
    expect(res.created).toBe(true);
    expect(await asSuper.query(api.meets.listMeets, {})).toHaveLength(1);
  });
});

describe("calendar reads", () => {
  test("returns a multi-day meet in every month it touches", async () => {
    const { asSuper, asViewer } = await setup();
    await seedMeet(asSuper, {
      name: "Month straddler",
      startDate: "2026-10-31",
      endDate: "2026-11-02",
    });

    // November contains only the TAIL of this meet. A naive startDate-only
    // range read would drop it from the month a coach is looking at.
    const november = await asViewer.query(api.meets.listMeetsInRange, {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(november.map((m) => m.name)).toEqual(["Month straddler"]);

    const october = await asViewer.query(api.meets.listMeetsInRange, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(october).toHaveLength(1);

    const december = await asViewer.query(api.meets.listMeetsInRange, {
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(december).toEqual([]);
  });

  test("pre-fills the log form's meet name from the calendar", async () => {
    const { asSuper, asCoach } = await setup();
    await seedMeet(asSuper, {
      name: "HAS senior champs",
      startDate: "2026-11-28",
      endDate: "2026-11-30",
    });

    // Any day of the meet, not only its first — a time swum on day two was
    // still swum at that meet.
    for (const date of ["2026-11-28", "2026-11-29", "2026-11-30"]) {
      expect(await asCoach.query(api.meets.meetNameForDate, { date })).toBe(
        "HAS senior champs",
      );
    }
    expect(
      await asCoach.query(api.meets.meetNameForDate, { date: "2026-12-01" }),
    ).toBeNull();
    // A malformed date is answered with "no meet", never an exception into a
    // half-typed field on the log form.
    expect(
      await asCoach.query(api.meets.meetNameForDate, { date: "not-a-date" }),
    ).toBeNull();
  });
});

describe("delete", () => {
  test("removes the meet and is safe to repeat", async () => {
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });

    await asSuper.mutation(api.meets.deleteMeet, { meetId });
    expect(await asSuper.query(api.meets.getMeet, { meetId })).toBeNull();
    // Deleting twice is not an error — two clicks on a slow connection must not
    // surface a failure for something that already succeeded.
    await asSuper.mutation(api.meets.deleteMeet, { meetId });
    expect(await asSuper.query(api.meets.listMeets, {})).toEqual([]);
  });

  test("refuses while swimmers are signed up, and says how many", async () => {
    const ctx = await setup();
    const { asSuper } = ctx;
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    await signUp(ctx, meetId, meet!.events[0].id!);

    await expect(
      asSuper.mutation(api.meets.deleteMeet, { meetId }),
    ).rejects.toThrow(/1 sign-up/i);
    // The meet is still there: a refusal is not a partial delete.
    expect(await asSuper.query(api.meets.getMeet, { meetId })).not.toBeNull();
  });

  test("keeps a linked swim and its meet name, clearing only the link", async () => {
    // A meet can be deleted once nobody is entered; a swim that happened still
    // happened. It keeps the words the coach typed and loses only the join.
    const ctx = await setup();
    const { asSuper, t, ids } = ctx;
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });
    const resultId = await t.run(async (c) =>
      c.db.insert("results", {
        swimmerId: ids.swimmer,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs: 70_000,
        swimType: "MEET",
        swimDate: "2026-09-12",
        ageAtSwim: 14,
        meetName: "1st seeded",
        meetId,
        enteredBy: ids.coachProfile,
        createdAt: 0,
      }),
    );

    await asSuper.mutation(api.meets.deleteMeet, { meetId });

    const after = await t.run(async (c) => c.db.get(resultId));
    expect(after).not.toBeNull();
    expect(after?.meetId).toBeUndefined();
    expect(after?.meetName).toBe("1st seeded");
  });
});

describe("programme line identity", () => {
  test("re-importing the same programme keeps every line's id", async () => {
    // The case the whole mechanism exists for: a corrected document is parsed
    // again, arrives with no ids, and must not strand the sign-ups behind it.
    const { asSuper } = await setup();
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });
    const before = await asSuper.query(api.meets.getMeet, { meetId });

    await asSuper.mutation(api.meets.importMeet, {
      meetId,
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      venue: "Les Brown Pool",
      // Re-parsed from the document: the same lines, re-cased, and — as the
      // parser always produces — carrying no ids at all.
      events: HAS_EVENTS.map((line) => ({
        ...line,
        rawLabel: line.rawLabel.toUpperCase(),
      })),
    });

    const after = await asSuper.query(api.meets.getMeet, { meetId });
    expect(after!.events.map((e) => e.id)).toEqual(before!.events.map((e) => e.id));
  });

  test("a genuinely new line gets a new id, and a vanished one is reported", async () => {
    const ctx = await setup();
    const { asSuper } = ctx;
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });
    const before = await asSuper.query(api.meets.getMeet, { meetId });
    const droppedLineId = before!.events[2].id!;
    await signUp(ctx, meetId, droppedLineId);

    // The third line is gone; a different event takes its place.
    const events = [
      ...HAS_EVENTS.slice(0, 2),
      {
        eventNumber: 106,
        rawLabel: "Mixed 200 Backstroke",
        gender: "MIXED" as const,
        distance: 200 as const,
        stroke: "BACK" as const,
      },
    ];

    // Dropping a line somebody is entered for needs an explicit confirmation.
    await expect(
      asSuper.mutation(api.meets.updateMeet, {
        meetId,
        name: "1st seeded",
        startDate: "2026-09-12",
        events,
      }),
    ).rejects.toThrow(/signed up for/i);

    await asSuper.mutation(api.meets.updateMeet, {
      meetId,
      name: "1st seeded",
      startDate: "2026-09-12",
      events,
      allowDroppingEntries: true,
    });

    const after = await asSuper.query(api.meets.getMeet, { meetId });
    expect(after!.events[0].id).toBe(before!.events[0].id);
    expect(after!.events[2].id).not.toBe(droppedLineId);
    // The sign-up went with the line it pointed at; nothing is left dangling.
    const left = await ctx.t.run(async (c) => c.db.query("meetEntries").collect());
    expect(left).toEqual([]);
  });

  test("never drops a line whose entry carries a recorded time", async () => {
    const ctx = await setup();
    const { asSuper, t, ids } = ctx;
    const meetId = await seedMeet(asSuper, { events: HAS_EVENTS });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    const entryId = await signUp(ctx, meetId, meet!.events[0].id!);
    await t.run(async (c) => {
      const resultId = await c.db.insert("results", {
        swimmerId: ids.swimmer,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs: 70_000,
        swimType: "MEET",
        swimDate: "2026-09-12",
        ageAtSwim: 14,
        enteredBy: ids.coachProfile,
        createdAt: 0,
      });
      await c.db.patch(entryId, { resultId });
    });

    // Even WITH the confirmation: a swim is deleted on the tombstoned delete
    // path, never as a side effect of re-reading a programme.
    await expect(
      asSuper.mutation(api.meets.updateMeet, {
        meetId,
        name: "1st seeded",
        startDate: "2026-09-12",
        events: HAS_EVENTS.slice(1),
        allowDroppingEntries: true,
      }),
    ).rejects.toThrow(/recorded time/i);
  });

  test("moves entries with the meet when its dates change", async () => {
    const ctx = await setup();
    const { asSuper, t } = ctx;
    const meetId = await seedMeet(asSuper, {
      events: HAS_EVENTS,
      endDate: "2026-09-14",
    });
    const meet = await asSuper.query(api.meets.getMeet, { meetId });
    // Entered on day 3, which the new dates will not include.
    const entryId = await signUp(ctx, meetId, meet!.events[0].id!, "2026-09-14");

    await asSuper.mutation(api.meets.updateMeet, {
      meetId,
      name: "1st seeded",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      events: HAS_EVENTS,
    });

    const entry = await t.run(async (c) => c.db.get(entryId));
    expect(entry?.meetStartDate).toBe("2026-10-01");
    // A day the meet no longer runs on would give the swim a wrong `ageAtSwim`,
    // so it is pulled back to the first day rather than left behind.
    expect(entry?.swimDate).toBe("2026-10-01");
  });
});

describe("backfills", () => {
  test("gives legacy programme lines an identity, once", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("meets", {
        name: "Legacy",
        startDate: "2026-03-01",
        events: [{ rawLabel: "Mixed 100 Free" }, { rawLabel: "Mixed 50 Fly" }],
        createdAt: 0,
      });
    });

    expect(
      await t.mutation(internal.migrations.meets.backfillMeetEventIds, {}),
    ).toEqual({ meets: 1, lines: 2 });

    const ids = await t.run(async (ctx) => {
      const meet = (await ctx.db.query("meets").first())!;
      return meet.events.map((e) => e.id);
    });
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(2);

    // Idempotent — and an id already issued is the link, so it is never redealt.
    expect(
      await t.mutation(internal.migrations.meets.backfillMeetEventIds, {}),
    ).toEqual({ meets: 0, lines: 0 });
  });

  test("links a logged swim to the meet it names, and refuses to guess", async () => {
    const { t, ids, asSuper } = await setup();
    const meetId = await seedMeet(asSuper, { name: "Winter Gala" });

    const insertResult = (meetName: string, swimDate: string) =>
      t.run(async (ctx) =>
        ctx.db.insert("results", {
          swimmerId: ids.swimmer,
          distance: 100,
          stroke: "FREE",
          course: "LCM",
          timeMs: 70_000,
          swimType: "MEET",
          swimDate,
          ageAtSwim: 14,
          meetName,
          enteredBy: ids.coachProfile,
          createdAt: 0,
        }),
      );

    // Same meet, differently spelled; and one swum on a day nothing was on.
    const matching = await insertResult("winter  GALA", "2026-09-12");
    const elsewhere = await insertResult("Winter Gala", "2026-11-01");

    expect(
      await t.mutation(internal.migrations.meets.linkResultsToMeets, {}),
    ).toMatchObject({ linked: 1, ambiguous: 0 });

    const [a, b] = await t.run(async (ctx) => [
      await ctx.db.get(matching),
      await ctx.db.get(elsewhere),
    ]);
    expect(a?.meetId).toBe(meetId);
    expect(b?.meetId).toBeUndefined();
  });

  test("counts a genuine ambiguity rather than picking one", async () => {
    const { t, ids, asSuper } = await setup();
    await seedMeet(asSuper, { name: "Club Gala", startDate: "2026-09-12" });
    await seedMeet(asSuper, { name: "CLUB GALA", startDate: "2026-09-12" });
    await t.run(async (ctx) =>
      ctx.db.insert("results", {
        swimmerId: ids.swimmer,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs: 70_000,
        swimType: "MEET",
        swimDate: "2026-09-12",
        ageAtSwim: 14,
        meetName: "Club Gala",
        enteredBy: ids.coachProfile,
        createdAt: 0,
      }),
    );

    expect(
      await t.mutation(internal.migrations.meets.linkResultsToMeets, {}),
    ).toMatchObject({ linked: 0, ambiguous: 1 });
  });

  test("leaves a trial or a practice swim alone", async () => {
    // Only a MEET swim belongs to a meet. A time trial run on a gala day is
    // still a time trial, and attaching it would put it on the meet's sheet.
    const { t, ids, asSuper } = await setup();
    await seedMeet(asSuper, { name: "Winter Gala" });
    await t.run(async (ctx) =>
      ctx.db.insert("results", {
        swimmerId: ids.swimmer,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        timeMs: 70_000,
        swimType: "TIME_TRIAL",
        swimDate: "2026-09-12",
        ageAtSwim: 14,
        meetName: "Winter Gala",
        enteredBy: ids.coachProfile,
        createdAt: 0,
      }),
    );

    expect(
      await t.mutation(internal.migrations.meets.linkResultsToMeets, {}),
    ).toMatchObject({ linked: 0, scanned: 0 });
  });
});

describe("seeding the season's fixtures", () => {
  test("loads the 15 fixtures once and never duplicates them", async () => {
    const { t, asSuper } = await setup();

    const first = await t.mutation(internal.migrations.meets.seedMeets, {});
    expect(first).toEqual({ inserted: 15, skipped: 0 });
    expect(await asSuper.query(api.meets.listMeets, {})).toHaveLength(15);

    // Re-running after a deploy must be a no-op, not a second calendar.
    const second = await t.mutation(internal.migrations.meets.seedMeets, {});
    expect(second).toEqual({ inserted: 0, skipped: 15 });
    expect(await asSuper.query(api.meets.listMeets, {})).toHaveLength(15);
  });

  test("never undoes a correction someone already made", async () => {
    // The seed dates the 1st seeded gala 12 Sep; the real programme says the
    // 11th. Once an import has corrected the row, re-seeding must not restore
    // the wrong date or add a second meet a day away.
    const { t, asSuper } = await setup();
    await t.mutation(internal.migrations.meets.seedMeets, {});

    const seeded = await asSuper.query(api.meets.listMeets, {});
    const firstSeeded = seeded.find((m) => m.name === "1st seeded")!;
    await asSuper.mutation(api.meets.importMeet, {
      meetId: firstSeeded._id,
      name: "HAS 1ST SEEDED GALA 2026",
      startDate: "2026-09-11",
      events: HAS_EVENTS,
    });

    await t.mutation(internal.migrations.meets.seedMeets, {});
    const after = await asSuper.query(api.meets.listMeets, {});
    const corrected = after.find((m) => m.startDate === "2026-09-11");
    expect(corrected?.name).toBe("HAS 1ST SEEDED GALA 2026");
    expect(corrected?.events).toHaveLength(3);
    // The stale seed row is gone for good, not re-added beside the corrected
    // one — the seed keys on a stamped seedKey, not on the name and date the
    // import just changed.
    expect(after.filter((m) => m.name === "1st seeded")).toEqual([]);
    expect(after.filter((m) => m.startDate === "2026-09-12")).toEqual([]);
    expect(after).toHaveLength(15);
  });

  test("puts the calendar in reach of the log form's pre-fill", async () => {
    const { t, asCoach } = await setup();
    await t.mutation(internal.migrations.meets.seedMeets, {});
    expect(
      await asCoach.query(api.meets.meetNameForDate, { date: "2026-10-17" }),
    ).toBe("National Sprint");
  });
});
