import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// TEMPORARY admin tooling (Step 1.4). Call from the Convex dashboard to create
// the first coach:  admin:promoteToCoach  with  { "email": "you@example.com" }.
// Not wired to any UI. Role management proper arrives with Step 15.
export const promoteToCoach = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    const profile = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("email"), normalized))
      .unique();

    if (!profile) {
      throw new Error(`No profile found for email "${normalized}".`);
    }

    await ctx.db.patch(profile._id, { role: "COACH" });
    return { profileId: profile._id, name: profile.name, role: "COACH" as const };
  },
});
