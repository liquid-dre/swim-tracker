import { ConvexError } from "convex/values";
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
      // The provider's default throws a PLAIN Error for a short password, which
      // production redacts — the sign-up form then had nothing to show but its
      // "email may already be in use" fallback, misleading every user whose
      // password was simply too short. A ConvexError's message survives to the
      // client verbatim.
      validatePasswordRequirements(password) {
        if (!password || password.length < 8) {
          throw new ConvexError("Password must be at least 8 characters.");
        }
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

      let profileId;
      let email: string;
      let profileName: string; // display name, used to attribute a CLAIMED event
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
        profileId = existing._id;
        email = existing.email ?? "";
        profileName = existing.name;
      } else {
        const user = await ctx.db.get(userId);
        const name = (user?.name as string | undefined) || undefined;
        // Stored normalised — every email lookup (profiles.by_email, pending
        // access claims) compares trimmed lowercase.
        email = ((user?.email as string | undefined) ?? "").trim().toLowerCase();
        profileName = name || email || "Swimmer";
        profileId = await ctx.db.insert("profiles", {
          authId: userId,
          name: profileName,
          email,
          role: supers.has(email) ? "SUPER_USER" : "VIEWER",
        });
      }

      // Claim any viewer access a coach pre-authorised for this email before the
      // account existed (Phase 6): turn each pending grant into a real link, then
      // clear it. Uses `.filter` (not `.withIndex`) because this callback's ctx
      // uses the generic data model. Idempotent — safe on every sign-in.
      const normalized = email.trim().toLowerCase();
      if (normalized !== "") {
        const pendings = await ctx.db
          .query("pendingSwimmerAccess")
          .filter((q) => q.eq(q.field("email"), normalized))
          .collect();
        for (const p of pendings) {
          const already = await ctx.db
            .query("swimmerAccess")
            .filter((q) =>
              q.and(
                q.eq(q.field("profileId"), profileId),
                q.eq(q.field("swimmerId"), p.swimmerId),
              ),
            )
            .first();
          if (!already) {
            await ctx.db.insert("swimmerAccess", {
              profileId,
              swimmerId: p.swimmerId,
            });
            // Audit trail (§R17): the viewer just CLAIMED this pre-authorised
            // invite. The inviting coach (stored on the pending row) is the
            // approver. Inlined because this callback's generic ctx can't import
            // the typed helper's index types; the shape matches accessEvents.
            await ctx.db.insert("accessEvents", {
              type: "CLAIMED",
              swimmerId: p.swimmerId,
              at: Date.now(),
              viewerEmail: normalized,
              viewerProfileId: profileId,
              viewerName: profileName || undefined,
              actorProfileId: profileId, // the viewer performed the claim
              actorName: profileName || undefined,
              actorRole: "VIEWER",
              approverProfileId: p.invitedByProfileId,
              approverName: p.invitedByName,
            });
          }
          await ctx.db.delete(p._id);
        }
      }
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
