import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { assertCoachManagesSwimmer, requireCoach, requireStaff } from "./authz";

// Squad management (BRD §5, Step 4). Coaches only. Membership is many-to-many
// via the `squadMemberships` join table — a swimmer can be in several squads.
// A squad belongs to a club (`squads.clubId`): a coach reads and edits only
// their own club's squads; the Admin, every club's.

/** Whether staff `profile` may see / manage `squad` — the squad's club rule. */
export function ownsSquad(profile: Doc<"profiles">, squad: Doc<"squads">): boolean {
  if (profile.role === "SUPER_USER") return true;
  return profile.clubId != null && squad.clubId === profile.clubId;
}

function assertOwnsSquad(profile: Doc<"profiles">, squad: Doc<"squads">): void {
  if (!ownsSquad(profile, squad)) {
    throw new ConvexError("You can only manage your own club's squads.");
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new ConvexError("Squad name is required.");
  if (trimmed.length > 80) throw new ConvexError("Squad name is too long.");
  return trimmed;
}

function cleanDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const trimmed = description.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createSquad = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  returns: v.id("squads"),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    return await ctx.db.insert("squads", {
      name: cleanName(args.name),
      // A coach's squad belongs to their club; the Admin's stays unassigned
      // until given one in Admin › Unassigned.
      ...(profile.clubId ? { clubId: profile.clubId } : {}),
      description: cleanDescription(args.description),
    });
  },
});

export const updateSquad = mutation({
  args: {
    squadId: v.id("squads"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const squad = await ctx.db.get(args.squadId);
    if (!squad) throw new ConvexError("Squad not found.");
    assertOwnsSquad(profile, squad);
    const patch: Partial<{ name: string; description: string | undefined }> = {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.description !== undefined)
      patch.description = cleanDescription(args.description);
    await ctx.db.patch(args.squadId, patch);
    return null;
  },
});

export const deleteSquad = mutation({
  args: { squadId: v.id("squads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const squad = await ctx.db.get(args.squadId);
    if (!squad) return null; // already gone
    assertOwnsSquad(profile, squad);
    // Remove the squad and its membership rows (swimmers themselves are kept).
    const memberships = await ctx.db
      .query("squadMemberships")
      .withIndex("by_squad", (q) => q.eq("squadId", args.squadId))
      .take(1000);
    for (const m of memberships) await ctx.db.delete(m._id);
    await ctx.db.delete(args.squadId);
    return null;
  },
});

export const addToSquad = mutation({
  args: { swimmerId: v.id("swimmers"), squadId: v.id("squads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);
    const squad = await ctx.db.get(args.squadId);
    if (!squad) throw new ConvexError("Squad not found.");
    assertOwnsSquad(profile, squad);

    // Idempotent: don't create a duplicate membership.
    const existing = await ctx.db
      .query("squadMemberships")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId))
      .collect();
    if (existing.some((m) => m.squadId === args.squadId)) return null;

    await ctx.db.insert("squadMemberships", {
      swimmerId: args.swimmerId,
      squadId: args.squadId,
    });
    return null;
  },
});

export const removeFromSquad = mutation({
  args: { swimmerId: v.id("swimmers"), squadId: v.id("squads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);
    const memberships = await ctx.db
      .query("squadMemberships")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId))
      .collect();
    for (const m of memberships) {
      if (m.squadId === args.squadId) await ctx.db.delete(m._id);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listSquads = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("squads"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.optional(v.string()),
      memberCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await requireStaff(ctx);
    // A coach's own club's squads; the Admin, every club's.
    const squads =
      profile.role === "SUPER_USER"
        ? await ctx.db.query("squads").take(500)
        : profile.clubId == null
          ? []
          : await ctx.db
              .query("squads")
              .withIndex("by_club", (q) => q.eq("clubId", profile.clubId))
              .take(500);
    squads.sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(
      squads.map(async (squad) => {
        const members = await ctx.db
          .query("squadMemberships")
          .withIndex("by_squad", (q) => q.eq("squadId", squad._id))
          .take(1000);
        return {
          _id: squad._id,
          _creationTime: squad._creationTime,
          name: squad.name,
          description: squad.description,
          memberCount: members.length,
        };
      }),
    );
  },
});
