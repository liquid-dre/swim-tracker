import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Shared domain validators (BRD §4, §7). Keep these as the single source of
// truth for the enumerations so every table and function stays in lock-step.
const stroke = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);
const course = v.union(v.literal("SCM"), v.literal("LCM"));
const distance = v.union(
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const swimType = v.union(
  v.literal("MEET"),
  v.literal("TIME_TRIAL"),
  v.literal("PRACTICE"),
);

// STEP 2 SCOPE: the COMPLETE data model from BRD §7 (profiles, swimmers,
// squads, squadMemberships, swimmerAccess, events, standards, results).
export default defineSchema({
  // Identity tables provided by Convex Auth (users, sessions, accounts, …).
  ...authTables,

  // App users beyond the auth table; the auth provider supplies identity.
  profiles: defineTable({
    authId: v.string(), // subject from auth provider (the users-table id)
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("COACH"), v.literal("VIEWER")),
  }).index("by_authId", ["authId"]),

  swimmers: defineTable({
    name: v.string(),
    dob: v.string(), // ISO date
    gender: v.union(v.literal("M"), v.literal("F")),
    active: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_active", ["active"]),

  squads: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
  }),

  squadMemberships: defineTable({
    swimmerId: v.id("swimmers"),
    squadId: v.id("squads"),
  })
    .index("by_squad", ["squadId"])
    .index("by_swimmer", ["swimmerId"]),

  // Which viewer account may see which swimmer(s).
  swimmerAccess: defineTable({
    profileId: v.id("profiles"), // a VIEWER profile
    swimmerId: v.id("swimmers"),
  })
    .index("by_profile", ["profileId"])
    .index("by_swimmer", ["swimmerId"]),

  // Editable event whitelist (seeded from §4.3).
  events: defineTable({
    distance,
    stroke,
    allowedCourses: v.array(course), // e.g. 100 IM => ["SCM"]
    label: v.string(), // "100 IM"
    active: v.boolean(),
  }).index("by_distance_stroke", ["distance", "stroke"]),

  // Qualifying cuts, seeded from the coach's cleaned CSV (§4.9).
  // One row per (tier, gender, distance, stroke, exact age). LCM implied.
  // Sparse: only rows that actually have a cut exist. No row => no line.
  standards: defineTable({
    tier: v.union(
      v.literal("LEVEL_2"),
      v.literal("LEVEL_3"),
      v.literal("SANJ"),
    ),
    gender: v.union(v.literal("M"), v.literal("F")),
    distance,
    stroke,
    // Exact age the cut applies to. Catch-alls use a bound + isCatchAll:
    // e.g. "10&U" => age 10, isCatchAllYoung true (applies to <=10).
    // "17-19" => age 17, isCatchAllOld true (applies to >=17).
    age: v.number(),
    isCatchAllYoung: v.boolean(),
    isCatchAllOld: v.boolean(),
    timeMs: v.number(), // the cut, in integer ms
  })
    .index("by_lookup", ["gender", "distance", "stroke", "tier"])
    .index("by_event", ["gender", "distance", "stroke"]),

  results: defineTable({
    swimmerId: v.id("swimmers"),
    distance,
    stroke,
    course,
    timeMs: v.number(), // integer milliseconds
    swimType,
    swimDate: v.string(), // ISO date
    ageAtSwim: v.number(), // computed from dob + swimDate
    meetName: v.optional(v.string()),
    venue: v.optional(v.string()),
    notes: v.optional(v.string()),
    enteredBy: v.id("profiles"),
    createdAt: v.number(),
  })
    .index("by_swimmer", ["swimmerId"])
    .index("by_event", ["swimmerId", "distance", "stroke", "course"])
    .index("by_event_global", ["distance", "stroke", "course"])
    .index("by_date", ["swimDate"]),
});
