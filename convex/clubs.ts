import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCoach, requireSuperUser } from "./authz";

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

// Type export for the admin screen (kept alongside the queries it comes from).
export type ClubId = Id<"clubs">;
