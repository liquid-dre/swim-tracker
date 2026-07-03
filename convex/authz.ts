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
 * Assert the caller is signed in and return their profile (either role). Use for
 * server functions that expose NON-swimmer-scoped, non-sensitive reference data
 * both roles legitimately need — e.g. the event whitelist that powers a viewer's
 * own progression picker. Never use this where the payload is swimmer-scoped or a
 * write; those go through `requireSwimmerAccess` / `requireCoach`.
 */
export async function requireSignedIn(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  return profile;
}

/**
 * Assert the caller has STAFF (coach-level) access and return their profile.
 * Coach screens (swimmers, squads, logging, cross-roster analysis) gate on this.
 * A SUPER_USER is a superset of a coach, so they pass too; a VIEWER is rejected
 * server-side (BRD §2) — the client never gets to decide. Club-scoped editing
 * (a coach only edits their own club) is layered on top in Phase 5; this gate is
 * the coarse "is this a staff member at all" check.
 */
export async function requireCoach(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  if (profile.role === "VIEWER") {
    throw new Error("Only coaches can do that.");
  }
  return profile;
}

/**
 * Assert the caller is the SUPER_USER and return their profile. Gates global
 * reference data that only the system owner may change: qualifying standards,
 * season start/end dates, and club / coach administration (docs/access-control.md).
 * Coaches and viewers can READ these, but only a super-user may write them.
 */
export async function requireSuperUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (profile === null) {
    throw new Error("You are not signed in.");
  }
  if (profile.role !== "SUPER_USER") {
    throw new Error("Only the super-user can do that.");
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
  if (profile.role !== "VIEWER") return profile; // coach / super-user

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
 * Assert the caller MAY see EVERY swimmer in `swimmerIds`, returning their
 * profile. Coaches pass unconditionally; a VIEWER must be linked to all of them,
 * or the whole call is rejected — a group read can never smuggle in one swimmer
 * the viewer isn't linked to (the progression chart's multi-select gate). The
 * empty set is allowed (nothing to authorise).
 */
export async function requireSwimmersAccess(
  ctx: QueryCtx | MutationCtx,
  swimmerIds: Id<"swimmers">[],
): Promise<Doc<"profiles">> {
  const profile = await requireSignedIn(ctx);
  if (profile.role !== "VIEWER") return profile; // coach / super-user

  const links = await ctx.db
    .query("swimmerAccess")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .take(200);
  const allowed = new Set(links.map((l) => l.swimmerId));
  for (const id of swimmerIds) {
    if (!allowed.has(id)) {
      throw new Error("You can only view your own swimmer.");
    }
  }
  return profile;
}

/** How much of a given swimmer the caller may see (docs/access-control.md). */
export type SwimmerView = "full" | "sensitive" | "public";

/**
 * A per-request resolver for the caller's view of EACH swimmer. `viewOf` returns:
 *   - "full"      — sensitive fields (DOB, notes, height/weight) AND projections.
 *                   A COACH today (Phase 5 narrows this to the coach's own club;
 *                   Phase 4 adds the SUPER_USER).
 *   - "sensitive" — sensitive fields but NOT projections. A VIEWER linked to this
 *                   swimmer (their own child).
 *   - "public"    — name, age band, times/history only. Everyone else.
 *
 * Any signed-in user may call the queries that use this — the payload, not the
 * gate, is what protects sensitive data. The viewer's link set is read once so a
 * list query stays a single extra read regardless of how many swimmers it spans.
 */
export async function swimmerViewer(ctx: QueryCtx | MutationCtx): Promise<{
  profile: Doc<"profiles">;
  viewOf: (swimmer: Doc<"swimmers">) => SwimmerView;
}> {
  const profile = await requireSignedIn(ctx);
  if (profile.role !== "VIEWER") {
    // Coach or super-user: full view of every swimmer. Phase 5 narrows a coach
    // to their own club; a super-user keeps the unrestricted view.
    return { profile, viewOf: () => "full" };
  }
  const links = await ctx.db
    .query("swimmerAccess")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .take(200);
  const linked = new Set(links.map((l) => l.swimmerId));
  return {
    profile,
    viewOf: (swimmer) => (linked.has(swimmer._id) ? "sensitive" : "public"),
  };
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
  if (profile.role !== "VIEWER") return { profile, swimmerIds: "ALL" }; // staff

  const links = await ctx.db
    .query("swimmerAccess")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .take(200);
  return { profile, swimmerIds: links.map((l) => l.swimmerId) };
}
