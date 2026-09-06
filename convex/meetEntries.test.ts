/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/*
  Meet sign-ups — the server boundary (§R19).

  Two boundaries meet here and both are worth proving through the real public
  functions rather than a hidden button: the MEET is super-user reference data,
  while an ENTRY on it is club-scoped and coach-owned. So a coach signs their
  own swimmers up for a fixture they cannot edit, and can never see or touch
  another club's entries on that same fixture.

  The other thing pinned here is what a recorded time MEANS: the PB going into
  the meet, which must never borrow the other course, never count a swim from
  after the meet, and never let day one become day three's baseline.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

const PROGRAMME = [
  { eventNumber: 1, rawLabel: "Mixed 100 Free", gender: "MIXED" as const, distance: 100 as const, stroke: "FREE" as const },
  { eventNumber: 2, rawLabel: "Girls 50 Fly", gender: "F" as const, distance: 50 as const, stroke: "FLY" as const },
  { eventNumber: 3, rawLabel: "Boys 50 Fly", gender: "M" as const, distance: 50 as const, stroke: "FLY" as const },
  { eventNumber: 4, rawLabel: "Mixed 4 x 50 Free Relay" },
];

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.events.seedEvents, {});

  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });

    async function account(
      name: string,
      email: string,
      role: "SUPER_USER" | "COACH" | "VIEWER",
      clubId?: Id<"clubs">,
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

    const swimmer = async (name: string, gender: "M" | "F", clubId: Id<"clubs">) =>
      await ctx.db.insert("swimmers", {
        name,
        dob: "2010-04-01",
        gender,
        active: true,
        clubId,
        createdAt: 0,
      });

    const superUser = await account("Admin", "admin@x.test", "SUPER_USER");
    const coachA = await account("Coach A", "a@x.test", "COACH", clubA);
    const coachB = await account("Coach B", "b@x.test", "COACH", clubB);
    const parent = await account("Parent", "p@x.test", "VIEWER");

    const jane = await swimmer("Jane Doe", "F", clubA);
    const ben = await swimmer("Ben Smith", "M", clubA);
    const rival = await swimmer("Rival Kid", "F", clubB);

    await ctx.db.insert("swimmerAccess", {
      profileId: parent.profileId,
      swimmerId: jane,
    });

    return {
      superUser: superUser.userId,
      coachA: coachA.userId,
      coachAProfile: coachA.profileId,
      coachB: coachB.userId,
      parent: parent.userId,
      clubA,
      clubB,
      jane,
      ben,
      rival,
    };
  });

  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  const asSuper = as(ids.superUser);

  const meetId = await asSuper.mutation(api.meets.createMeet, {
    name: "Winter Gala",
    startDate: "2026-03-14",
    venue: "Les Brown Pool",
    course: "LCM",
    events: PROGRAMME,
  });
  const meet = await asSuper.query(api.meets.getMeet, { meetId });
  const lines = Object.fromEntries(
    meet!.events.map((e) => [e.rawLabel, e.id!]),
  ) as Record<string, string>;

  return {
    t,
    ids,
    meetId,
    lines,
    asSuper,
    asCoachA: as(ids.coachA),
    asCoachB: as(ids.coachB),
    asParent: as(ids.parent),
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** Record a swim directly, so PB fixtures can predate the meet. */
async function history(
  { t, ids }: Pick<Ctx, "t" | "ids">,
  over: {
    swimmerId?: Id<"swimmers">;
    distance?: 50 | 100;
    stroke?: string;
    course?: "SCM" | "LCM";
    timeMs: number;
    swimDate: string;
    swimType?: "MEET" | "TIME_TRIAL";
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("results", {
      swimmerId: over.swimmerId ?? ids.jane,
      distance: over.distance ?? 100,
      stroke: (over.stroke ?? "FREE") as "FREE",
      course: over.course ?? "LCM",
      timeMs: over.timeMs,
      swimType: over.swimType ?? "MEET",
      swimDate: over.swimDate,
      ageAtSwim: 14,
      enteredBy: ids.coachAProfile,
      createdAt: 0,
    }),
  );
}

