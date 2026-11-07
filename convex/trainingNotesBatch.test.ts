/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/*
  Bulk training notes: ONE note written to MANY swimmers as N independent
  SWIMMER notes sharing a batchId. The per-swimmer rule is the one a single
  note uses (own club; an assistant coach, their age group), checked for every
  id before anything is written — a batch is all-or-nothing. The picker
  (listNoteRecipients) offers only swimmers the caller may write for, grouped
  by squad. Exercised through the public functions, where the gates live.
*/

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

const YEAR = new Date().getUTCFullYear();
const dobAged = (age: number) => `${YEAR - age}-01-01`;

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const clubA = await ctx.db.insert("clubs", { name: "Club A", createdAt: 0 });
    const clubB = await ctx.db.insert("clubs", { name: "Club B", createdAt: 0 });

    const swimmer = (name: string, age: number, clubId: typeof clubA, active = true) =>
      ctx.db.insert("swimmers", {
        name,
        dob: dobAged(age),
        gender: "F",
        active,
        clubId,
        createdAt: 0,
      });
    const junior = await swimmer("Jess Junior", 11, clubA);
    const twelve = await swimmer("Tia Twelve", 12, clubA);
    const thirteen = await swimmer("Thea Thirteen", 13, clubA);
    const senior = await swimmer("Sam Senior", 15, clubA);
    const retired = await swimmer("Rae Retired", 11, clubA, false);
    const otherClubJunior = await swimmer("Olly Other", 10, clubB);

    const mixed = await ctx.db.insert("squads", { name: "Mixed", clubId: clubA });
    const seniors = await ctx.db.insert("squads", { name: "Seniors", clubId: clubA });
    const otherSquad = await ctx.db.insert("squads", { name: "Other", clubId: clubB });
    await ctx.db.insert("squadMemberships", { swimmerId: junior, squadId: mixed });
    await ctx.db.insert("squadMemberships", { swimmerId: senior, squadId: mixed });
    await ctx.db.insert("squadMemberships", { swimmerId: senior, squadId: seniors });
    await ctx.db.insert("squadMemberships", { swimmerId: thirteen, squadId: seniors });
    await ctx.db.insert("squadMemberships", { swimmerId: otherClubJunior, squadId: otherSquad });

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

    const admin = await account("The Admin", "SUPER_USER");
    const superCoach = await account("Super Coach", "COACH", { clubId: clubA });
    const juniorCoach = await account("Junior Coach", "COACH", {
      clubId: clubA,
      coachLevel: "JUNIOR",
    });
    const seniorCoach = await account("Senior Coach", "COACH", {
      clubId: clubA,
      coachLevel: "SENIOR",
    });
    const parent = await account("Jess Parent", "VIEWER");
    await ctx.db.insert("swimmerAccess", { profileId: parent.profileId, swimmerId: junior });

    return {
      clubA,
      clubB,
      junior,
      twelve,
      thirteen,
      senior,
      retired,
      otherClubJunior,
      mixed,
      seniors,
      admin,
      superCoach,
      juniorCoach,
      seniorCoach,
      parent,
    };
  });

  const as = (who: { userId: string }) =>
    t.withIdentity({ subject: `${who.userId}|test-session` });
  return { t, ids, as };
}

const BODY = "Underwater kick off every wall this fortnight.";

describe("createTrainingNotesBatch", () => {
  test("writes one independent SWIMMER note per swimmer, sharing a batchId", async () => {
    const { t, ids, as } = await setup();
    const jc = as(ids.juniorCoach);
    const result = await jc.mutation(api.trainingNotes.createTrainingNotesBatch, {
      swimmerIds: [ids.junior, ids.twelve, ids.junior], // a duplicate is one note
      focus: "Walls",
      body: BODY,
      noteDate: "2026-11-01",
    });
    expect(result.created).toBe(2);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("trainingNotes")
        .withIndex("by_batch", (q) => q.eq("batchId", result.batchId))
        .collect(),
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.swimmerId))).toEqual(new Set([ids.junior, ids.twelve]));
    for (const row of rows) {
      expect(row.scope).toBe("SWIMMER");
      expect(row.squadId).toBeUndefined();
      expect(row.focus).toBe("Walls");
      expect(row.body).toBe(BODY);
      expect(row.noteDate).toBe("2026-11-01");
      expect(row.authorId).toBe(ids.juniorCoach.profileId);
    }

    // Each copy is its own note: editing Jess's leaves Tia's alone.
    const jess = rows.find((r) => r.swimmerId === ids.junior)!;
    await jc.mutation(api.trainingNotes.updateTrainingNote, {
      noteId: jess._id,
      body: "Changed for Jess only.",
    });
    const tia = await t.run((ctx) =>
      ctx.db.get(rows.find((r) => r.swimmerId === ids.twelve)!._id),
    );
    expect(tia?.body).toBe(BODY);
  });

  test("is all-or-nothing: one out-of-band swimmer fails the batch by name", async () => {
    const { t, ids, as } = await setup();
    const jc = as(ids.juniorCoach);
    await expect(
      jc.mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.junior, ids.thirteen],
        body: BODY,
      }),
    ).rejects.toThrow(/Thea Thirteen.*age group/);
    const written = await t.run((ctx) => ctx.db.query("trainingNotes").collect());
    expect(written).toHaveLength(0);
  });

  test("a senior coach is refused a junior; a super coach spans both bands", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.seniorCoach).mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.senior, ids.twelve],
        body: BODY,
      }),
    ).rejects.toThrow(/Tia Twelve.*age group/);
    const result = await as(ids.superCoach).mutation(
      api.trainingNotes.createTrainingNotesBatch,
      { swimmerIds: [ids.junior, ids.senior], body: BODY },
    );
    expect(result.created).toBe(2);
  });

  test("a super coach is refused another club's swimmer; the Admin is not", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.superCoach).mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.junior, ids.otherClubJunior],
        body: BODY,
      }),
    ).rejects.toThrow(/Olly Other is not in your club/);
    const result = await as(ids.admin).mutation(
      api.trainingNotes.createTrainingNotesBatch,
      { swimmerIds: [ids.junior, ids.otherClubJunior], body: BODY },
    );
    expect(result.created).toBe(2);
  });

  test("validates the note once: empty body, empty selection, bad date", async () => {
    const { ids, as } = await setup();
    const sc = as(ids.superCoach);
    await expect(
      sc.mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.junior],
        body: "   ",
      }),
    ).rejects.toThrow(/A note is required/);
    await expect(
      sc.mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [],
        body: BODY,
      }),
    ).rejects.toThrow(/at least one swimmer/);
    await expect(
      sc.mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.junior],
        body: BODY,
        noteDate: "2026-02-30",
      }),
    ).rejects.toThrow(/not a real date/);
  });

  test("a viewer cannot write a batch", async () => {
    const { ids, as } = await setup();
    await expect(
      as(ids.parent).mutation(api.trainingNotes.createTrainingNotesBatch, {
        swimmerIds: [ids.junior],
        body: BODY,
      }),
    ).rejects.toThrow();
  });
});

