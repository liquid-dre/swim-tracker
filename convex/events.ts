import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireSignedIn } from "./authz";
import { EVENT_WHITELIST, eventLabel } from "../lib/swim";

// The strokes/distances/courses match the shared validators in schema.ts.
type Stroke = "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
type Distance = 25 | 50 | 100 | 200 | 400 | 800 | 1500;
type Course = "SCM" | "LCM";

// The COMPLETE event whitelist from BRD §4.3 — the one copy lives in
// `lib/swim.ts` (`EVENT_WHITELIST`), shared with the meet-programme parser so
// the rules cannot be transcribed twice and drift.
const EVENTS: ReadonlyArray<{
  distance: Distance;
  stroke: Stroke;
  allowedCourses: ReadonlyArray<Course>;
}> = EVENT_WHITELIST;

// Idempotent seed of the event whitelist (BRD §4.3). Run once from the Convex
// dashboard; running it again is a no-op for events that already exist, so it
// never duplicates. Existing rows are left untouched.
export const seedEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let skipped = 0;

    for (const e of EVENTS) {
      // Look up by the (distance, stroke) index — that pair is unique per
      // event in the whitelist.
      const existing = await ctx.db
        .query("events")
        .withIndex("by_distance_stroke", (q) =>
          q.eq("distance", e.distance).eq("stroke", e.stroke),
        )
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("events", {
        distance: e.distance,
        stroke: e.stroke,
        allowedCourses: [...e.allowedCourses],
        label: eventLabel(e.distance, e.stroke),
        active: true,
      });
      inserted++;
    }

    return { inserted, skipped, total: EVENTS.length };
  },
});

// ---------------------------------------------------------------------------
// Client query: the active event whitelist, for building the /log selectors.
// The client derives valid strokes-per-distance and courses-per-event from
// this so nothing off the whitelist (e.g. "50 IM", "100 IM" LCM) is selectable.
// ---------------------------------------------------------------------------

const strokeValidator = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);
const courseValidator = v.union(v.literal("SCM"), v.literal("LCM"));
const distanceValidator = v.union(
  v.literal(25),
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);

export const listActiveEvents = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("events"),
      distance: distanceValidator,
      stroke: strokeValidator,
      allowedCourses: v.array(courseValidator),
      label: v.string(),
    }),
  ),
  handler: async (ctx) => {
    // Both roles: the whitelist is non-sensitive reference data, and a viewer's
    // own progression picker needs it. Still requires a signed-in caller.
    await requireSignedIn(ctx);
    // The whitelist is tiny and fixed (§4.3); a bounded read covers it.
    const events = await ctx.db.query("events").take(200);
    return events
      .filter((e) => e.active)
      .map((e) => ({
        _id: e._id,
        distance: e.distance,
        stroke: e.stroke,
        allowedCourses: [...e.allowedCourses],
        label: e.label,
      }));
  },
});
