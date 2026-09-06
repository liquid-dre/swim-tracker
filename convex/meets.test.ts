/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
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
      await ctx.db.insert("profiles", {
        authId: userId,
        name,
        email,
        role,
        ...(clubId ? { clubId } : {}),
      });
      return userId;
    }

    const superUser = await account("Admin", "admin@x.test", "SUPER_USER");
    const coach = await account("Coach", "coach@x.test", "COACH", club);
    const viewer = await account("Parent", "parent@x.test", "VIEWER");

    return { superUser, coach, viewer };
  });

  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  return {
    t,
    asSuper: as(ids.superUser),
    asCoach: as(ids.coach),
    asViewer: as(ids.viewer),
  };
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
    expect(meet?.events[0]).toEqual({
      rawLabel: "Mixed 4x50 Free Relay",
      eventNumber: 110,
    });
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