describe("batchCount on the timeline", () => {
  test("staff see how many swimmers a note went to; a viewer sees null", async () => {
    const { ids, as } = await setup();
    const sc = as(ids.superCoach);
    await sc.mutation(api.trainingNotes.createTrainingNotesBatch, {
      swimmerIds: [ids.junior, ids.twelve, ids.senior],
      body: BODY,
    });
    // A single note has no batch at all.
    await sc.mutation(api.trainingNotes.createTrainingNote, {
      scope: "SWIMMER",
      swimmerId: ids.junior,
      body: "Just Jess.",
    });

    const staffView = await as(ids.juniorCoach).query(
      api.trainingNotes.getSwimmerTrainingNotes,
      { swimmerId: ids.junior },
    );
    const counts = new Map(staffView.notes.map((n) => [n.body, n.batchCount]));
    expect(counts.get(BODY)).toBe(3);
    expect(counts.get("Just Jess.")).toBeNull();

    const parentView = await as(ids.parent).query(
      api.trainingNotes.getSwimmerTrainingNotes,
      { swimmerId: ids.junior },
    );
    expect(parentView.notes).toHaveLength(2);
    for (const n of parentView.notes) expect(n.batchCount).toBeNull();
  });
});

describe("listNoteRecipients", () => {
  test("a junior coach gets only juniors, grouped by squad, with the band stated", async () => {
    const { ids, as } = await setup();
    const r = await as(ids.juniorCoach).query(api.trainingNotes.listNoteRecipients, {});
    expect(r.ageBand).toEqual({ level: "JUNIOR", juniorMaxAge: 12 });
    // Mixed holds Jess (11) and Sam (15): only Jess is offered. Seniors has no
    // junior in it, so it is not listed at all.
    expect(r.squads.map((s) => s.name)).toEqual(["Mixed"]);
    expect(r.squads[0].swimmers.map((s) => s.name)).toEqual(["Jess Junior"]);
    expect(r.squads[0].swimmers[0].age).toBe(11);
    // Tia is in no squad; Rae is inactive and never offered.
    expect(r.unsquadded.map((s) => s.name)).toEqual(["Tia Twelve"]);
  });

  test("a senior coach gets 13+ only; a swimmer in two squads is listed under both", async () => {
    const { ids, as } = await setup();
    const r = await as(ids.seniorCoach).query(api.trainingNotes.listNoteRecipients, {});
    expect(r.ageBand).toEqual({ level: "SENIOR", juniorMaxAge: 12 });
    expect(r.squads.map((s) => [s.name, s.swimmers.map((w) => w.name)])).toEqual([
      ["Mixed", ["Sam Senior"]],
      ["Seniors", ["Sam Senior", "Thea Thirteen"]],
    ]);
    expect(r.unsquadded).toEqual([]);
  });

  test("a super coach gets the whole club and nothing from another club", async () => {
    const { ids, as } = await setup();
    const r = await as(ids.superCoach).query(api.trainingNotes.listNoteRecipients, {});
    expect(r.ageBand).toBeNull();
    expect(r.squads.map((s) => s.name)).toEqual(["Mixed", "Seniors"]);
    const offered = new Set([
      ...r.squads.flatMap((s) => s.swimmers.map((w) => w.name)),
      ...r.unsquadded.map((w) => w.name),
    ]);
    expect(offered).toEqual(
      new Set(["Jess Junior", "Tia Twelve", "Thea Thirteen", "Sam Senior"]),
    );
    expect(r.unsquadded.map((s) => s.name)).toEqual(["Tia Twelve"]);
  });

  test("the Admin sees every club's squads; a viewer is refused", async () => {
    const { ids, as } = await setup();
    const r = await as(ids.admin).query(api.trainingNotes.listNoteRecipients, {});
    expect(r.squads.map((s) => s.name)).toEqual(["Mixed", "Other", "Seniors"]);
    await expect(
      as(ids.parent).query(api.trainingNotes.listNoteRecipients, {}),
    ).rejects.toThrow();
  });
});