/** The one line's rows out of the whole sheet. */
async function sheetLine(ctx: Ctx, lineId: string) {
  const sheet = await ctx.asCoachA.query(api.meetEntries.getMeetSignups, {
    meetId: ctx.meetId,
  });
  return sheet.lines.find((l) => l.lineId === lineId)!;
}

let c: Ctx;
beforeEach(async () => {
  c = await setup();
});

describe("who may sign a swimmer up", () => {
  test("a viewer cannot write anything, however they call it", async () => {
    await expect(
      c.asParent.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: c.lines["Mixed 100 Free"],
        swimmerIds: [c.ids.jane],
      }),
    ).rejects.toThrow(/coach/i);
  });

  test("a coach cannot enter another club's swimmer", async () => {
    await expect(
      c.asCoachA.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: c.lines["Mixed 100 Free"],
        swimmerIds: [c.ids.rival],
      }),
    ).rejects.toThrow(/your own club|manage/i);
  });

  test("a coach never sees another club's entries on the same fixture", async () => {
    // The meet is shared; the sign-up sheets are not.
    await c.asCoachB.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.rival],
    });
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });

    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    expect(line.entered).toBe(1);
    expect(line.entries.map((e) => e.name)).toEqual(["Jane Doe"]);
  });

  test("a coach still cannot edit the programme they are entering against", async () => {
    await expect(
      c.asCoachA.mutation(api.meets.updateMeet, {
        meetId: c.meetId,
        name: "Renamed",
        startDate: "2026-03-14",
        events: PROGRAMME,
      }),
    ).rejects.toThrow(/super-user/i);
  });
});

describe("the sex-scope rule", () => {
  test("refuses a boy on a girls' event, and names them both", async () => {
    await expect(
      c.asCoachA.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: c.lines["Girls 50 Fly"],
        swimmerIds: [c.ids.ben],
      }),
    ).rejects.toThrow(/Girls.*Ben Smith|Ben Smith/i);
  });

  test("a mixed event takes everyone", async () => {
    const { added } = await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane, c.ids.ben],
    });
    expect(added).toBe(2);
  });

  test("changing a line's sex scope flags the swimmer, it never deletes them", async () => {
    // Deleting a sign-up because someone re-worded a programme line would lose
    // work the coach did; a flag lets them move the swimmer deliberately.
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.ben],
    });

    const meet = await c.asSuper.query(api.meets.getMeet, { meetId: c.meetId });
    await c.asSuper.mutation(api.meets.updateMeet, {
      meetId: c.meetId,
      name: "Winter Gala",
      startDate: "2026-03-14",
      course: "LCM",
      events: meet!.events.map((e) =>
        e.rawLabel === "Mixed 100 Free" ? { ...e, gender: "F" as const } : e,
      ),
    });

    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    expect(line.entries).toHaveLength(1);
    expect(line.entries[0].genderMismatch).toBe(true);
  });
});

describe("adding and removing", () => {
  test("adding the same swimmer twice is skipped, not an error", async () => {
    const args = {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    };
    expect(await c.asCoachA.mutation(api.meetEntries.addEntries, args)).toEqual({
      added: 1,
      skipped: 0,
    });
    expect(await c.asCoachA.mutation(api.meetEntries.addEntries, args)).toEqual({
      added: 0,
      skipped: 1,
    });
  });

  test("refuses a swimmer who is off the active roster", async () => {
    await c.t.run(async (ctx) => ctx.db.patch(c.ids.ben, { active: false }));
    await expect(
      c.asCoachA.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: c.lines["Mixed 100 Free"],
        swimmerIds: [c.ids.ben],
      }),
    ).rejects.toThrow(/active roster/i);
  });

  test("refuses a line that is not on the programme", async () => {
    await expect(
      c.asCoachA.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: "not-a-line",
        swimmerIds: [c.ids.jane],
      }),
    ).rejects.toThrow(/no longer on this meet/i);
  });

  test("a swimmer with a recorded time cannot just be taken off", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    const entryId = line.entries[0]._id;

    const { resultId } = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });
    await expect(
      c.asCoachA.mutation(api.meetEntries.removeEntry, { entryId }),
    ).rejects.toThrow(/delete the time first/i);

    // Deleting the swim goes through the audited path, and frees the entry.
    await c.asCoachA.mutation(api.results.deleteResult, {
      resultId,
      reason: "mis-typed",
    });
    const tombstones = await c.t.run(async (ctx) =>
      ctx.db.query("resultDeletions").collect(),
    );
    expect(tombstones).toHaveLength(1);

    const freed = await sheetLine(c, c.lines["Mixed 100 Free"]);
    expect(freed.entries[0].resultId).toBeNull();
    await c.asCoachA.mutation(api.meetEntries.removeEntry, { entryId });
    expect((await sheetLine(c, c.lines["Mixed 100 Free"])).entered).toBe(0);
  });
});

