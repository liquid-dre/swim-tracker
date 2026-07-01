import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
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
