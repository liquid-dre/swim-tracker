import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import { eventLabel } from "../lib/swim";

/*
  Coach-visible AUDIT TRAILS (§R17). Three coach-only logs — who did what, when,
  and by which account:

    A. Access log       (listAccessLog)     — every viewer-access event over the
                                               R5 invite flow, from the
                                               append-only `accessEvents` table.
    B. Time-entry log   (listTimeEntryLog)  — every result's entry + last-edit
                                               provenance, derived from `results`.
    C. Deleted times    (listDeletedTimeLog)— every removed result, from the
                                               append-only `resultDeletions` table.

  C exists BECAUSE of how B works. B is derived from the live rows, so a deleted
  result drops out of it entirely: the swim, who logged it and who removed it all
  vanish together. A and C therefore share the same shape — snapshot the facts at
  event time, into a table nothing ever mutates — while B needs no table at all.

  All three gate on requireCoach, so a viewer can never reach any of them
  (server-enforced). `recordAccessEvent` and `recordResultDeletion` are the shared
  write seams the mutations call; no mutation builds a log row itself. Reads are
  bounded (club scale, BRD §11.1).
*/

type Role = "SUPER_USER" | "COACH" | "VIEWER";

type AccessEventType =
  | "INVITED"
  | "CLAIMED"
  | "REVOKED"
  | "UNLINKED"
  | "EXPIRED"
  | "REQUESTED"
  | "APPROVED"
  | "DENIED";

// What the logs call an account that has since been deleted. The entry still
// happened, so the row stays and names the gap rather than disappearing.
const REMOVED_ACCOUNT = "(removed account)";

// An unclaimed invite lapses after this long (§R17 EXPIRED). The daily cron
// (convex/crons.ts) sweeps pendings past it, logging one EXPIRED event each.
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// recordAccessEvent — the shared append-only writer (used by access mutations)
// ---------------------------------------------------------------------------

export async function recordAccessEvent(
  ctx: MutationCtx,
  e: {
    type: AccessEventType;
    swimmerId: Id<"swimmers">;
    viewerEmail: string;
    viewerProfileId?: Id<"profiles">;
    viewerName?: string;
    actor?: Doc<"profiles"> | null; // the account that performed the event
    approver?: { profileId: Id<"profiles">; name: string } | null; // inviting coach
  },
): Promise<void> {
  await ctx.db.insert("accessEvents", {
    type: e.type,
    swimmerId: e.swimmerId,
    at: Date.now(),
    viewerEmail: e.viewerEmail.trim().toLowerCase(),
    viewerProfileId: e.viewerProfileId,
    viewerName: e.viewerName,
    actorProfileId: e.actor?._id,
    actorName: e.actor?.name,
    actorRole: e.actor?.role,
    approverProfileId: e.approver?.profileId,
    approverName: e.approver?.name,
  });
}

// ---------------------------------------------------------------------------
// recordResultDeletion — the append-only writer for Part C (deleted times)
// ---------------------------------------------------------------------------

// A reason is free text a coach types under pressure; cap it so one paste can't
// bloat every page of the log. Long enough for a real sentence.
export const DELETE_REASON_MAX = 200;

/**
 * Tombstone a result on its way out.
 *
 * Call this BEFORE `ctx.db.delete` — it reads the row's own provenance, and once
 * the row is gone there is nothing left to read. The snapshot is deliberately
 * total: this row is the only surviving copy of the swim.
 */
export async function recordResultDeletion(
  ctx: MutationCtx,
  e: {
    result: Doc<"results">;
    swimmer: Doc<"swimmers">;
    actor: Doc<"profiles">;
    reason?: string;
  },
): Promise<void> {
  const { result, swimmer, actor } = e;

  // A profile can be removed while its entries live on, so the log names the
  // gap rather than dropping the row — the swim was still logged by someone.
  const enteredBy = await ctx.db.get(result.enteredBy);
  const lastEditedBy = result.lastEditedBy
    ? await ctx.db.get(result.lastEditedBy)
    : null;

  const reason = e.reason?.trim().slice(0, DELETE_REASON_MAX);

  await ctx.db.insert("resultDeletions", {
    at: Date.now(),
    actorProfileId: actor._id,
    actorName: actor.name,
    actorRole: actor.role,
    // Blank and absent are the same fact — "no reason given" — so an empty
    // string never reaches the table to be rendered as one.
    reason: reason ? reason : undefined,
    swimmerId: swimmer._id,
    swimmerName: swimmer.name,
    distance: result.distance,
    stroke: result.stroke,
    course: result.course,
    timeMs: result.timeMs,
    swimType: result.swimType,
    swimDate: result.swimDate,
    ageAtSwim: result.ageAtSwim,
    meetName: result.meetName,
    venue: result.venue,
    notes: result.notes,
    enteredByProfileId: result.enteredBy,
    enteredByName: enteredBy?.name ?? REMOVED_ACCOUNT,
    enteredByRole: enteredBy?.role ?? "VIEWER",
    originalCreatedAt: result.createdAt,
    lastEditedByName: lastEditedBy?.name,
    originalUpdatedAt: result.updatedAt,
  });
}

