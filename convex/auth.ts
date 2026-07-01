import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Email + password. We capture `name` from the sign-up form (in addition
    // to the default `email`) so we can seed the profile with it.
    Password({
      profile(params) {
        // `name` is always a string here (never optional) — a Convex value can't
        // be `undefined`. The sign-up form provides it; other flows fall back to "".
        const email = (params.email as string).trim().toLowerCase();
        const name = ((params.name as string | undefined) ?? "").trim();
        return { email, name };
      },
    }),
  ],
  callbacks: {
    // Runs after the auth user row is created or updated. On first sign-in we
    // create the matching profile, defaulting the role to VIEWER (BRD §7 /
    // Step 1.3). Coaches are promoted separately via admin tooling.
    //
    // NOTE: this callback's `ctx` uses the *generic* data model (it can't see our
    // schema's indexes), so we look the profile up with `.filter(...)` rather than
    // `.withIndex("by_authId", ...)`. Typed index access lives in profiles.ts.
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const existing = await ctx.db
        .query("profiles")
        .filter((q) => q.eq(q.field("authId"), userId))
        .first();
      if (existing) return;

      const user = await ctx.db.get(userId);
      const name = (user?.name as string | undefined) || undefined;
      const email = (user?.email as string | undefined) ?? "";
      await ctx.db.insert("profiles", {
        authId: userId,
        name: name || email || "Swimmer",
        email,
        role: "VIEWER",
      });
    },
  },
});
