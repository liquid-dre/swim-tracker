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

// One-time backfill for the club model (access-control Phase 5). Run ONCE from
// the Convex dashboard after deploying the club-scoping change:
//   admin:backfillDefaultClub   with   {}  (or { "name": "Your Club" })
// It creates (or reuses) a single club and assigns every swimmer and coach that
// has no club to it — so existing data keeps working once coaches may only edit
// their own club's swimmers. Idempotent: re-running only touches still-unassigned
// rows, so it's safe to run again.
export const backfillDefaultClub = internalMutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const clubName = (name ?? "Default Club").trim() || "Default Club";

    const clubs = await ctx.db.query("clubs").take(200);
    const existing = clubs.find((c) => c.name === clubName);
    const clubId =
      existing?._id ??
      (await ctx.db.insert("clubs", { name: clubName, createdAt: Date.now() }));

    let swimmersFixed = 0;
    for (const s of await ctx.db.query("swimmers").take(5000)) {
      if (!s.clubId) {
        await ctx.db.patch(s._id, { clubId });
        swimmersFixed++;
      }
    }

    let coachesFixed = 0;
    const coaches = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "COACH"))
      .take(1000);
    for (const c of coaches) {
      if (!c.clubId) {
        await ctx.db.patch(c._id, { clubId });
        coachesFixed++;
      }
    }

    return { clubName, clubId, swimmersFixed, coachesFixed };
  },
});
