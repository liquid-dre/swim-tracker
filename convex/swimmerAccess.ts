import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertCoachManagesSwimmer, requireCoach } from "./authz";

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
 */
export async function grantSwimmerAccess(
  ctx: MutationCtx,
  swimmerId: Id<"swimmers">,
  rawEmail: string,
): Promise<"linked" | "pending" | "coach" | "skipped"> {
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
    if (!existing) {
      await ctx.db.insert("swimmerAccess", { profileId: profile._id, swimmerId });
    }
    return "linked";
  }

  // No account yet — pre-authorise by email (dedupe on email + swimmer).
  const pending = await ctx.db
    .query("pendingSwimmerAccess")
    .withIndex("by_email", (q) => q.eq("email", email))
    .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
    .first();
  if (!pending) {
    await ctx.db.insert("pendingSwimmerAccess", { email, swimmerId });
  }
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

    const status = await grantSwimmerAccess(ctx, swimmerId, email);
    if (status === "coach") {
      throw new Error(
        "That account is a coach or admin and already sees every swimmer.",
      );
    }
    if (status === "skipped") throw new Error("Enter the viewer's email.");
    return { status, email };
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
    if (link) await ctx.db.delete(link._id);
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
