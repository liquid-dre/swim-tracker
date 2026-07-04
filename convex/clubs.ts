import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCoach, requireSignedIn, requireSuperUser } from "./authz";

// Club administration (access-control Phase 4c). A club owns swimmers and is the
// edit boundary for coaches (Phase 5). Only the SUPER_USER creates clubs and
// assigns coaches to them; staff may read the club list. Enforced server-side.

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Enter a club name.");
  if (trimmed.length > 80) throw new Error("Club name is too long.");
  return trimmed;
}

// ---------------------------------------------------------------------------
// createClub / renameClub — super-user only
// ---------------------------------------------------------------------------

export const createClub = mutation({
  args: { name: v.string() },
  returns: v.id("clubs"),
  handler: async (ctx, { name }) => {
    await requireSuperUser(ctx);
    return await ctx.db.insert("clubs", {
      name: cleanName(name),
      createdAt: Date.now(),
    });
  },
});

export const renameClub = mutation({
  args: { clubId: v.id("clubs"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { clubId, name }) => {
    await requireSuperUser(ctx);
    const club = await ctx.db.get(clubId);
    if (!club) throw new Error("That club no longer exists.");
    await ctx.db.patch(clubId, { name: cleanName(name) });
    return null;
  },
});

// ---------------------------------------------------------------------------
// listClubs — every club with its coach / swimmer counts (staff read)
// ---------------------------------------------------------------------------

export const listClubs = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("clubs"),
      name: v.string(),
      coachCount: v.number(),
      swimmerCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireCoach(ctx); // staff (coach or super-user)
    const clubs = await ctx.db.query("clubs").take(200);
    const out = [];
    for (const club of clubs) {
      const coaches = await ctx.db
        .query("profiles")
        .withIndex("by_club", (q) => q.eq("clubId", club._id))
        .take(200);
      const swimmers = await ctx.db
        .query("swimmers")
        .withIndex("by_club", (q) => q.eq("clubId", club._id))
        .take(1000);
      out.push({
        _id: club._id,
        name: club.name,
        coachCount: coaches.length,
        swimmerCount: swimmers.length,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------------------------------------------------------------------------
// listCoaches — coaches and their club assignment (super-user admin)
// ---------------------------------------------------------------------------

export const listCoaches = query({
  args: {},
  returns: v.array(
    v.object({
      profileId: v.id("profiles"),
      name: v.string(),
      email: v.string(),
      clubId: v.union(v.id("clubs"), v.null()),
      clubName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireSuperUser(ctx);
    const coaches = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "COACH"))
      .take(500);
    const out = [];
    for (const c of coaches) {
      const club = c.clubId ? await ctx.db.get(c.clubId) : null;
      out.push({
        profileId: c._id,
        name: c.name,
        email: c.email,
        clubId: c.clubId ?? null,
        clubName: club?.name ?? null,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------------------------------------------------------------------------
// assignCoachToClub — promote an account to COACH of a club (super-user)
// ---------------------------------------------------------------------------
//
// Mirrors swimmerAccess.linkViewer: the account must already exist (they've
// signed up), looked up by the email they used, normalised the same way auth
// stores it. Setting a coach's club is also how you MOVE a coach between clubs.
export const assignCoachToClub = mutation({
  args: { email: v.string(), clubId: v.id("clubs") },
  returns: v.object({
    profileId: v.id("profiles"),
    name: v.string(),
    email: v.string(),
  }),
  handler: async (ctx, { email, clubId }) => {
    await requireSuperUser(ctx);

    const club = await ctx.db.get(clubId);
    if (!club) throw new Error("That club no longer exists.");

    const normalized = email.trim().toLowerCase();
    if (normalized === "") throw new Error("Enter the coach's email.");

    const profile = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("email"), normalized))
      .unique();
    if (!profile) {
      throw new Error(
        "No account uses that email yet. Ask them to sign up first, then assign.",
      );
    }
    if (profile.role === "SUPER_USER") {
      throw new Error("That account is a super-user and already sees every club.");
    }

    await ctx.db.patch(profile._id, { role: "COACH", clubId });
    return { profileId: profile._id, name: profile.name, email: profile.email };
  },
});

// ---------------------------------------------------------------------------
// removeCoach — revoke a coach back to a viewer (super-user)
// ---------------------------------------------------------------------------

export const removeCoach = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    await requireSuperUser(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
    if (profile.role !== "COACH") {
      throw new Error("That account is not a coach.");
    }
    await ctx.db.patch(profileId, { role: "VIEWER", clubId: undefined });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Coach invites (access-control P0) — token-gated, super-user issued
// ---------------------------------------------------------------------------
//
// The smooth, non-spoofable coach onboarding path. A super-user issues an invite
// for (email, club); we mint an unguessable single-use token and (best-effort)
// email a sign-up link carrying it. Whoever signs up / signs in through that link
// calls `redeemCoachInvite`, which sets THEIR account to COACH of that club in one
// step. Possession of the token IS the authorisation, so a coach can never
// self-promote or pick their own club, and it doesn't depend on email delivery or
// verification being configured. `assignCoachToClub` remains for assigning an
// account that already exists.

function newToken(): string {
  // 2× UUIDv4 → 244 bits of entropy, hex only (URL-safe). Unguessable.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const createCoachInvite = mutation({
  args: { email: v.string(), clubId: v.id("clubs") },
  returns: v.object({ token: v.string(), email: v.string(), clubName: v.string() }),
  handler: async (ctx, { email, clubId }) => {
    const admin = await requireSuperUser(ctx);

    const club = await ctx.db.get(clubId);
    if (!club) throw new Error("That club no longer exists.");

    const normalized = normaliseEmail(email);
    if (normalized === "") throw new Error("Enter the coach's email.");

    // If the account already exists, assigning directly is the better path than
    // an invite link they'd have to click while already signed in.
    const existing = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("email"), normalized))
      .unique();
    if (existing) {
      throw new Error(
        "That email already has an account — use “Assign coach” to add them to a club instead.",
      );
    }

    const token = newToken();
    await ctx.db.insert("coachInvites", {
      email: normalized,
      clubId,
      token,
      createdAt: Date.now(),
      createdBy: admin._id,
    });

    // Best-effort invite email (no-op if Resend isn't configured).
    await ctx.scheduler.runAfter(0, internal.emails.sendCoachInvite, {
      toEmail: normalized,
      clubName: club.name,
      token,
    });

    return { token, email: normalized, clubName: club.name };
  },
});

export const listCoachInvites = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("coachInvites"),
      email: v.string(),
      clubName: v.union(v.string(), v.null()),
      token: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireSuperUser(ctx);
    const invites = await ctx.db.query("coachInvites").take(500);
    const outstanding = invites.filter((i) => i.redeemedAt === undefined);
    const out = [];
    for (const i of outstanding) {
      const club = await ctx.db.get(i.clubId);
      out.push({
        _id: i._id,
        email: i.email,
        clubName: club?.name ?? null,
        token: i.token,
        createdAt: i.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revokeCoachInvite = mutation({
  args: { inviteId: v.id("coachInvites") },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    await requireSuperUser(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) return null;
    if (invite.redeemedAt !== undefined) {
      throw new Error("That invite has already been accepted.");
    }
    await ctx.db.delete(inviteId);
    return null;
  },
});

// Public: resolve a token to the club it invites into, so the sign-up screen can
// say "You've been invited to coach <Club>". Returns null for an unknown, revoked
// or already-used token. No auth — the token itself is the secret.
export const previewCoachInvite = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({ email: v.string(), clubName: v.string() }),
    v.null(),
  ),
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("coachInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite || invite.redeemedAt !== undefined) return null;
    const club = await ctx.db.get(invite.clubId);
    if (!club) return null;
    return { email: invite.email, clubName: club.name };
  },
});

// Redeem a coach invite for the SIGNED-IN account. Possession of a valid, unused
// token authorises the promotion — so it works regardless of which email they
// signed up with. Single-use: the invite is marked redeemed. A super-user is left
// untouched (they already manage every club).
export const redeemCoachInvite = mutation({
  args: { token: v.string() },
  returns: v.object({ clubName: v.string() }),
  handler: async (ctx, { token }) => {
    const profile = await requireSignedIn(ctx);

    const invite = await ctx.db
      .query("coachInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite || invite.redeemedAt !== undefined) {
      throw new Error("This invite link is invalid or has already been used.");
    }
    const club = await ctx.db.get(invite.clubId);
    if (!club) throw new Error("That club no longer exists.");

    if (profile.role === "SUPER_USER") {
      throw new Error("You're a super-user and already manage every club.");
    }

    await ctx.db.patch(profile._id, { role: "COACH", clubId: invite.clubId });
    await ctx.db.patch(invite._id, {
      redeemedAt: Date.now(),
      redeemedBy: profile._id,
    });
    return { clubName: club.name };
  },
});

// Type export for the admin screen (kept alongside the queries it comes from).
export type ClubId = Id<"clubs">;