// ---------------------------------------------------------------------------
// expireStaleInvites — internal, cron-driven: lapse unclaimed invites (EXPIRED)
// ---------------------------------------------------------------------------

const EXPIRE_SCAN_LIMIT = 2000;

export const expireStaleInvites = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const pendings = await ctx.db
      .query("pendingSwimmerAccess")
      .take(EXPIRE_SCAN_LIMIT);

    let expired = 0;
    for (const p of pendings) {
      const issuedAt = p.invitedAt ?? p._creationTime;
      if (now - issuedAt < INVITE_TTL_MS) continue;
      await recordAccessEvent(ctx, {
        type: "EXPIRED",
        swimmerId: p.swimmerId,
        viewerEmail: p.email,
        approver:
          p.invitedByProfileId && p.invitedByName
            ? { profileId: p.invitedByProfileId, name: p.invitedByName }
            : null,
      });
      await ctx.db.delete(p._id);
      expired += 1;
    }
    return { expired };
  },
});

// ---------------------------------------------------------------------------
// Shared: memoised name/email resolvers
// ---------------------------------------------------------------------------

function profileResolver(ctx: QueryCtx) {
  const cache = new Map<Id<"profiles">, Doc<"profiles"> | null>();
  return async (id: Id<"profiles">) => {
    if (cache.has(id)) return cache.get(id)!;
    const p = await ctx.db.get(id);
    cache.set(id, p);
    return p;
  };
}

function swimmerNameResolver(ctx: QueryCtx) {
  const cache = new Map<Id<"swimmers">, string>();
  return async (id: Id<"swimmers">) => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const s = await ctx.db.get(id);
    const name = s?.name ?? "(removed swimmer)";
    cache.set(id, name);
    return name;
  };
}

// ---------------------------------------------------------------------------
// listAccessLog — Part A: chronological viewer-access events (coach-only)
// ---------------------------------------------------------------------------

const LINK_SCAN_LIMIT = 5000;

const TERMINAL: ReadonlySet<AccessEventType> = new Set([
  "REVOKED",
  "UNLINKED",
  "DENIED",
  "EXPIRED",
]);

const accessEventTypeValidator = v.union(
  v.literal("INVITED"),
  v.literal("CLAIMED"),
  v.literal("REVOKED"),
  v.literal("UNLINKED"),
  v.literal("EXPIRED"),
  v.literal("REQUESTED"),
  v.literal("APPROVED"),
  v.literal("DENIED"),
);

