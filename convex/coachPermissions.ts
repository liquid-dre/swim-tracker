import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireSignedIn, requireStaff, requireSuperCoachOf } from "./authz";
import {
  coachLevelOf,
  DEFAULT_JUNIOR_MAX_AGE,
  JUNIOR_MAX_AGE_MAX,
  JUNIOR_MAX_AGE_MIN,
  type CoachLevel,
} from "../lib/coachLevel";

/*
  Coach permissions (docs/access-control.md, "Coach levels & join requests").

  Joining: anyone may ask to coach a club — at sign-up, or later from the
  account menu. A request is a PENDING `coachRequests` row; the account stays a
  VIEWER with no swimmers until that club's Super Coaches (or the Admin, who can
  act on every club and is the only one who can for a club with no Super Coach
  yet) approve it WITH a level, or reject it.

  Managing: a club's Super Coaches change any coach's level or remove them back
  to a viewer, and set the club's junior/senior age split. A club can never lose
  its LAST Super Coach to one of its own coaches — that would lock the club out
  of its own Permissions. The Admin is not bound by that guard: they can always
  put a club right from Admin › Clubs & coaches.

  Every decision is a `coachPermissionEvents` row, the club's history.
*/

const coachLevelValidator = v.union(
  v.literal("SUPER"),
  v.literal("SENIOR"),
  v.literal("JUNIOR"),
);

const REASON_MAX = 300;

function cleanReason(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > REASON_MAX) throw new ConvexError("That reason is too long.");
  return trimmed;
}

/** Append one row to a club's permission history. */
export async function recordPermissionEvent(
  ctx: MutationCtx,
  e: {
    clubId: Id<"clubs">;
    type: Doc<"coachPermissionEvents">["type"];
    subject: Doc<"profiles">;
    actor: Doc<"profiles">;
    fromLevel?: CoachLevel;
    toLevel?: CoachLevel;
    reason?: string;
  },
): Promise<void> {
  await ctx.db.insert("coachPermissionEvents", {
    clubId: e.clubId,
    type: e.type,
    at: Date.now(),
    subjectProfileId: e.subject._id,
    subjectName: e.subject.name,
    subjectEmail: e.subject.email,
    actorProfileId: e.actor._id,
    actorName: e.actor.name,
    fromLevel: e.fromLevel,
    toLevel: e.toLevel,
    reason: e.reason,
  });
}

/** The profile's PENDING request, if any (at most one by construction). */
async function pendingRequestOf(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"profiles">,
): Promise<Doc<"coachRequests"> | null> {
  const rows = await ctx.db
    .query("coachRequests")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .take(100);
  return rows.find((r) => r.status === "PENDING") ?? null;
}

/**
 * Close a profile's pending request because they became a coach some other way
 * (an invite, the Admin assigning them). Shared with convex/clubs.ts.
 */
export async function closePendingRequest(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  decidedBy: Id<"profiles">,
): Promise<void> {
  const pending = await pendingRequestOf(ctx, profileId);
  if (pending === null) return;
  await ctx.db.patch(pending._id, {
    status: "CANCELLED",
    decidedBy,
    decidedAt: Date.now(),
  });
}

/** How many SUPER coaches the club has (absent level = SUPER). */
async function superCoachCount(ctx: QueryCtx | MutationCtx, clubId: Id<"clubs">) {
  const members = await ctx.db
    .query("profiles")
    .withIndex("by_club", (q) => q.eq("clubId", clubId))
    .take(500);
  return members.filter((p) => coachLevelOf(p) === "SUPER").length;
}

/**
 * Refuse a change that would leave `coach`'s club with no Super Coach, when the
 * caller is one of the club's own coaches. Shared with convex/clubs.ts.
 */
export async function assertKeepsASuperCoach(
  ctx: QueryCtx | MutationCtx,
  actor: Doc<"profiles">,
  coach: Doc<"profiles">,
): Promise<void> {
  if (actor.role === "SUPER_USER") return;
  if (coachLevelOf(coach) !== "SUPER" || !coach.clubId) return;
  if ((await superCoachCount(ctx, coach.clubId)) <= 1) {
    throw new ConvexError(
      "A club needs at least one super coach. Make someone else a super coach first.",
    );
  }
}

