import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import { eventLabel } from "../lib/swim";

/*
  Coach-visible AUDIT TRAILS (§R17). Two coach-only logs — who did what, when, and
  by which account:

    A. Access log      (listAccessLog)    — every viewer-access event over the R5
                                             invite flow, from the append-only
                                             `accessEvents` table.
    B. Time-entry log  (listTimeEntryLog) — every result's entry + last-edit
                                             provenance, derived from `results`.

  Both gate on requireCoach, so a viewer can never reach either (server-enforced).
  `recordAccessEvent` is the shared write seam the access mutations call. Reads are
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

export const listAccessLog = query({
  // Cursor-paginated (newest first) so the trail is complete — the old fixed
  // .take() cap silently dropped history past it, which an audit log must not do.
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Newest-first over the append-only log.
    const paged = await ctx.db
      .query("accessEvents")
      .withIndex("by_at")
      .order("desc")
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

export const listTimeEntryLog = query({
  // Cursor-paginated (newest-entered first) — see listAccessLog on why the audit
  // trails never hard-cap.
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Newest-entered first (createdAt ≈ _creationTime; there's no createdAt index,
    // and the default index orders by creation time).
    const paged = await ctx.db
      .query("results")
      .order("desc")
      .paginate(args.paginationOpts);
    const results = paged.page;

    const getProfile = profileResolver(ctx);
    const swimmerName = swimmerNameResolver(ctx);

    const personFor = async (
      id: Id<"profiles"> | undefined,
    ): Promise<{ name: string; role: Role } | null> => {
      if (!id) return null;
      const p = await getProfile(id);
      if (!p) return { name: "(removed account)", role: "VIEWER" };
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

    return { ...paged, page: rows };
  },
});