export const listAccessLog = query({
  // Cursor-paginated (newest first) so the trail is complete — the old fixed
  // .take() cap silently dropped history past it, which an audit log must not do.
  // Swimmer / viewer / event-type filters apply SERVER-SIDE so a filtered read
  // searches the full history, not just the loaded window.
  args: {
    paginationOpts: paginationOptsValidator,
    swimmerId: v.optional(v.id("swimmers")),
    viewerEmail: v.optional(v.string()),
    type: v.optional(accessEventTypeValidator),
  },
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Newest-first over the append-only log; the most selective filter picks
    // the index, the rest refine it. Every index here ends on creation order,
    // so pages stay newest-first in every mode.
    const base =
      args.swimmerId !== undefined
        ? ctx.db
            .query("accessEvents")
            .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId!))
        : args.viewerEmail !== undefined
          ? ctx.db
              .query("accessEvents")
              .withIndex("by_viewerEmail", (q) =>
                q.eq("viewerEmail", args.viewerEmail!),
              )
          : ctx.db.query("accessEvents").withIndex("by_at");
    const paged = await base
      .order("desc")
      .filter((q) =>
        q.and(
          args.type !== undefined ? q.eq(q.field("type"), args.type) : true,
          args.swimmerId !== undefined && args.viewerEmail !== undefined
            ? q.eq(q.field("viewerEmail"), args.viewerEmail)
            : true,
        ),
      )
      .paginate(args.paginationOpts);
    const events = paged.page;

    // Current status per (viewerEmail|swimmerId) link. active > pending > the
    // latest terminal event → revoked/expired. Live links/pendings win over any
    // historical event so the status reflects reality now.
    const key = (email: string, swimmerId: Id<"swimmers">) =>
      `${email.trim().toLowerCase()}|${swimmerId}`;

    const active = new Set<string>();
    const links = await ctx.db.query("swimmerAccess").take(LINK_SCAN_LIMIT);
    const profileEmail = new Map<Id<"profiles">, string | null>();
    for (const link of links) {
      let email = profileEmail.get(link.profileId);
      if (email === undefined) {
        const p = await ctx.db.get(link.profileId);
        email = p?.email ?? null;
        profileEmail.set(link.profileId, email);
      }
      if (email) active.add(key(email, link.swimmerId));
    }

    const pendingSet = new Set<string>();
    const pendings = await ctx.db
      .query("pendingSwimmerAccess")
      .take(LINK_SCAN_LIMIT);
    for (const p of pendings) pendingSet.add(key(p.email, p.swimmerId));
    // An open self-request is also a pending state.
    const requests = await ctx.db
      .query("swimmerAccessRequests")
      .take(LINK_SCAN_LIMIT);
    for (const r of requests) {
      const p = await ctx.db.get(r.profileId);
      if (p?.email) pendingSet.add(key(p.email, r.swimmerId));
    }

    // Latest terminal event per key, within THIS page (newest-first, so the first
    // terminal seen for a key is its most recent one here). Live links/pendings
    // above are page-independent; the only cross-page imprecision is a terminated
    // link whose newest terminal sits on an older page reading "revoked" rather
    // than "expired" — acceptable for a convenience label on an append-only log.
    const latestTerminal = new Map<string, AccessEventType>();
    for (const ev of events) {
      if (!TERMINAL.has(ev.type)) continue;
      const k = key(ev.viewerEmail, ev.swimmerId);
      if (!latestTerminal.has(k)) latestTerminal.set(k, ev.type);
    }

    const statusFor = (email: string, swimmerId: Id<"swimmers">) => {
      const k = key(email, swimmerId);
      if (active.has(k)) return "active" as const;
      if (pendingSet.has(k)) return "pending" as const;
      const t = latestTerminal.get(k);
      if (t === "EXPIRED") return "expired" as const;
      return "revoked" as const; // REVOKED / UNLINKED / DENIED, or gone
    };

    const swimmerName = swimmerNameResolver(ctx);
    const rows = await Promise.all(
      events.map(async (ev) => ({
        _id: ev._id,
        type: ev.type,
        at: ev.at,
        swimmerId: ev.swimmerId,
        swimmerName: await swimmerName(ev.swimmerId),
        viewerEmail: ev.viewerEmail,
        viewerName: ev.viewerName ?? null,
        actorName: ev.actorName ?? null,
        actorRole: (ev.actorRole ?? null) as Role | null,
        approverName: ev.approverName ?? null,
        status: statusFor(ev.viewerEmail, ev.swimmerId),
      })),
    );

    return { ...paged, page: rows };
  },
});

// ---------------------------------------------------------------------------
// listTimeEntryLog — Part B: result entry + edit provenance (coach-only)
// ---------------------------------------------------------------------------

const swimTypeValidator = v.union(
  v.literal("MEET"),
  v.literal("TIME_TRIAL"),
  v.literal("PRACTICE"),
  v.literal("SCHOOL_GALA"),
);

const roleValidator = v.union(
  v.literal("SUPER_USER"),
  v.literal("COACH"),
  v.literal("VIEWER"),
);

