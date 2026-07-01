import { internalMutation } from "./_generated/server";

// The strokes/distances/courses match the shared validators in schema.ts.
type Stroke = "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
type Distance = 50 | 100 | 200 | 400 | 800 | 1500;
type Course = "SCM" | "LCM";

// Human label for a stroke, per BRD (§4.3): "Free", "Back", "Breast",
// "Fly", "IM". Used to build event labels like "100 IM" / "800 Free".
const STROKE_LABEL: Record<Stroke, string> = {
  FREE: "Free",
  BACK: "Back",
  BREAST: "Breast",
  FLY: "Fly",
  IM: "IM",
};

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

function eventLabel(distance: Distance, stroke: Stroke): string {
  return `${distance} ${STROKE_LABEL[stroke]}`;
}

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
