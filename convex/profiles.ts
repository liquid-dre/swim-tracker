import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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