export const listTimeEntryLog = query({
  // Cursor-paginated (newest-entered first) — see listAccessLog on why the audit
  // trails never hard-cap. All the screen's filters apply SERVER-SIDE so a
  // filtered read searches the full history, not just the loaded window.
  args: {
    paginationOpts: paginationOptsValidator,
    swimmerId: v.optional(v.id("swimmers")),
    enteredBy: v.optional(v.id("profiles")),
    swimType: v.optional(swimTypeValidator),
    role: v.optional(roleValidator),
    // Entry-time window in epoch ms (the client converts its local-day pickers).
    enteredFrom: v.optional(v.number()),
    enteredTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Newest-entered first (createdAt ≈ _creationTime; there's no createdAt
    // index, and both the default index and by_swimmer end on creation order).
    const base =
      args.swimmerId !== undefined
        ? ctx.db
            .query("results")
            .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId!))
        : ctx.db.query("results");
    const paged = await base
      .order("desc")
      .filter((q) =>
        q.and(
          args.enteredBy !== undefined
            ? q.eq(q.field("enteredBy"), args.enteredBy)
            : true,
          args.swimType !== undefined
            ? q.eq(q.field("swimType"), args.swimType)
            : true,
          args.enteredFrom !== undefined
            ? q.gte(q.field("createdAt"), args.enteredFrom)
            : true,
          args.enteredTo !== undefined
            ? q.lte(q.field("createdAt"), args.enteredTo)
            : true,
        ),
      )
      .paginate(args.paginationOpts);
    const results = paged.page;

    const getProfile = profileResolver(ctx);
    const swimmerName = swimmerNameResolver(ctx);

    const personFor = async (
      id: Id<"profiles"> | undefined,
    ): Promise<{ name: string; role: Role } | null> => {
      if (!id) return null;
      const p = await getProfile(id);
      if (!p) return { name: REMOVED_ACCOUNT, role: "VIEWER" };
      return { name: p.name, role: p.role };
    };

    const rows = await Promise.all(
      results.map(async (r) => ({
        _id: r._id,
        swimmerId: r.swimmerId,
        swimmerName: await swimmerName(r.swimmerId),
        label: eventLabel(r.distance, r.stroke),
        course: r.course,
        timeMs: r.timeMs,
        swimType: r.swimType,
        swimDate: r.swimDate,
        enteredBy: await personFor(r.enteredBy),
        createdAt: r.createdAt,
        editedBy: await personFor(r.lastEditedBy),
        updatedAt: r.updatedAt ?? null,
      })),
    );

    // Role needs the profile join above, so it filters after the page loads —
    // a short page is fine, pagination carries on from the real cursor.
    const page =
      args.role !== undefined
        ? rows.filter((r) => r.enteredBy?.role === args.role)
        : rows;

    return { ...paged, page };
  },
});

// ---------------------------------------------------------------------------
// listEnterers — the accounts a coach can filter the time-entry log by
// ---------------------------------------------------------------------------
//
// Full option list for the "entered by" dropdown (deriving options from loaded
// rows hid anyone whose entries weren't paged in yet). Includes viewers —
// parents enter school-gala times. Small table; bounded read.

export const listEnterers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("profiles"),
      name: v.string(),
      role: roleValidator,
    }),
  ),
  handler: async (ctx) => {
    await requireCoach(ctx);
    const profiles = await ctx.db.query("profiles").take(500);
    return profiles
      .map((p) => ({ _id: p._id, name: p.name, role: p.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------------------------------------------------------------------------
// listDeletedTimeLog — Part C: removed results (coach-only)
// ---------------------------------------------------------------------------

export const listDeletedTimeLog = query({
  // Cursor-paginated (newest-deleted first), like the other two trails, so the
  // history is never silently truncated. Every filter applies SERVER-SIDE, so a
  // filtered read searches the whole log rather than the loaded window.
  args: {
    paginationOpts: paginationOptsValidator,
    swimmerId: v.optional(v.id("swimmers")),
    deletedBy: v.optional(v.id("profiles")),
    swimType: v.optional(swimTypeValidator),
    // Deletion-time window in epoch ms (the client converts its local-day pickers).
    deletedFrom: v.optional(v.number()),
    deletedTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Both indexes end on `at`, so newest-first is an ordered index scan either
    // way — unlike Part B, which has no createdAt index to lean on.
    const base =
      args.swimmerId !== undefined
        ? ctx.db
            .query("resultDeletions")
            .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId!))
        : ctx.db.query("resultDeletions").withIndex("by_at");
    const paged = await base
      .order("desc")
      .filter((q) =>
        q.and(
          args.deletedBy !== undefined
            ? q.eq(q.field("actorProfileId"), args.deletedBy)
            : true,
          args.swimType !== undefined
            ? q.eq(q.field("swimType"), args.swimType)
            : true,
          args.deletedFrom !== undefined
            ? q.gte(q.field("at"), args.deletedFrom)
            : true,
          args.deletedTo !== undefined ? q.lte(q.field("at"), args.deletedTo) : true,
        ),
      )
      .paginate(args.paginationOpts);

    // Every name and role was snapshotted at deletion time, so there is nothing
    // to join and — unlike Part B's role filter — nothing that has to be dropped
    // after the page loads. A full page here is always a full page.
    const page = paged.page.map((d) => ({
      _id: d._id,
      at: d.at,
      actorName: d.actorName,
      actorRole: d.actorRole as Role,
      reason: d.reason ?? null,
      swimmerId: d.swimmerId,
      swimmerName: d.swimmerName,
      label: eventLabel(d.distance, d.stroke),
      course: d.course,
      timeMs: d.timeMs,
      swimType: d.swimType,
      swimDate: d.swimDate,
      enteredByName: d.enteredByName,
      enteredByRole: d.enteredByRole as Role,
      originalCreatedAt: d.originalCreatedAt,
    }));

    return { ...paged, page };
  },
});
