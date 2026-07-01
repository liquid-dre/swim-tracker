import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// STEP 1 SCOPE: auth identity + the `profiles` table only (BRD §7).
// Do NOT add swimmers / squads / events / standards / results here — those
// belong to later steps.
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
});
