import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// Server-side authorization helpers. Every query and mutation authenticates
// through these — access control is never trusted to the client (CLAUDE.md:
// "enforced server-side in every query and mutation").

/** The signed-in user's profile, or null when signed out / not provisioned. */
export async function getProfile(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"profiles"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db
    .query("profiles")
    .withIndex("by_authId", (q) => q.eq("authId", userId))
    .unique();
}

/**
 * Assert the caller is a signed-in COACH and return their profile. Coach-only
 * screens (swimmers, squads, standards, logging) gate every server function on
 * this. VIEWER-scoped access lands in Step 15.
 */
export async function requireCoach(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  if (profile.role !== "COACH") {
    throw new Error("Only coaches can do that.");
  }
  return profile;
}

/**
 * Assert the caller is signed in and MAY see this swimmer, returning their
 * profile. Coaches see everyone; a VIEWER sees only swimmers linked to them via
 * `swimmerAccess` (BRD §5: "viewers are read-only and see only their linked
 * swimmer(s), enforced server-side"). This is the read gate for the swimmer-
 * scoped views a viewer is allowed into (Step 12.5 stroke profile onward); it
 * never widens a viewer's reach and never trusts a client-supplied role.
 */
export async function requireSwimmerAccess(
  ctx: QueryCtx | MutationCtx,
  swimmerId: Id<"swimmers">,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  if (profile.role === "COACH") return profile;

  const link = await ctx.db
    .query("swimmerAccess")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .filter((q) => q.eq(q.field("swimmerId"), swimmerId))
    .first();
  if (link === null) {
    throw new Error("You can only view your own swimmer.");
  }
  return profile;
}

/**
 * The swimmer ids the caller may read: every swimmer for a coach, or just the
 * linked ones for a viewer. Null role-less callers throw. Bounded read — the
 * per-viewer link set is tiny and a club roster is small (§11.1).
 */
export async function accessibleSwimmerIds(
  ctx: QueryCtx | MutationCtx,
): Promise<{ profile: Doc<"profiles">; swimmerIds: Id<"swimmers">[] | "ALL" }> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  if (profile.role === "COACH") return { profile, swimmerIds: "ALL" };

  const links = await ctx.db
    .query("swimmerAccess")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .take(200);
  return { profile, swimmerIds: links.map((l) => l.swimmerId) };
}
