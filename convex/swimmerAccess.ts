import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCoachManagesSwimmer,
  requireCoach,
  requireSignedIn,
} from "./authz";
import { recordAccessEvent } from "./audit";
import type { Doc } from "./_generated/dataModel";

// Viewer ↔ swimmer linkage (BRD §2, §5.9, Step 15; access-control Phase 6). A
// coach grants a viewer read access to one or more swimmers; every viewer-facing
// read then scopes to exactly this link set (see authz.ts). Managing viewers is
// club-scoped — a coach only touches their own club's swimmers (Phase 5).
//
// A grant is by EMAIL, normalised the same way auth stores it (lower-cased,
// trimmed). If an account already exists we link it now; if not, we pre-authorise
// it in `pendingSwimmerAccess`, and auth.ts materialises the link when that email
// signs up. So a coach can invite a parent before they've made an account.

/**
 * Grant `email` viewer access to `swimmerId`: link an existing account now, or
 * pre-authorise the email for when it signs up. No auth here — the caller has
 * already checked staff + club scope. Idempotent (never double-links / -pends).
 *
 * On a NEWLY created link or pending invite it schedules a Resend invite email
 * (`swimmerName` is used in the copy); an idempotent re-grant emails nothing.
 */
export async function grantSwimmerAccess(
  ctx: MutationCtx,
  swimmerId: Id<"swimmers">,
  rawEmail: string,
  swimmerName: string,
  // The coach performing the grant, snapshotted onto the audit trail (§R17). A
  // new link / pending invite records an INVITED event by this actor; an
  // idempotent re-grant records nothing. Optional so legacy callers still compile.
  actor?: Doc<"profiles"> | null,
): Promise<
  "linked" | "already_linked" | "pending" | "already_pending" | "coach" | "skipped"
> {
  const email = rawEmail.trim().toLowerCase();
  if (email === "") return "skipped";

  const profile = await ctx.db
    .query("profiles")
    .filter((q) => q.eq(q.field("email"), email))
    .unique();

  if (profile) {
    // A coach / super-user already sees every swimmer — linking is meaningless
    // and would wrongly imply a scoped, read-only relationship.
    if (profile.role !== "VIEWER") return "coach";
    const existing = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (existing) return "already_linked";
    await ctx.db.insert("swimmerAccess", { profileId: profile._id, swimmerId });
    await recordAccessEvent(ctx, {
      type: "INVITED",
      swimmerId,
      viewerEmail: email,
      viewerProfileId: profile._id,
      viewerName: profile.name,
      actor,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendViewerInvite, {
      toEmail: email,
      swimmerName,
      kind: "linked",
    });
    return "linked";
  }

  // No account yet — pre-authorise by email (dedupe on email + swimmer).
  const pending = await ctx.db
    .query("pendingSwimmerAccess")
    .withIndex("by_email", (q) => q.eq("email", email))
    .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
    .first();
  if (pending) return "already_pending";
  await ctx.db.insert("pendingSwimmerAccess", {
    email,
    swimmerId,
    invitedByProfileId: actor?._id,
    invitedByName: actor?.name,
    invitedAt: Date.now(),
  });
  await recordAccessEvent(ctx, {
    type: "INVITED",
    swimmerId,
    viewerEmail: email,
    actor,
  });
  await ctx.scheduler.runAfter(0, internal.emails.sendViewerInvite, {
    toEmail: email,
    swimmerName,
    kind: "pending",
  });
  return "pending";
}

// Materialising pending grants on sign-in lives in auth.ts, because that
// callback's ctx uses the generic data model (no typed indexes) and must query
// with `.filter(...)`.

// ---------------------------------------------------------------------------
// grantViewerAccess — invite/link a viewer by email (coach, own club)
// ---------------------------------------------------------------------------

export const grantViewerAccess = mutation({
  args: { viewerEmail: v.string(), swimmerId: v.id("swimmers") },
  returns: v.object({
    status: v.union(v.literal("linked"), v.literal("pending")),
    email: v.string(),
  }),
  handler: async (ctx, { viewerEmail, swimmerId }) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);

    const email = viewerEmail.trim().toLowerCase();
    if (email === "") throw new Error("Enter the viewer's email.");

    const status = await grantSwimmerAccess(
      ctx,
      swimmerId,
      email,
      swimmer.name,
      profile,
    );
    if (status === "coach") {
      throw new Error(
        "That account is a coach or admin and already sees every swimmer.",
      );
    }
    if (status === "skipped") throw new Error("Enter the viewer's email.");
    const simple: "pending" | "linked" =
      status === "pending" || status === "already_pending" ? "pending" : "linked";
    return { status: simple, email };
  },
});