describe("recording a time", () => {
  async function enter(lineKey = "Mixed 100 Free") {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines[lineKey],
      swimmerIds: [c.ids.jane],
    });
    return (await sheetLine(c, c.lines[lineKey])).entries[0]._id;
  }

  test("refuses until the meet has a course", async () => {
    // A PB is per course and never borrowed (§4.2), so a time with no course
    // could not be compared with anything — including itself, later.
    const meetId = await c.asSuper.mutation(api.meets.createMeet, {
      name: "Courseless",
      startDate: "2026-03-14",
      events: PROGRAMME,
    });
    const meet = await c.asSuper.query(api.meets.getMeet, { meetId });
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId,
      lineId: meet!.events[0].id!,
      swimmerIds: [c.ids.jane],
    });
    const sheet = await c.asCoachA.query(api.meetEntries.getMeetSignups, { meetId });
    expect(sheet.courseKnown).toBe(false);

    await expect(
      c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
        entryId: sheet.lines[0].entries[0]._id,
        timeInput: "1:09:00",
      }),
    ).rejects.toThrow(/course/i);
  });

  test("refuses a relay — a relay time belongs to the team", async () => {
    const entryId = await enter("Mixed 4 x 50 Free Relay");
    await expect(
      c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
        entryId,
        timeInput: "1:09:00",
      }),
    ).rejects.toThrow(/isn't an event this app tracks/i);
  });

  test("writes a real MEET result carrying the meet's name and venue", async () => {
    const entryId = await enter();
    const { resultId } = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });

    const result = await c.t.run(async (ctx) => ctx.db.get(resultId));
    expect(result).toMatchObject({
      swimType: "MEET",
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      timeMs: 69_000,
      swimDate: "2026-03-14",
      meetId: c.meetId,
      meetName: "Winter Gala",
      venue: "Les Brown Pool",
    });
    // Age is computed from the day of the swim, not from today.
    expect(result?.ageAtSwim).toBe(15);
  });

  test("correcting a time replaces it rather than logging a second swim", async () => {
    const entryId = await enter();
    const first = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });
    const second = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:08:50",
    });
    expect(second.resultId).toBe(first.resultId);

    const swims = await c.t.run(async (ctx) => ctx.db.query("results").collect());
    expect(swims).toHaveLength(1);
    expect(swims[0].timeMs).toBe(68_500);
    // Compared against the swimmer's history EXCLUDING the row it replaces —
    // otherwise a corrected time would be measured against itself.
    expect(second.newPb).toBe(true);
  });
});

