import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireSignedIn } from "./authz";

// Returns the signed-in user's profile, or null when signed out / not yet
// provisioned. Powers `useCurrentProfile()` (Step 1.5).
export const getCurrentProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    return await ctx.db
      .query("profiles")
      .withIndex("by_authId", (q) => q.eq("authId", userId))
      .unique();
  },
});

// Stamp this visit and return the PREVIOUS one — the anchor for the "since
// you were last here" digest. A mutation (not a query side-effect) called
// once per dashboard mount; the client holds the returned value in state so
// the reactive dashboard query keeps a stable window for the whole visit.
export const beginSession = mutation({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const profile = await requireSignedIn(ctx);
    const previous = profile.lastSeenAt ?? null;
    await ctx.db.patch(profile._id, { lastSeenAt: Date.now() });
    return previous;
  },
});