// ---------------------------------------------------------------------------
// unlinkViewer — revoke a linked viewer's access (coach, own club)
// ---------------------------------------------------------------------------

export const unlinkViewer = mutation({
  args: { profileId: v.id("profiles"), swimmerId: v.id("swimmers") },
  returns: v.null(),
  handler: async (ctx, { profileId, swimmerId }) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);

    const link = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (link) {
      // Record WHO removed access, and for WHOM, before the link is gone (§R17):
      // once deleted the provenance can't be reconstructed.
      const viewer = await ctx.db.get(profileId);
      await ctx.db.delete(link._id);
      await recordAccessEvent(ctx, {
        type: "UNLINKED",
        swimmerId,
        viewerEmail: viewer?.email ?? "",
        viewerProfileId: profileId,
        viewerName: viewer?.name,
        actor: profile,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// cancelPendingViewer — withdraw an invite that hasn't been claimed yet
// ---------------------------------------------------------------------------

export const cancelPendingViewer = mutation({
  args: { email: v.string(), swimmerId: v.id("swimmers") },
  returns: v.null(),
  handler: async (ctx, { email, swimmerId }) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);

    const normalized = email.trim().toLowerCase();
    const rows = await ctx.db
      .query("pendingSwimmerAccess")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    // Record the withdrawal even if the row was already gone (idempotent-friendly),
    // so a coach can see the invite was revoked and by whom (§R17).
    if (rows.length > 0) {
      await recordAccessEvent(ctx, {
        type: "REVOKED",
        swimmerId,
        viewerEmail: normalized,
        actor: profile,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// listSwimmerViewers — linked viewers AND pending invites for one swimmer
// ---------------------------------------------------------------------------

export const listSwimmerViewers = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.array(
    v.object({
      pending: v.boolean(),
      email: v.string(),
      name: v.string(), // "" for a pending invite (no account yet)
      profileId: v.union(v.id("profiles"), v.null()),
    }),
  ),
  handler: async (ctx, { swimmerId }) => {
    await requireCoach(ctx);

    const links = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(200);
    const linked = await Promise.all(
      links.map(async (link) => {
        const profile = await ctx.db.get(link.profileId);
        return profile
          ? {
              pending: false,
              email: profile.email,
              name: profile.name,
              profileId: profile._id as Id<"profiles"> | null,
            }
          : null;
      }),
    );

    const pendings = await ctx.db
      .query("pendingSwimmerAccess")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(200);
    const pending = pendings.map((p) => ({
      pending: true,
      email: p.email,
      name: "",
      profileId: null as Id<"profiles"> | null,
    }));

    return [
      ...linked.filter((x): x is NonNullable<typeof x> => x !== null),
      ...pending,
    ].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  },
});

// ---------------------------------------------------------------------------
// Self-service viewer access requests (access-control P2)
// ---------------------------------------------------------------------------
//
// A viewer who has found their swimmer asks the owning club's coach for access,
// instead of the coach having to invite them by email first. The coach approves
// (→ a real swimmerAccess link) or denies from the swimmer's profile. Requests
// are pending-only rows, deleted on either decision.

export const requestSwimmerAccess = mutation({
  args: { swimmerId: v.id("swimmers") },
  returns: v.object({
    status: v.union(
      v.literal("requested"),
      v.literal("already_requested"),
      v.literal("already_linked"),
    ),
  }),
  handler: async (ctx, { swimmerId }) => {
    const profile = await requireSignedIn(ctx);
    // Coaches / super-users already see every swimmer — a request is meaningless.
    if (profile.role !== "VIEWER") {
      throw new Error("Coaches and admins already see every swimmer.");
    }
    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");

    const linked = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (linked) return { status: "already_linked" as const };

    const existing = await ctx.db
      .query("swimmerAccessRequests")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (existing) return { status: "already_requested" as const };

    await ctx.db.insert("swimmerAccessRequests", {
      profileId: profile._id,
      swimmerId,
      createdAt: Date.now(),
    });
    await recordAccessEvent(ctx, {
      type: "REQUESTED",
      swimmerId,
      viewerEmail: profile.email,
      viewerProfileId: profile._id,
      viewerName: profile.name,
      actor: profile, // the viewer performed the request
    });
    return { status: "requested" as const };
  },
});

// The signed-in viewer's own pending requests (swimmer ids), so the "find your
// swimmer" screen can show a "Requested" state without leaking anyone else's.
export const listMyAccessRequests = query({
  args: {},
  returns: v.array(v.id("swimmers")),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    if (profile.role !== "VIEWER") return [];
    const rows = await ctx.db
      .query("swimmerAccessRequests")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(200);
    return rows.map((r) => r.swimmerId);
  },
});

// Pending access requests for ONE swimmer, for the owning club's coach to action.
export const listAccessRequestsForSwimmer = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.array(
    v.object({
      requestId: v.id("swimmerAccessRequests"),
      name: v.string(),
      email: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { swimmerId }) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);

    const rows = await ctx.db
      .query("swimmerAccessRequests")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(200);
    const out = [];
    for (const r of rows) {
      const requester = await ctx.db.get(r.profileId);
      if (!requester) continue;
      out.push({
        requestId: r._id,
        name: requester.name,
        email: requester.email,
        createdAt: r.createdAt,
      });
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const approveAccessRequest = mutation({
  args: { requestId: v.id("swimmerAccessRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const profile = await requireCoach(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const swimmer = await ctx.db.get(request.swimmerId);
    if (!swimmer) {
      await ctx.db.delete(requestId);
      return null;
    }
    assertCoachManagesSwimmer(profile, swimmer);

    const existing = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", request.profileId))
      .filter((q) => q.eq(q.field("swimmerId"), request.swimmerId))
      .first();
    if (!existing) {
      await ctx.db.insert("swimmerAccess", {
        profileId: request.profileId,
        swimmerId: request.swimmerId,
      });
    }
    await ctx.db.delete(requestId);
    const requester = await ctx.db.get(request.profileId);
    await recordAccessEvent(ctx, {
      type: "APPROVED",
      swimmerId: request.swimmerId,
      viewerEmail: requester?.email ?? "",
      viewerProfileId: request.profileId,
      viewerName: requester?.name,
      actor: profile,
    });
    return null;
  },
});

export const denyAccessRequest = mutation({
  args: { requestId: v.id("swimmerAccessRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const profile = await requireCoach(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const swimmer = await ctx.db.get(request.swimmerId);
    if (swimmer) assertCoachManagesSwimmer(profile, swimmer);
    const requester = await ctx.db.get(request.profileId);
    await ctx.db.delete(requestId);
    await recordAccessEvent(ctx, {
      type: "DENIED",
      swimmerId: request.swimmerId,
      viewerEmail: requester?.email ?? "",
      viewerProfileId: request.profileId,
      viewerName: requester?.name,
      actor: profile,
    });
    return null;
  },
});