/** Load a coach of `clubId` or throw — the subject of a level change / removal. */
async function loadClubCoach(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
): Promise<Doc<"profiles"> & { clubId: Id<"clubs"> }> {
  const coach = await ctx.db.get(profileId);
  if (!coach || coach.role !== "COACH" || !coach.clubId) {
    throw new ConvexError("That account is no longer a coach.");
  }
  return coach as Doc<"profiles"> & { clubId: Id<"clubs"> };
}

// ---------------------------------------------------------------------------
// The requester's side
// ---------------------------------------------------------------------------

/**
 * Every club, by name only — the sign-up club picker. Public by decision: a
 * person choosing their club has no account yet. No counts, no coach names.
 */
export const listClubsForSignup = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("clubs"), name: v.string() })),
  handler: async (ctx) => {
    const clubs = await ctx.db.query("clubs").take(500);
    return clubs
      .map((c) => ({ _id: c._id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Ask to coach a club. Idempotent for the same club; one pending at a time. */
export const requestCoachAccess = mutation({
  args: { clubId: v.id("clubs") },
  returns: v.object({ clubName: v.string() }),
  handler: async (ctx, { clubId }) => {
    const profile = await requireSignedIn(ctx);
    if (profile.role !== "VIEWER") {
      throw new ConvexError("You already have coach access.");
    }
    const club = await ctx.db.get(clubId);
    if (!club) throw new ConvexError("That club no longer exists.");

    const pending = await pendingRequestOf(ctx, profile._id);
    if (pending !== null) {
      if (pending.clubId === clubId) return { clubName: club.name };
      throw new ConvexError(
        "You already have a request waiting with another club. Cancel it first.",
      );
    }

    await ctx.db.insert("coachRequests", {
      profileId: profile._id,
      clubId,
      status: "PENDING",
      createdAt: Date.now(),
    });
    await recordPermissionEvent(ctx, {
      clubId,
      type: "REQUESTED",
      subject: profile,
      actor: profile,
    });
    return { clubName: club.name };
  },
});

/** Withdraw the caller's pending request. A no-op when there is none. */
export const cancelMyCoachRequest = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    const pending = await pendingRequestOf(ctx, profile._id);
    if (pending === null) return null;
    await ctx.db.patch(pending._id, {
      status: "CANCELLED",
      decidedBy: profile._id,
      decidedAt: Date.now(),
    });
    await recordPermissionEvent(ctx, {
      clubId: pending.clubId,
      type: "CANCELLED",
      subject: profile,
      actor: profile,
    });
    return null;
  },
});

/** "Continue without coach access" — lets a rejected requester into the app. */
export const dismissCoachRejection = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    const rows = await ctx.db
      .query("coachRequests")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const now = Date.now();
    for (const r of rows) {
      if (r.status === "REJECTED" && r.seenAt === undefined) {
        await ctx.db.patch(r._id, { seenAt: now });
      }
    }
    return null;
  },
});

/**
 * The caller's open request (or a rejection they haven't dismissed), for the
 * waiting screen and the account menu. Null when neither.
 *
 * `blocking`: the account has no linked swimmers, so there is nothing behind
 * the waiting screen to show — a brand-new coach. A parent who asked later
 * keeps using the app while they wait; the account menu carries the request.
 */
export const myCoachRequest = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("PENDING"), v.literal("REJECTED")),
      clubName: v.string(),
      createdAt: v.number(),
      decidedAt: v.union(v.number(), v.null()),
      reason: v.union(v.string(), v.null()),
      blocking: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    if (profile.role !== "VIEWER") return null;
    const rows = await ctx.db
      .query("coachRequests")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .take(100);
    const latest = rows.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latest) return null;
    const open =
      latest.status === "PENDING" ||
      (latest.status === "REJECTED" && latest.seenAt === undefined);
    if (!open) return null;
    const club = await ctx.db.get(latest.clubId);
    const link = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .first();
    return {
      status: latest.status as "PENDING" | "REJECTED",
      clubName: club?.name ?? "the club",
      createdAt: latest.createdAt,
      decidedAt: latest.decidedAt ?? null,
      reason: latest.reason ?? null,
      blocking: link === null,
    };
  },
});

// ---------------------------------------------------------------------------
// The club's side — Permissions (Super Coach of the club, or the Admin)
// ---------------------------------------------------------------------------

/**
 * Resolve which club a Permissions call acts on: a coach's own club always
 * (an argument naming another is refused by requireSuperCoachOf), the named
 * club for the Admin.
 */
