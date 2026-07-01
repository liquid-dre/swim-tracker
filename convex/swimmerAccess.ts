import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./authz";

// Viewer ↔ swimmer linkage (BRD §2, §5.9, Step 15). A coach grants a viewer
// account read access to one or more swimmers; every viewer-facing read then
// scopes to exactly this link set (see authz.ts). Coach-only, enforced
// server-side — a viewer can never link, unlink, or list links.
//
// A link references a `profiles` row by id, so the viewer must already have an
// account (they've signed up at least once). We look them up by the email they
// signed up with, normalised the same way auth stores it (lower-cased, trimmed).

// ---------------------------------------------------------------------------
// linkViewer — grant a viewer account access to one swimmer (idempotent)
// ---------------------------------------------------------------------------

export const linkViewer = mutation({
  args: { viewerEmail: v.string(), swimmerId: v.id("swimmers") },
  returns: v.object({
    profileId: v.id("profiles"),
    name: v.string(),
    email: v.string(),
    alreadyLinked: v.boolean(),
  }),
  handler: async (ctx, { viewerEmail, swimmerId }) => {
    await requireCoach(ctx);

    const swimmer = await ctx.db.get(swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");

    const email = viewerEmail.trim().toLowerCase();
    if (email === "") throw new Error("Enter the viewer's email.");

    // The account must exist first — a link points at a real profile row.
    const profile = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("email"), email))
      .unique();
    if (!profile) {
      throw new Error(
        "No account uses that email yet. Ask them to sign up first, then link.",
      );
    }
    // A coach already sees every swimmer; linking one would be meaningless and
    // would wrongly imply a scoped, read-only relationship.
    if (profile.role === "COACH") {
      throw new Error("That account is a coach and already sees every swimmer.");
    }

    // Idempotent: one link per (viewer, swimmer). Re-linking is a no-op.
    const existing = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (existing) {
      return {
        profileId: profile._id,
        name: profile.name,
        email: profile.email,
        alreadyLinked: true,
      };
    }

    await ctx.db.insert("swimmerAccess", { profileId: profile._id, swimmerId });
    return {
      profileId: profile._id,
      name: profile.name,
      email: profile.email,
      alreadyLinked: false,
    };
  },
});

// ---------------------------------------------------------------------------
// unlinkViewer — revoke a viewer's access to one swimmer (idempotent)
// ---------------------------------------------------------------------------

export const unlinkViewer = mutation({
  args: { profileId: v.id("profiles"), swimmerId: v.id("swimmers") },
  returns: v.null(),
  handler: async (ctx, { profileId, swimmerId }) => {
    await requireCoach(ctx);
    const link = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
      .first();
    if (link) await ctx.db.delete(link._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// listSwimmerViewers — the viewer accounts linked to one swimmer (coach editor)
// ---------------------------------------------------------------------------

export const listSwimmerViewers = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.array(
    v.object({
      profileId: v.id("profiles"),
      name: v.string(),
      email: v.string(),
    }),
  ),
  handler: async (ctx, { swimmerId }) => {
    await requireCoach(ctx);
    const links = await ctx.db
      .query("swimmerAccess")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
      .take(200);

    const viewers = await Promise.all(
      links.map(async (link) => {
        const profile = await ctx.db.get(link.profileId);
        return profile
          ? {
              profileId: profile._id,
              name: profile.name,
              email: profile.email,
            }
          : null;
      }),
    );
    return viewers
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
