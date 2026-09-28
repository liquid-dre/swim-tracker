import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import { loadMeetOrThrow, requireClub } from "./meetEntriesShared";
import {
  MAX_REPORT_BYTES,
  MAX_REPORTS_PER_MEET,
  cleanReportFileName,
  isAllowedReportType,
} from "../lib/meetReports";

/*
  Meet summaries — a coach's written report on how their club did at a meet.

  The file is kept as the coach wrote it (Convex storage) and never parsed: it
  is prose for other coaches to read, and nothing downstream computes from it.

  Staff-only and club-scoped, exactly like `meetEntries`: the meet is global
  reference data, but a report on it belongs to the club that wrote it. Every
  function here goes through `requireCoach`, so a viewer is refused server-side
  rather than merely not shown a button — a report names other people's
  children and says which of them swam slower than seed.
*/

/** Step 1 of an upload: a short-lived URL the browser POSTs the file to. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const profile = await requireCoach(ctx);
    requireClub(profile);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2: attach an uploaded file to a meet for the caller's club.
 *
 * Type and size are read from the `_storage` row, never taken from the client,
 * and a file that fails a check is deleted here rather than left orphaned in
 * storage. That is why a refusal is RETURNED rather than thrown: a throw rolls
 * the whole mutation back, the storage delete with it, and the rejected file
 * would stay behind forever. The caller surfaces `error` as the failure.
 */
export const addMeetReport = mutation({
  args: {
    meetId: v.id("meets"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  returns: v.union(
    v.object({ reportId: v.id("meetReports"), error: v.null() }),
    v.object({ reportId: v.null(), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const clubId = requireClub(profile);

    const reject = async (error: string) => {
      await ctx.storage.delete(args.storageId);
      return { reportId: null, error };
    };

    const meet = await ctx.db.get(args.meetId);
    if (meet === null) return await reject("That meet no longer exists.");

    const file = await ctx.db.system.get(args.storageId);
    if (file === null) throw new ConvexError("The upload didn't arrive. Try again.");

    const contentType = file.contentType ?? "";
    if (!isAllowedReportType(contentType)) {
      return await reject("Upload a PDF, Word document, text file or image.");
    }
    if (file.size > MAX_REPORT_BYTES) {
      return await reject(
        `That file is over ${Math.round(MAX_REPORT_BYTES / 1024 / 1024)} MB.`,
      );
    }

    const existing = await ctx.db
      .query("meetReports")
      .withIndex("by_club_meet", (q) =>
        q.eq("clubId", clubId).eq("meetId", args.meetId),
      )
      .take(MAX_REPORTS_PER_MEET);
    if (existing.length >= MAX_REPORTS_PER_MEET) {
      return await reject(
        `This meet already has ${MAX_REPORTS_PER_MEET} summaries. Remove one first.`,
      );
    }

    const reportId = await ctx.db.insert("meetReports", {
      meetId: args.meetId,
      clubId,
      storageId: args.storageId,
      fileName: cleanReportFileName(args.fileName),
      contentType,
      size: file.size,
      uploadedBy: profile._id,
      uploadedAt: Date.now(),
    });
    return { reportId, error: null };
  },
});

/**
 * The caller's club's summaries on one meet, newest first, each with a signed
 * URL to open it. A staff account with no club has none — it is told so by
 * `generateUploadUrl` when it tries to add one, not by an error on read.
 */
export const listMeetReports = query({
  args: { meetId: v.id("meets") },
  returns: v.array(
    v.object({
      _id: v.id("meetReports"),
      fileName: v.string(),
      contentType: v.string(),
      size: v.number(),
      uploadedAt: v.number(),
      uploadedByName: v.union(v.string(), v.null()),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { meetId }) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) return [];
    await loadMeetOrThrow(ctx, meetId);

    const rows = await ctx.db
      .query("meetReports")
      .withIndex("by_club_meet", (q) =>
        q.eq("clubId", profile.clubId!).eq("meetId", meetId),
      )
      .take(MAX_REPORTS_PER_MEET);

    const names = new Map<Id<"profiles">, string | null>();
    const out = [];
    for (const r of rows) {
      if (!names.has(r.uploadedBy)) {
        names.set(r.uploadedBy, (await ctx.db.get(r.uploadedBy))?.name ?? null);
      }
      out.push({
        _id: r._id,
        fileName: r.fileName,
        contentType: r.contentType,
        size: r.size,
        uploadedAt: r.uploadedAt,
        uploadedByName: names.get(r.uploadedBy) ?? null,
        url: await ctx.storage.getUrl(r.storageId),
      });
    }
    return out.sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

/** Remove a summary and its file. Only a coach of the club that owns it. */
export const deleteMeetReport = mutation({
  args: { reportId: v.id("meetReports") },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const profile = await requireCoach(ctx);
    const report = await ctx.db.get(reportId);
    if (report === null) return null; // already gone: deleting twice is not an error
    if (report.clubId !== profile.clubId) {
      throw new ConvexError("That summary belongs to another club.");
    }
    await ctx.storage.delete(report.storageId);
    await ctx.db.delete(reportId);
    return null;
  },
});
