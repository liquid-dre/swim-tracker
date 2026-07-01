import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireCoach } from "./authz";
import { eventLabel } from "../lib/swim";

// The strokes/distances/courses match the shared validators in schema.ts.
type Stroke = "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
type Distance = 50 | 100 | 200 | 400 | 800 | 1500;
type Course = "SCM" | "LCM";

type SeedEvent = {
  distance: Distance;
  stroke: Stroke;
  allowedCourses: Course[];
};

const BOTH: Course[] = ["SCM", "LCM"];
const SCM_ONLY: Course[] = ["SCM"];

// The COMPLETE event whitelist from BRD §4.3. The (distance, stroke) pairs
// here are the only real events; allowedCourses encodes the course notes.
const EVENTS: SeedEvent[] = [
  // 50 — FREE/BACK/BREAST/FLY, SCM + LCM. No 50 IM.
  { distance: 50, stroke: "FREE", allowedCourses: BOTH },
  { distance: 50, stroke: "BACK", allowedCourses: BOTH },
  { distance: 50, stroke: "BREAST", allowedCourses: BOTH },
  { distance: 50, stroke: "FLY", allowedCourses: BOTH },

  // 100 — FREE/BACK/BREAST/FLY SCM + LCM; 100 IM is SCM-only.
  { distance: 100, stroke: "FREE", allowedCourses: BOTH },
  { distance: 100, stroke: "BACK", allowedCourses: BOTH },
  { distance: 100, stroke: "BREAST", allowedCourses: BOTH },
  { distance: 100, stroke: "FLY", allowedCourses: BOTH },
  { distance: 100, stroke: "IM", allowedCourses: SCM_ONLY },

  // 200 — FREE/BACK/BREAST/FLY/IM, SCM + LCM.
  { distance: 200, stroke: "FREE", allowedCourses: BOTH },
  { distance: 200, stroke: "BACK", allowedCourses: BOTH },
  { distance: 200, stroke: "BREAST", allowedCourses: BOTH },
  { distance: 200, stroke: "FLY", allowedCourses: BOTH },
  { distance: 200, stroke: "IM", allowedCourses: BOTH },

  // 400 — FREE and IM only, SCM + LCM.
  { distance: 400, stroke: "FREE", allowedCourses: BOTH },
  { distance: 400, stroke: "IM", allowedCourses: BOTH },

  // 800 — FREE only, SCM + LCM.
  { distance: 800, stroke: "FREE", allowedCourses: BOTH },

  // 1500 — FREE only, SCM + LCM.
  { distance: 1500, stroke: "FREE", allowedCourses: BOTH },
];

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
        allowedCourses: e.allowedCourses,
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
    await requireCoach(ctx);
    // The whitelist is tiny and fixed (§4.3); a bounded read covers it.
    const events = await ctx.db.query("events").take(200);
    return events
      .filter((e) => e.active)
      .map((e) => ({
        _id: e._id,
        distance: e.distance,
        stroke: e.stroke,
        allowedCourses: e.allowedCourses,
        label: e.label,
      }));
  },
});