describe("the PB going into the meet", () => {
  async function enterAndTime(timeInput: string) {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    const entryId = (await sheetLine(c, c.lines["Mixed 100 Free"])).entries[0]._id;
    const outcome = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput,
    });
    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    return { outcome, row: line.entries[0] };
  }

  test("is the mark they walked in with, not one set since", async () => {
    await history(c, { timeMs: 70_000, swimDate: "2026-01-10" });
    // Faster, but swum after the meet — the swimmer did not have it on the day.
    await history(c, { timeMs: 65_000, swimDate: "2026-06-01" });

    const { outcome, row } = await enterAndTime("1:09:00");
    expect(row.pbBeforeMs).toBe(70_000);
    expect(row.deltaMs).toBe(1_000);
    expect(row.newPb).toBe(true);
    // They improved ON THE DAY, but it is not their best ever — the two facts
    // are different and both are reported.
    expect(outcome.newPbForMeet).toBe(true);
    expect(outcome.newPb).toBe(false);
  });

  test("never borrows the other course", async () => {
    await history(c, { timeMs: 70_000, swimDate: "2026-01-10" });
    await history(c, { timeMs: 68_000, swimDate: "2026-01-11", course: "SCM" });

    const { row } = await enterAndTime("1:09:00");
    expect(row.pbBeforeMs).toBe(70_000);
  });

  test("ignores a trial swum the week before", async () => {
    await history(c, {
      timeMs: 65_000,
      swimDate: "2026-03-07",
      swimType: "TIME_TRIAL",
    });
    const { row } = await enterAndTime("1:09:00");
    expect(row.pbBeforeMs).toBeNull();
    expect(row.firstTime).toBe(true);
  });

  test("a first-ever swim is a first time, not a failure to improve", async () => {
    const { row } = await enterAndTime("1:09:00");
    expect(row).toMatchObject({
      pbBeforeMs: null,
      deltaMs: null,
      newPb: false,
      firstTime: true,
    });
  });

  test("measures day three against the same mark as day one", async () => {
    // Both swims are at THIS meet, so neither may become the other's baseline.
    const meetId = await c.asSuper.mutation(api.meets.createMeet, {
      name: "Three Day",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      course: "LCM",
      events: PROGRAMME,
    });
    const meet = await c.asSuper.query(api.meets.getMeet, { meetId });
    const lineId = meet!.events[0].id!;
    await history(c, { timeMs: 70_000, swimDate: "2026-01-10" });

    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId,
      lineId,
      swimmerIds: [c.ids.jane],
    });
    let sheet = await c.asCoachA.query(api.meetEntries.getMeetSignups, { meetId });
    expect(sheet.days).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);

    await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId: sheet.lines[0].entries[0]._id,
      timeInput: "1:09:00",
    });

    // A second swim of the same event, on day three.
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId,
      lineId: meet!.events[1].id!,
      swimmerIds: [c.ids.jane],
      swimDate: "2026-05-03",
    });
    sheet = await c.asCoachA.query(api.meetEntries.getMeetSignups, { meetId });
    const dayThree = sheet.lines.find((l) => l.lineId === meet!.events[1].id!)!;
    expect(dayThree.entries[0].swimDate).toBe("2026-05-03");
    // Day one's swim did not move the baseline for the rest of the meet.
    expect(sheet.lines[0].entries[0].pbBeforeMs).toBe(70_000);
  });

  test("refuses a day the meet does not run on", async () => {
    await expect(
      c.asCoachA.mutation(api.meetEntries.addEntries, {
        meetId: c.meetId,
        lineId: c.lines["Mixed 100 Free"],
        swimmerIds: [c.ids.jane],
        swimDate: "2026-03-20",
      }),
    ).rejects.toThrow(/runs on 2026-03-14 only/i);
  });
});

describe("a time logged the usual way", () => {
  test("fills the sign-up it belongs to", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });

    await c.asCoachA.mutation(api.results.logResult, {
      swimmerId: c.ids.jane,
      distance: 100,
      stroke: "FREE",
      course: "LCM",
      swimType: "MEET",
      swimDate: "2026-03-14",
      timeInput: "1:09:00",
      meetId: c.meetId,
    });

    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    expect(line.timed).toBe(1);
    expect(line.entries[0].timeMs).toBe(69_000);
  });

  test("does not fill an entry with a swim from the other pool", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    await c.asCoachA.mutation(api.results.logResult, {
      swimmerId: c.ids.jane,
      distance: 100,
      stroke: "FREE",
      course: "SCM",
      swimType: "MEET",
      swimDate: "2026-03-14",
      timeInput: "1:09:00",
      meetId: c.meetId,
    });

    const line = await sheetLine(c, c.lines["Mixed 100 Free"]);
    expect(line.timed).toBe(0);
  });

  test("refuses a meet that was not running that day", async () => {
    await expect(
      c.asCoachA.mutation(api.results.logResult, {
        swimmerId: c.ids.jane,
        distance: 100,
        stroke: "FREE",
        course: "LCM",
        swimType: "MEET",
        swimDate: "2026-03-20",
        timeInput: "1:09:00",
        meetId: c.meetId,
      }),
    ).rejects.toThrow(/can't belong to it/i);
  });

  test("cannot have its event edited out from under the programme", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    const entryId = (await sheetLine(c, c.lines["Mixed 100 Free"])).entries[0]._id;
    const { resultId } = await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });

    await expect(
      c.asCoachA.mutation(api.results.updateResult, { resultId, distance: 50 }),
    ).rejects.toThrow(/attached to a meet's programme/i);
    // Everything else about it is still editable.
    await c.asCoachA.mutation(api.results.updateResult, {
      resultId,
      notes: "wind-assisted",
    });
  });
});

