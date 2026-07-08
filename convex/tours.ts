import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireSignedIn, requireSuperUser } from "./authz";
import type { Tier, TourDateByTier } from "../lib/swim";

/*
  Tour dates (docs/access-control.md): global reference data the SUPER_USER
  maintains and every role reads. One date per tier. When a tier has a date,
  qualifying surfaces judge swimmers against the cut for the age they will be
  on tour day; without one, behaviour is unchanged (age as swum, §4.9).
*/

const tierValidator = v.union(
  v.literal("LEVEL_2"),
  v.literal("LEVEL_3"),
  v.literal("SANJ"),
);

const NAME_MAX = 80;

/** Validate a super-user-entered tour date (future dates are the norm). */
function cleanTourDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ConvexError("Tour date must be a date in YYYY-MM-DD form.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new ConvexError("That is not a real date.");
  }
  return trimmed;
}

/** Shared loader for the analysis queries: tier → tour date (absent = unset). */
export async function loadTourDates(
  ctx: QueryCtx | MutationCtx,
): Promise<TourDateByTier> {
  const rows = await ctx.db.query("tours").take(10);
  const byTier: TourDateByTier = {};
  for (const row of rows) byTier[row.tier as Tier] = row.date;
  return byTier;
}

export const listTours = query({
  args: {},
  returns: v.array(
    v.object({
      tier: tierValidator,
      date: v.string(),
      name: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    // Reference data: coaches and viewers alike read it (a viewer's Road
    // screen explains resolution with it), but only a super-user writes.
    await requireSignedIn(ctx);
    const rows = await ctx.db.query("tours").take(10);
    return rows.map((r) => ({ tier: r.tier, date: r.date, name: r.name ?? null }));
  },
});

export const setTour = mutation({
  args: {
    tier: tierValidator,
    date: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);

    const date = cleanTourDate(args.date);
    const name = args.name?.trim() || undefined;
    if (name && name.length > NAME_MAX) {
      throw new ConvexError("Tour name is too long.");
    }

    const existing = await ctx.db
      .query("tours")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { date, name });
    } else {
      await ctx.db.insert("tours", { tier: args.tier, date, name });
    }
    return null;
  },
});

export const clearTour = mutation({
  args: { tier: tierValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperUser(ctx);
    const existing = await ctx.db
      .query("tours")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
