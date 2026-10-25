/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { ageGroupFor, levelCoversSwimmer } from "../lib/coachLevel";

/*
  Coach levels (docs/access-control.md). A Super Coach is today's coach; a
  Senior / Junior coach reads the club but writes ONLY swimmer training notes
  for their age group, and only edits notes they wrote. Exercised through the
  real public functions so the gates are verified where they are enforced.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// Ages relative to the real "today" the server uses, so the suite never ages out.
const YEAR = new Date().getUTCFullYear();
// Born 1 Jan of (YEAR - age): on any day of YEAR they have turned `age`.
const dobAged = (age: number) => `${YEAR - age}-01-01`;

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });

    const swimmer = (name: string, age: number, clubId: typeof clubA) =>
      ctx.db.insert("swimmers", {
        name,
        dob: dobAged(age),
        gender: "F",
        active: true,
        clubId,
        createdAt: 0,
      });
    const junior = await swimmer("Jess Junior", 11, clubA);
    const twelve = await swimmer("Tia Twelve", 12, clubA);
    const thirteen = await swimmer("Thea Thirteen", 13, clubA);
    const senior = await swimmer("Sam Senior", 15, clubA);
    const otherClubJunior = await swimmer("Olly Other", 10, clubB);

    const squad = await ctx.db.insert("squads", { name: "Mixed", clubId: clubA });

    async function account(
      name: string,
      role: "SUPER_USER" | "COACH" | "VIEWER",
      extra: { clubId?: typeof clubA; coachLevel?: "SUPER" | "SENIOR" | "JUNIOR" } = {},
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

    const superCoach = await account("Super Coach", "COACH", { clubId: clubA });
    const juniorCoach = await account("Junior Coach", "COACH", {
      clubId: clubA,
      coachLevel: "JUNIOR",
    });
    const seniorCoach = await account("Senior Coach", "COACH", {
      clubId: clubA,
      coachLevel: "SENIOR",
    });

    return {
      clubA,
      clubB,
      junior,
      twelve,
      thirteen,
      senior,
      otherClubJunior,
      squad,
      superCoach,
      juniorCoach,
      seniorCoach,
    };
  });

  const as = (who: { userId: string }) =>
    t.withIdentity({ subject: `${who.userId}|test-session` });
  return { t, ids, as };
}

const note = (swimmerId: unknown) => ({
  scope: "SWIMMER" as const,
  swimmerId: swimmerId as never,
  body: "Work on underwater kicks.",
});

describe("ageGroupFor / levelCoversSwimmer (pure)", () => {
  test("12 and under is junior, 13 and over senior, by default", () => {
    expect(ageGroupFor("2014-06-01", "2026-06-01")).toBe("JUNIOR"); // 12
    expect(ageGroupFor("2013-06-01", "2026-06-01")).toBe("SENIOR"); // 13
    expect(ageGroupFor("2013-06-02", "2026-06-01")).toBe("JUNIOR"); // 12, day before
  });

  test("honours a club's own split", () => {
    expect(ageGroupFor("2012-06-01", "2026-06-01", 14)).toBe("JUNIOR"); // 14
    expect(ageGroupFor("2011-06-01", "2026-06-01", 14)).toBe("SENIOR"); // 15
  });

  test("SUPER covers everyone; a non-coach covers no one", () => {
    expect(levelCoversSwimmer("SUPER", "2000-01-01", "2026-01-01", 12)).toBe(true);
    expect(levelCoversSwimmer(null, "2015-01-01", "2026-01-01", 12)).toBe(false);
    expect(levelCoversSwimmer("SENIOR", "2015-01-01", "2026-01-01", 12)).toBe(false);
    expect(levelCoversSwimmer("JUNIOR", "2015-01-01", "2026-01-01", 12)).toBe(true);
  });
});

describe("assistant coaches write swimmer notes for their own age group only", () => {
  test("a junior coach writes on 11 and 12, is refused on 13", async () => {
    const { ids, as } = await setup();
    const jc = as(ids.juniorCoach);
    await jc.mutation(api.trainingNotes.createTrainingNote, note(ids.junior));
    await jc.mutation(api.trainingNotes.createTrainingNote, note(ids.twelve));
    await expect(
      jc.mutation(api.trainingNotes.createTrainingNote, note(ids.thirteen)),
    ).rejects.toThrow(/different age group/);
  });

  test("a senior coach writes on 13+, is refused on 12", async () => {
    const { ids, as } = await setup();
    const sc = as(ids.seniorCoach);
    await sc.mutation(api.trainingNotes.createTrainingNote, note(ids.thirteen));
    await sc.mutation(api.trainingNotes.createTrainingNote, note(ids.senior));
    await expect(
      sc.mutation(api.trainingNotes.createTrainingNote, note(ids.twelve)),
    ).rejects.toThrow(/different age group/);
  });

  test("the club's split moves the boundary", async () => {
    const { t, ids, as } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.clubA, { juniorMaxAge: 14 }));
    await as(ids.juniorCoach).mutation(
      api.trainingNotes.createTrainingNote,
      note(ids.thirteen),
    );
    await expect(
      as(ids.seniorCoach).mutation(api.trainingNotes.createTrainingNote, note(ids.thirteen)),
    ).rejects.toThrow(/different age group/);
  });

  test("never on another club's swimmer", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.juniorCoach).mutation(
        api.trainingNotes.createTrainingNote,
        note(ids.otherClubJunior),
      ),
    ).rejects.toThrow();
  });

  test("never a squad note", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.juniorCoach).mutation(api.trainingNotes.createTrainingNote, {
        scope: "SQUAD",
        squadId: ids.squad,
        body: "Sets this week.",
      }),
    ).rejects.toThrow(/super coaches/);
  });

  test("edits and deletes only the notes they wrote", async () => {
    const { ids, as } = await setup();
    const superNote = await as(ids.superCoach).mutation(
      api.trainingNotes.createTrainingNote,
      note(ids.junior),
    );
    const ownNote = await as(ids.juniorCoach).mutation(
      api.trainingNotes.createTrainingNote,
      note(ids.junior),
    );
    const jc = as(ids.juniorCoach);
    await expect(
      jc.mutation(api.trainingNotes.updateTrainingNote, { noteId: superNote, body: "x" }),
    ).rejects.toThrow(/notes you wrote/);
    await expect(
      jc.mutation(api.trainingNotes.deleteTrainingNote, { noteId: superNote }),
    ).rejects.toThrow(/notes you wrote/);
    await jc.mutation(api.trainingNotes.updateTrainingNote, { noteId: ownNote, body: "y" });

    const timeline = await jc.query(api.trainingNotes.getSwimmerTrainingNotes, {
      swimmerId: ids.junior,
    });
    expect(timeline.editable).toBe(true);
    expect(timeline.canWriteSquadNotes).toBe(false);
    const byId = new Map(timeline.notes.map((n) => [n._id, n.canModify]));
    expect(byId.get(ownNote)).toBe(true);
    expect(byId.get(superNote)).toBe(false);

    // A Super Coach still moderates every note.
    await as(ids.superCoach).mutation(api.trainingNotes.deleteTrainingNote, {
      noteId: ownNote,
    });
  });
});

describe("assistant coaches are refused every other write", () => {
  test("times, swimmers, squads", async () => {
    const { ids, as } = await setup();
    const jc = as(ids.juniorCoach);
    await expect(
      jc.mutation(api.results.logResult, {
        swimmerId: ids.junior,
        distance: 50,
        stroke: "FREE",
        course: "LCM",
        swimType: "MEET",
        swimDate: `${YEAR}-01-02`,
        timeInput: "3000",
      }),
    ).rejects.toThrow();
    await expect(
      jc.mutation(api.swimmers.updateSwimmer, { swimmerId: ids.junior, name: "X" }),
    ).rejects.toThrow(/only write training notes/);
    await expect(
      jc.mutation(api.squads.createSquad, { name: "New" }),
    ).rejects.toThrow(/only write training notes/);
  });

  test("viewer-access management and the audit log are Super Coach only", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.seniorCoach).query(api.swimmerAccess.listSwimmerViewers, {
        swimmerId: ids.senior,
      }),
    ).rejects.toThrow(/only write training notes/);
  });

  test("reads the roster, without the sensitive coach notes", async () => {
    const { t, ids, as } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.junior, { notes: "Asthma inhaler" }));
    const rows = await as(ids.juniorCoach).query(api.swimmers.listSwimmers, {});
    const jess = rows.find((r) => r._id === ids.junior)!;
    expect(jess.notes).toBeUndefined();
    expect(jess.editable).toBe(false);

    const asSuper = await as(ids.superCoach).query(api.swimmers.listSwimmers, {});
    expect(asSuper.find((r) => r._id === ids.junior)!.notes).toBe("Asthma inhaler");
  });
});
