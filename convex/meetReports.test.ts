/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/*
  Meet summaries — the server boundary. A report is club-scoped and staff-only
  on a meet that is neither, so the things worth proving are: a viewer is
  refused outright, another club never sees it, a file is judged by what
  storage says it is, and deleting the meet cannot silently destroy it.
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
      clubId?: Id<"clubs">,
    ) {
      const userId = await ctx.db.insert("users", { name, email: `${name}@x.test` });
      await ctx.db.insert("profiles", {
        authId: userId,
        name,
        email: `${name}@x.test`,
        role,
        ...(clubId ? { clubId } : {}),
      });
      return userId;
    }
    return {
      superUser: await account("Admin", "SUPER_USER"),
      coachA: await account("CoachA", "COACH", clubA),
      coachB: await account("CoachB", "COACH", clubB),
      parent: await account("Parent", "VIEWER"),
    };
  });
  const as = (userId: string) => t.withIdentity({ subject: `${userId}|s` });
  const asSuper = as(ids.superUser);
  const meetId = await asSuper.mutation(api.meets.createMeet, {
    name: "HAS 1st Seeded Gala 2026",
    startDate: "2026-09-11",
    venue: "Les Brown Pool",
    course: "LCM",
    events: [],
  });

  // convex-test records no content type on a stored blob (real storage takes
  // it from the upload's header), so the fixture writes it onto the _storage row
  // the server reads — the one place a file's type is ever taken from.
  const store = (type: string, bytes = 16) =>
    t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.db as any).patch(id, { contentType: type });
      return id;
    });

  return {
    t,
    meetId,
    store,
    asSuper,
    asCoachA: as(ids.coachA),
    asCoachB: as(ids.coachB),
    asParent: as(ids.parent),
  };
}

describe("meet summaries", () => {
  test("a coach uploads a PDF and every coach in their club sees it", async () => {
    const { meetId, store, asCoachA } = await setup();
    const storageId = await store("application/pdf");
    await asCoachA.mutation(api.meetReports.addMeetReport, {
      meetId,
      storageId,
      fileName: "C:\\reports\\Sharks_Borrowdale_1st_Seeded_Gala_Report.pdf",
    });
    const list = await asCoachA.query(api.meetReports.listMeetReports, { meetId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      fileName: "Sharks_Borrowdale_1st_Seeded_Gala_Report.pdf",
      contentType: "application/pdf",
      size: 16,
      uploadedByName: "CoachA",
    });
    expect(list[0].url).toBeTypeOf("string");
  });

  test("another club never sees it, and cannot delete it", async () => {
    const { meetId, store, asCoachA, asCoachB } = await setup();
    const { reportId } = await asCoachA.mutation(api.meetReports.addMeetReport, {
      meetId,
      storageId: await store("application/pdf"),
      fileName: "report.pdf",
    });
    expect(await asCoachB.query(api.meetReports.listMeetReports, { meetId })).toEqual([]);
    await expect(
      asCoachB.mutation(api.meetReports.deleteMeetReport, { reportId: reportId! }),
    ).rejects.toThrow(/another club/);
  });

  test("a viewer is refused server-side, not merely not shown a button", async () => {
    const { meetId, store, asParent } = await setup();
    await expect(
      asParent.query(api.meetReports.listMeetReports, { meetId }),
    ).rejects.toThrow(/Only coaches/);
    await expect(
      asParent.mutation(api.meetReports.generateUploadUrl, {}),
    ).rejects.toThrow(/Only coaches/);
    await expect(
      asParent.mutation(api.meetReports.addMeetReport, {
        meetId,
        storageId: await store("application/pdf"),
        fileName: "x.pdf",
      }),
    ).rejects.toThrow(/Only coaches/);
  });

  test("the type is read from storage, and a refused file is deleted, not orphaned", async () => {
    const { t, meetId, store, asCoachA } = await setup();
    const storageId = await store("application/zip");
    const out = await asCoachA.mutation(api.meetReports.addMeetReport, {
      meetId,
      storageId,
      fileName: "report.pdf", // the name lies; storage decides
    });
    expect(out).toEqual({ reportId: null, error: expect.stringMatching(/PDF, Word/) });
    expect(await asCoachA.query(api.meetReports.listMeetReports, { meetId })).toEqual([]);
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("removing a summary deletes its file", async () => {
    const { t, meetId, store, asCoachA } = await setup();
    const storageId = await store("application/pdf");
    const { reportId } = await asCoachA.mutation(api.meetReports.addMeetReport, {
      meetId,
      storageId,
      fileName: "report.pdf",
    });
    await asCoachA.mutation(api.meetReports.deleteMeetReport, { reportId: reportId! });
    expect(await asCoachA.query(api.meetReports.listMeetReports, { meetId })).toEqual([]);
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("deleting the meet is refused while a club's summary is on it", async () => {
    const { meetId, store, asSuper, asCoachA } = await setup();
    const { reportId } = await asCoachA.mutation(api.meetReports.addMeetReport, {
      meetId,
      storageId: await store("application/pdf"),
      fileName: "report.pdf",
    });
    await expect(
      asSuper.mutation(api.meets.deleteMeet, { meetId }),
    ).rejects.toThrow(/meet summary/);
    await asCoachA.mutation(api.meetReports.deleteMeetReport, { reportId: reportId! });
    await asSuper.mutation(api.meets.deleteMeet, { meetId });
  });
});
