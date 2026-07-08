import { ConvexError, v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireSignedIn, requireSuperUser } from "./authz";
import { rollingSeasonStart } from "../lib/swim";

// Coach app settings (BRD §5.12, Step 13). A single club-wide singleton row in
// the `settings` table, found/upserted by the stable key "app". Today it carries
// only the season start that the season-improvement ranking uses; more app-wide
// preferences can hang off the same row later. Coach-only — viewers have no
// settings surface (§5.9).

const SINGLETON_KEY = "app";

/** Read the singleton settings row (creating nothing). Null when never set. */
async function readSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .unique();
}

/**
 * Validate a coach-entered season start. Must be a real ISO "YYYY-MM-DD" date
 * and not in the future (a season can't start after today). Returns the cleaned
 * string; throws with a plain message on anything else.
 */
function cleanSeasonDate(
  value: string,
  opts: { allowFuture: boolean; label: string },
): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ConvexError(`${opts.label} must be a date in YYYY-MM-DD form.`);
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new ConvexError("That is not a real date.");
  }
  // A season START can't be in the future (you can't rank an unstarted season);
  // a season END legitimately can (the season runs until a date still to come).
  if (!opts.allowFuture) {
    const today = new Date().toISOString().slice(0, 10);
    if (trimmed > today) {
      throw new ConvexError(`${opts.label} cannot be in the future.`);
    }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// getAppSettings — the raw setting plus the RESOLVED season window
// ---------------------------------------------------------------------------
//
// `seasonStart` is what the coach explicitly set (null when unset). `effective`
// is the season start every ranking actually uses: the custom value if present,
// otherwise the default rolling 12-month window. `source` lets the editor show
// which one is live without re-deriving the default on the client.
export const getAppSettings = query({
  args: {},
  returns: v.object({
    seasonStart: v.union(v.string(), v.null()),
    seasonEnd: v.union(v.string(), v.null()),
    effectiveSeasonStart: v.string(),
    source: v.union(v.literal("custom"), v.literal("rolling")),
  }),
  handler: async (ctx) => {
    // Season dates are public reference data (docs/access-control.md): every
    // signed-in user reads them (rankings, season views); only the super-user
    // sets them.
    await requireSignedIn(ctx);
    const row = await readSettings(ctx);
    const seasonStart = row?.seasonStart ?? null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      seasonStart,
      seasonEnd: row?.seasonEnd ?? null,
      effectiveSeasonStart: seasonStart ?? rollingSeasonStart(today),
      source: seasonStart ? ("custom" as const) : ("rolling" as const),
    };
  },
});

// ---------------------------------------------------------------------------
// setSeasonStart — set or clear the custom season start
// ---------------------------------------------------------------------------
//
// A string sets an explicit season start; `null` clears it so the ranking falls
// back to the rolling 12-month default. Idempotent upsert of the singleton row.
export const setSeasonStart = mutation({
  args: { seasonStart: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { seasonStart }) => {
    await requireSuperUser(ctx);

    const cleaned =
      seasonStart === null
        ? undefined
        : cleanSeasonDate(seasonStart, { allowFuture: false, label: "Season start" });
    const row = await readSettings(ctx);
    if (row) {
      await ctx.db.patch(row._id, { seasonStart: cleaned });
    } else {
      await ctx.db.insert("settings", { key: SINGLETON_KEY, seasonStart: cleaned });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// setSeasonEnd — set or clear the season END date (super-user only)
// ---------------------------------------------------------------------------
//
// A string sets an explicit season end; `null` clears it (open-ended). Validated
// the same way as the start, and required to be on or after the season start
// when both are set — a season can't end before it begins.
export const setSeasonEnd = mutation({
  args: { seasonEnd: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { seasonEnd }) => {
    await requireSuperUser(ctx);

    const cleaned =
      seasonEnd === null
        ? undefined
        : cleanSeasonDate(seasonEnd, { allowFuture: true, label: "Season end" });
    const row = await readSettings(ctx);
    if (cleaned !== undefined && row?.seasonStart && cleaned < row.seasonStart) {
      throw new ConvexError("Season end can't be before the season start.");
    }
    if (row) {
      await ctx.db.patch(row._id, { seasonEnd: cleaned });
    } else {
      await ctx.db.insert("settings", { key: SINGLETON_KEY, seasonEnd: cleaned });
    }
    return null;
  },
});
