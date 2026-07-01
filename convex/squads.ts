import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCoach } from "./authz";

// Squad management (BRD §5, Step 4). Coaches only. Membership is many-to-many
// via the `squadMemberships` join table — a swimmer can be in several squads.

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Squad name is required.");
  if (trimmed.length > 80) throw new Error("Squad name is too long.");
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
    await requireCoach(ctx);
    return await ctx.db.insert("squads", {
      name: cleanName(args.name),
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
    await requireCoach(ctx);
    const squad = await ctx.db.get(args.squadId);
    if (!squad) throw new Error("Squad not found.");
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
    await requireCoach(ctx);
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
    await requireCoach(ctx);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    const squad = await ctx.db.get(args.squadId);
    if (!squad) throw new Error("Squad not found.");

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
    await requireCoach(ctx);
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
    await requireCoach(ctx);
    const squads = await ctx.db.query("squads").take(500);
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
