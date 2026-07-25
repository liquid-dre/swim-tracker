import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { dedupeSwimmerIds } from "./attendanceLib";

// Shared server helpers for session attendance (§R18). Ctx-bound, so they live in
// convex/ rather than the pure attendanceLib. No registered functions here.

/**
 * Assert `profile` (already known to be staff) may MANAGE sessions/patterns for
 * `clubId` — the session equivalent of assertCoachManagesSwimmer. A SUPER_USER
 * with no club of their own is treated as unassigned (this feature is coach-owned,
 * per §R18), so they must belong to the club like any coach.
 */
export function assertManagesClub(
  profile: Doc<"profiles">,
  clubId: Id<"clubs">,
): void {
  if (!profile.clubId) {
    throw new ConvexError(
      "You aren't assigned to a club yet. Ask an admin to add you to one.",
    );
  }
  if (profile.role !== "SUPER_USER" && profile.role !== "COACH") {
    throw new ConvexError("Only coaches can do that.");
  }
  if (clubId !== profile.clubId) {
    throw new ConvexError("You can only manage your own club's sessions.");
  }
}

/**
 * The active swimmer ids on a session's roster: the UNION of the live membership
 * of every target squad, de-duplicated (a swimmer in two target squads appears
 * once), with inactive swimmers excluded (§R18). Order is by squad then insertion.
 */
export async function rosterSwimmerIds(
  ctx: QueryCtx | MutationCtx,
  squadIds: Id<"squads">[],
): Promise<Id<"swimmers">[]> {
  const lists: Id<"swimmers">[][] = [];
  for (const squadId of squadIds) {
    const memberships = await ctx.db
      .query("squadMemberships")
      .withIndex("by_squad", (q) => q.eq("squadId", squadId))
      .take(500);
    lists.push(memberships.map((m) => m.swimmerId));
  }
  const unioned = dedupeSwimmerIds(lists.map((l) => l.map(String)));
  // Re-map the string union back to swimmer ids, then keep only active swimmers.
  const ids = unioned as unknown as Id<"swimmers">[];
  const active: Id<"swimmers">[] = [];
  for (const id of ids) {
    const swimmer = await ctx.db.get(id);
    if (swimmer && swimmer.active) active.push(id);
  }
  return active;
}

/** Roster as full swimmer docs (active only), sorted by name for stable display. */
export async function rosterSwimmers(
  ctx: QueryCtx | MutationCtx,
  squadIds: Id<"squads">[],
): Promise<Doc<"swimmers">[]> {
  const ids = await rosterSwimmerIds(ctx, squadIds);
  const swimmers: Doc<"swimmers">[] = [];
  for (const id of ids) {
    const swimmer = await ctx.db.get(id);
    if (swimmer) swimmers.push(swimmer);
  }
  swimmers.sort((a, b) => a.name.localeCompare(b.name));
  return swimmers;
}

/** All attendance rows for a session, keyed by swimmerId for O(1) lookup. */
export async function attendanceBySwimmer(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"sessions">,
): Promise<Map<Id<"swimmers">, Doc<"attendance">>> {
  const rows = await ctx.db
    .query("attendance")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(1000);
  const map = new Map<Id<"swimmers">, Doc<"attendance">>();
  for (const row of rows) map.set(row.swimmerId, row);
  return map;
}
