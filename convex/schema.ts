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
  v.literal(25),
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
  // Parent-entered school-gala time (§R15): UNOFFICIAL — never counts toward a
  // headline PB or any qualifying surface; shows only in progression + history.
  v.literal("SCHOOL_GALA"),
);

// The data model from BRD §7 (profiles, swimmers, squads, squadMemberships,
// swimmerAccess, events, standards, results), extended with the multi-club,
// role-based access model in docs/access-control.md: a SUPER_USER over global
// reference data, club-scoped coach editing, and field-level swimmer privacy.
// All access-model columns are OPTIONAL so the extension is backward-compatible
// with rows created before it (Convex validates existing docs on push).
export default defineSchema({
  // Identity tables provided by Convex Auth (users, sessions, accounts, …).
  ...authTables,

  // A club owns swimmers and is the edit boundary for coaches. Created by the
  // SUPER_USER, who also assigns each coach to one via profiles.clubId.
  clubs: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }),

  // App users beyond the auth table; the auth provider supplies identity.
  profiles: defineTable({
    authId: v.string(), // subject from auth provider (the users-table id)
    name: v.string(),
    email: v.string(),
    // SUPER_USER: global reference data (standards, season dates, clubs) + sees
    // everything. COACH: edits their own club's swimmers, reads all as public.
    // VIEWER: read-only; sensitive view only for their linked swimmer(s).
    role: v.union(
      v.literal("SUPER_USER"),
      v.literal("COACH"),
      v.literal("VIEWER"),
    ),
    // The club a COACH manages (their edit scope). Unset for SUPER_USER/VIEWER.
    clubId: v.optional(v.id("clubs")),
  })
    .index("by_authId", ["authId"])
    .index("by_club", ["clubId"]),

  swimmers: defineTable({
    name: v.string(),
    dob: v.string(), // ISO date — SENSITIVE (own-club coach + linked viewer only)
    gender: v.union(v.literal("M"), v.literal("F")),
    active: v.boolean(),
    notes: v.optional(v.string()), // coach notes — SENSITIVE
    // The owning club: the edit boundary. A coach may edit this swimmer only when
    // their profiles.clubId matches. Unset => legacy/unassigned (super-user only).
    clubId: v.optional(v.id("clubs")),
    heightCm: v.optional(v.number()), // SENSITIVE personal info
    weightKg: v.optional(v.number()), // SENSITIVE personal info
    createdAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_club", ["clubId"]),

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

  // Coach invites (access-control P0). A super-user issues a single-use, token-
  // gated invite binding a future coach to a club. When the invitee signs up (or
  // signs in) carrying the token, `redeemCoachInvite` sets their role to COACH and
  // their clubId in one atomic step — so coach-hood is impossible without a super-
  // user pre-authorising it, and unguessable rather than keyed on a spoofable
  // email. Marked redeemed (not deleted) so the admin screen can show acceptance.
  coachInvites: defineTable({
    email: v.string(), // intended coach, normalised — display/audit only
    clubId: v.id("clubs"),
    token: v.string(), // unguessable, single-use
    createdAt: v.number(),
    createdBy: v.id("profiles"),
    redeemedAt: v.optional(v.number()),
    redeemedBy: v.optional(v.id("profiles")),
  })
    .index("by_token", ["token"])
    .index("by_club", ["clubId"]),

  // Self-service viewer access requests (access-control P2). A signed-in viewer
  // who has found their swimmer asks the owning club's coach for read access; the
  // coach approves (→ a real swimmerAccess row) or denies. Pending only: the row
  // is deleted on either decision.
  swimmerAccessRequests: defineTable({
    profileId: v.id("profiles"), // the VIEWER asking
    swimmerId: v.id("swimmers"),
    createdAt: v.number(),
  })
    .index("by_swimmer", ["swimmerId"])
    .index("by_profile", ["profileId"]),

  // Viewer access PRE-AUTHORISED by email before the account exists (Phase 6). A
  // coach can invite a parent/swimmer by email at any time; when that email
  // signs up, auth.ts materialises these into real swimmerAccess rows and clears
  // them. Normalised lower-case email, matching how auth stores it.
  pendingSwimmerAccess: defineTable({
    email: v.string(),
    swimmerId: v.id("swimmers"),
  })
    .index("by_email", ["email"])
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

  // Dated coaching notes about training focus (§R16). A running LOG / audit
  // trail — past notes PERSIST and stay visible, so a reader lines a training
  // phase up against how times moved in that period. Two scopes: a note about a
  // whole SQUAD (shows for every member) or one SWIMMER. `noteDate` is the ISO
  // date the phase applies FROM (defaults to today) and anchors both the timeline
  // and the progression-chart overlay. SEPARATE from a result's per-swim `notes`.
  trainingNotes: defineTable({
    scope: v.union(v.literal("SQUAD"), v.literal("SWIMMER")),
    squadId: v.optional(v.id("squads")), // set when scope === "SQUAD"
    swimmerId: v.optional(v.id("swimmers")), // set when scope === "SWIMMER"
    authorId: v.id("profiles"), // the coach who wrote it
    focus: v.optional(v.string()), // short title, e.g. "Streamlining & underwater"
    body: v.string(), // the note itself
    noteDate: v.string(), // ISO date the phase applies from
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_swimmer", ["swimmerId"])
    .index("by_squad", ["squadId"])
    .index("by_date", ["noteDate"]),

  // Coach app settings — a single, club-wide singleton row (BRD §5.12, Step 13).
  // `key` is always "app" so the row is found/upserted by a stable lookup. Season
  // ranking reads `seasonStart` here; unset (or no row) => the default rolling
  // 12-month window is used instead.
  settings: defineTable({
    key: v.string(), // always "app" — the singleton discriminator
    seasonStart: v.optional(v.string()), // ISO "YYYY-MM-DD"; unset => rolling 12mo
    seasonEnd: v.optional(v.string()), // ISO "YYYY-MM-DD"; unset => open-ended
  }).index("by_key", ["key"]),
});
