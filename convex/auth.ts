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
    // Step 1.3). Coaches are promoted separately (a super-user assigns them to a
    // club). The SUPER_USER is bootstrapped from an env allow-list — see
    // superUserEmails() — which sidesteps the chicken-and-egg of "no admin exists
    // to appoint the first admin". A matching email is promoted on first sign-in,
    // and also on a later sign-in if they were added to the list after signing up.
    //
    // NOTE: this callback's `ctx` uses the *generic* data model (it can't see our
    // schema's indexes), so we look the profile up with `.filter(...)` rather than
    // `.withIndex("by_authId", ...)`. Typed index access lives in profiles.ts.
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const supers = superUserEmails();
      const existing = await ctx.db
        .query("profiles")
        .filter((q) => q.eq(q.field("authId"), userId))
        .first();
      if (existing) {
        // Promote an already-provisioned account if it was just added to the
        // allow-list; never demote (a super-user removed from the list keeps
        // their role until changed deliberately).
        if (
          existing.role !== "SUPER_USER" &&
          existing.email &&
          supers.has(existing.email.toLowerCase())
        ) {
          await ctx.db.patch(existing._id, { role: "SUPER_USER" });
        }
        return;
      }

      const user = await ctx.db.get(userId);
      const name = (user?.name as string | undefined) || undefined;
      const email = (user?.email as string | undefined) ?? "";
      await ctx.db.insert("profiles", {
        authId: userId,
        name: name || email || "Swimmer",
        email,
        role: supers.has(email.toLowerCase()) ? "SUPER_USER" : "VIEWER",
      });
    },
  },
});

/**
 * The set of emails that are provisioned as SUPER_USER, from the
 * `SUPER_USER_EMAILS` deployment env var (comma-separated, case-insensitive).
 * Whoever controls the deployment controls who is an admin, so the very first
 * super-user needs no pre-existing admin to appoint them.
 */
function superUserEmails(): Set<string> {
  return new Set(
    (process.env.SUPER_USER_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}