async function permissionsClub(
  ctx: QueryCtx | MutationCtx,
  clubId: Id<"clubs"> | undefined,
): Promise<{ actor: Doc<"profiles">; club: Doc<"clubs"> }> {
  const caller = await requireStaff(ctx);
  const target = clubId ?? caller.clubId;
  if (!target) {
    throw new ConvexError(
      caller.role === "SUPER_USER" ? "Pick a club." : "You aren't assigned to a club yet.",
    );
  }
  const actor = await requireSuperCoachOf(ctx, target);
  const club = await ctx.db.get(target);
  if (!club) throw new ConvexError("That club no longer exists.");
  return { actor, club };
}

const permissionEventType = v.union(
  v.literal("REQUESTED"),
  v.literal("CANCELLED"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("LEVEL_CHANGED"),
  v.literal("REMOVED"),
  v.literal("JOINED_BY_INVITE"),
  v.literal("ASSIGNED_BY_ADMIN"),
);

/** Everything the Permissions screen shows, in one read. */
export const getClubPermissions = query({
  args: { clubId: v.optional(v.id("clubs")) },
  returns: v.object({
    club: v.object({
      _id: v.id("clubs"),
      name: v.string(),
      juniorMaxAge: v.number(),
    }),
    pending: v.array(
      v.object({
        requestId: v.id("coachRequests"),
        name: v.string(),
        email: v.string(),
        createdAt: v.number(),
      }),
    ),
    coaches: v.array(
      v.object({
        profileId: v.id("profiles"),
        name: v.string(),
        email: v.string(),
        level: coachLevelValidator,
        isSelf: v.boolean(),
      }),
    ),
    history: v.array(
      v.object({
        _id: v.id("coachPermissionEvents"),
        type: permissionEventType,
        at: v.number(),
        subjectName: v.string(),
        actorName: v.string(),
        fromLevel: v.union(coachLevelValidator, v.null()),
        toLevel: v.union(coachLevelValidator, v.null()),
        reason: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { clubId }) => {
    const { actor, club } = await permissionsClub(ctx, clubId);

    const requests = await ctx.db
      .query("coachRequests")
      .withIndex("by_club_status", (q) =>
        q.eq("clubId", club._id).eq("status", "PENDING"),
      )
      .take(200);
    const pending = [];
    for (const r of requests) {
      const p = await ctx.db.get(r.profileId);
      if (!p) continue;
      pending.push({ requestId: r._id, name: p.name, email: p.email, createdAt: r.createdAt });
    }
    pending.sort((a, b) => a.createdAt - b.createdAt); // oldest waiting first

    const members = await ctx.db
      .query("profiles")
      .withIndex("by_club", (q) => q.eq("clubId", club._id))
      .take(500);
    const coaches = members
      .filter((p) => p.role === "COACH")
      .map((p) => ({
        profileId: p._id,
        name: p.name,
        email: p.email,
        level: coachLevelOf(p) ?? ("SUPER" as const),
        isSelf: p._id === actor._id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const events = await ctx.db
      .query("coachPermissionEvents")
      .withIndex("by_club_at", (q) => q.eq("clubId", club._id))
      .order("desc")
      .take(50);

    return {
      club: {
        _id: club._id,
        name: club.name,
        juniorMaxAge: club.juniorMaxAge ?? DEFAULT_JUNIOR_MAX_AGE,
      },
      pending,
      coaches,
      history: events.map((e) => ({
        _id: e._id,
        type: e.type,
        at: e.at,
        subjectName: e.subjectName,
        actorName: e.actorName,
        fromLevel: e.fromLevel ?? null,
        toLevel: e.toLevel ?? null,
        reason: e.reason ?? null,
      })),
    };
  },
});

/** Pending-request count for the caller's own club — the sidebar badge. */
export const pendingCoachRequestCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    if (coachLevelOf(profile) !== "SUPER" || !profile.clubId) return 0;
    const rows = await ctx.db
      .query("coachRequests")
      .withIndex("by_club_status", (q) =>
        q.eq("clubId", profile.clubId!).eq("status", "PENDING"),
      )
      .take(100);
    return rows.length;
  },
});

/** Load a PENDING request and authorise the caller over its club. */
async function decidableRequest(ctx: MutationCtx, requestId: Id<"coachRequests">) {
  const request = await ctx.db.get(requestId);
  if (!request || request.status !== "PENDING") {
    throw new ConvexError("That request has already been dealt with.");
  }
  const actor = await requireSuperCoachOf(ctx, request.clubId);
  const requester = await ctx.db.get(request.profileId);
  if (!requester) throw new ConvexError("That account no longer exists.");
  return { request, actor, requester };
}

/** Approve a request as a coach of the given level — no default level. */
export const approveCoachRequest = mutation({
  args: { requestId: v.id("coachRequests"), level: coachLevelValidator },
  returns: v.null(),
  handler: async (ctx, { requestId, level }) => {
    const { request, actor, requester } = await decidableRequest(ctx, requestId);
    if (requester.role !== "VIEWER") {
      // They became a coach another way (an invite, the Admin) meanwhile.
      await ctx.db.patch(request._id, {
        status: "CANCELLED",
        decidedBy: actor._id,
        decidedAt: Date.now(),
      });
      throw new ConvexError("That account already has coach access.");
    }
    await ctx.db.patch(requester._id, {
      role: "COACH",
      clubId: request.clubId,
      coachLevel: level,
    });
    await ctx.db.patch(request._id, {
      status: "APPROVED",
      approvedLevel: level,
      decidedBy: actor._id,
      decidedAt: Date.now(),
    });
    await recordPermissionEvent(ctx, {
      clubId: request.clubId,
      type: "APPROVED",
      subject: requester,
      actor,
      toLevel: level,
    });
    return null;
  },
});

/** Reject a request, with an optional reason the requester will see. */
export const rejectCoachRequest = mutation({
  args: { requestId: v.id("coachRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { request, actor, requester } = await decidableRequest(ctx, args.requestId);
    const reason = cleanReason(args.reason);
    await ctx.db.patch(request._id, {
      status: "REJECTED",
      reason,
      decidedBy: actor._id,
      decidedAt: Date.now(),
    });
    await recordPermissionEvent(ctx, {
      clubId: request.clubId,
      type: "REJECTED",
      subject: requester,
      actor,
      reason,
    });
    return null;
  },
});

/** Change a club coach's level. Never strands the club without a Super Coach. */
export const setCoachLevel = mutation({
  args: { profileId: v.id("profiles"), level: coachLevelValidator },
  returns: v.null(),
  handler: async (ctx, { profileId, level }) => {
    const coach = await loadClubCoach(ctx, profileId);
    const actor = await requireSuperCoachOf(ctx, coach.clubId);
    const from = coachLevelOf(coach) ?? "SUPER";
    if (from === level) return null;
    if (level !== "SUPER") await assertKeepsASuperCoach(ctx, actor, coach);
    await ctx.db.patch(coach._id, { coachLevel: level });
    await recordPermissionEvent(ctx, {
      clubId: coach.clubId,
      type: "LEVEL_CHANGED",
      subject: coach,
      actor,
      fromLevel: from,
      toLevel: level,
    });
    return null;
  },
});

/** Remove a coach from the club — back to a viewer, swimmers and all intact. */
export const removeClubCoach = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const coach = await loadClubCoach(ctx, profileId);
    const actor = await requireSuperCoachOf(ctx, coach.clubId);
    await assertKeepsASuperCoach(ctx, actor, coach);
    await ctx.db.patch(coach._id, {
      role: "VIEWER",
      clubId: undefined,
      coachLevel: undefined,
    });
    await recordPermissionEvent(ctx, {
      clubId: coach.clubId,
      type: "REMOVED",
      subject: coach,
      actor,
      fromLevel: coachLevelOf(coach) ?? "SUPER",
    });
    return null;
  },
});

/** Set the club's junior/senior split: juniors are this age and under. */
export const setJuniorMaxAge = mutation({
  args: { clubId: v.optional(v.id("clubs")), juniorMaxAge: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { club } = await permissionsClub(ctx, args.clubId);
    const age = args.juniorMaxAge;
    if (!Number.isInteger(age) || age < JUNIOR_MAX_AGE_MIN || age > JUNIOR_MAX_AGE_MAX) {
      throw new ConvexError(
        `Pick an age between ${JUNIOR_MAX_AGE_MIN} and ${JUNIOR_MAX_AGE_MAX}.`,
      );
    }
    await ctx.db.patch(club._id, { juniorMaxAge: age });
    return null;
  },
});