describe("what a swimmer's family sees", () => {
  test("their own events only, upcoming ones marked as scheduled", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane, c.ids.ben],
    });

    const seen = await c.asParent.query(api.meetEntries.getMyMeetEntries, {
      meetId: c.meetId,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].name).toBe("Jane Doe");
    expect(seen[0].entries).toHaveLength(1);
    expect(seen[0].entries[0]).toMatchObject({
      label: "100 Free",
      eventNumber: 1,
      timeMs: null,
    });
  });

  test("their time and the mark they came in with, once it has been swum", async () => {
    await history(c, { timeMs: 70_000, swimDate: "2026-01-10" });
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    const entryId = (await sheetLine(c, c.lines["Mixed 100 Free"])).entries[0]._id;
    await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });

    const seen = await c.asParent.query(api.meetEntries.getMyMeetEntries, {
      meetId: c.meetId,
    });
    expect(seen[0].entries[0]).toMatchObject({
      timeMs: 69_000,
      pbBeforeMs: 70_000,
      deltaMs: 1_000,
      newPb: true,
    });
  });

  test("nothing at all about a swimmer they are not linked to", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Boys 50 Fly"],
      swimmerIds: [c.ids.ben],
    });
    const seen = await c.asParent.query(api.meetEntries.getMyMeetEntries, {
      meetId: c.meetId,
    });
    expect(seen).toEqual([]);
  });

  test("a badge counting only the meets their swimmer is in", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    expect(await c.asParent.query(api.meetEntries.getMyEntryCounts, {})).toEqual([
      { meetId: c.meetId, entered: 1 },
    ]);
    // Staff read the sign-up sheet instead; this question is not theirs.
    expect(await c.asCoachA.query(api.meetEntries.getMyEntryCounts, {})).toEqual([]);
  });
});

describe("the meets list's outstanding count", () => {
  test("counts this club's sign-ups and how many have times", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane, c.ids.ben],
    });
    await c.asCoachB.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.rival],
    });
    const entryId = (await sheetLine(c, c.lines["Mixed 100 Free"])).entries[0]._id;
    await c.asCoachA.mutation(api.meetEntries.recordEntryTime, {
      entryId,
      timeInput: "1:09:00",
    });

    const counts = await c.asCoachA.query(api.meetEntries.getEntryCounts, {
      from: "2026-01-01",
      to: "2026-12-31",
    });
    // Club B's swimmer is on the same fixture and not in this club's number.
    expect(counts).toEqual([{ meetId: c.meetId, entered: 2, timed: 1 }]);
  });

  test("follows a meet that moves to new dates", async () => {
    await c.asCoachA.mutation(api.meetEntries.addEntries, {
      meetId: c.meetId,
      lineId: c.lines["Mixed 100 Free"],
      swimmerIds: [c.ids.jane],
    });
    const meet = await c.asSuper.query(api.meets.getMeet, { meetId: c.meetId });
    await c.asSuper.mutation(api.meets.updateMeet, {
      meetId: c.meetId,
      name: "Winter Gala",
      startDate: "2026-08-01",
      course: "LCM",
      events: meet!.events,
    });

    expect(
      await c.asCoachA.query(api.meetEntries.getEntryCounts, {
        from: "2026-07-01",
        to: "2026-09-01",
      }),
    ).toEqual([{ meetId: c.meetId, entered: 1, timed: 0 }]);
  });
});
