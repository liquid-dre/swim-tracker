import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { computeAge, parseTime } from "../lib/swim";

// NOTE: the legacy `promoteToCoach` was retired (access-control P0). It set
// role=COACH WITHOUT a club, leaving a half-provisioned coach that `addSwimmer`
// rejects ("You aren't assigned to a club yet"). Coach-hood is now always granted
// WITH a club, atomically — via clubs.assignCoachToClub (existing account) or a
// clubs.createCoachInvite → redeemCoachInvite link (new account). Both set role
// and clubId together, so the broken club-less state can no longer be created.

// One-time backfill for the club model (access-control Phase 5). Run ONCE from
// the Convex dashboard after deploying the club-scoping change:
//   admin:backfillDefaultClub   with   {}  (or { "name": "Your Club" })
// It creates (or reuses) a single club and assigns every swimmer and coach that
// has no club to it — so existing data keeps working once coaches may only edit
// their own club's swimmers. Idempotent: re-running only touches still-unassigned
// rows, so it's safe to run again.
export const backfillDefaultClub = internalMutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const clubName = (name ?? "Default Club").trim() || "Default Club";

    const clubs = await ctx.db.query("clubs").take(200);
    const existing = clubs.find((c) => c.name === clubName);
    const clubId =
      existing?._id ??
      (await ctx.db.insert("clubs", { name: clubName, createdAt: Date.now() }));

    let swimmersFixed = 0;
    for (const s of await ctx.db.query("swimmers").take(5000)) {
      if (!s.clubId) {
        await ctx.db.patch(s._id, { clubId });
        swimmersFixed++;
      }
    }

    let coachesFixed = 0;
    const coaches = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "COACH"))
      .take(1000);
    for (const c of coaches) {
      if (!c.clubId) {
        await ctx.db.patch(c._id, { clubId });
        coachesFixed++;
      }
    }

    return { clubName, clubId, swimmersFixed, coachesFixed };
  },
});

// ---------------------------------------------------------------------------
// setupRuvarashe — one-time data load for the Sharks / Ruvarashe cut-over
// ---------------------------------------------------------------------------
//
// Run ONCE from the Convex dashboard:
//   admin:setupRuvarashe   with   { "course": "LCM" }   (or { "course": "SCM" })
//
// It performs the whole cut-over in one idempotent pass:
//   1. Ensures a club named "Sharks" exists (creates it if missing).
//   2. Finds the swimmer whose name contains "Ruvarashe" and assigns her to
//      Sharks.
//   3. Replaces her results with the 2025/26 season-target times below (her
//      existing results are cleared first, so re-running never duplicates).
//   4. REMOVES every OTHER swimmer from the system, along with their results,
//      squad memberships and viewer-access rows.
//
// `course` defaults to LCM — the season-target sheet tracks progress against the
// LCM-only qualifying tiers (L2/L3/SANJ), so the recorded times are long course.
// Pass { "course": "SCM" } if these were short-course meets.
//
// Every time string is validated through the same bulletproof parseTime the app
// uses; a bad row throws loudly rather than seeding a wrong time.

type SeasonSwim = {
  distance: 50 | 100 | 200 | 400;
  stroke: "FREE" | "BACK" | "BREAST" | "FLY" | "IM";
  meet: string;
  date: string; // ISO YYYY-MM-DD
  time: string; // canonical-ish; parsed by parseTime
};

// Meet name + date for each column of the season-target sheet (2025/26).
const RUVA_MEET = {
  s1: { name: "1st Seeded Snr", date: "2025-09-12" },
  s2: { name: "2nd Seeded", date: "2025-09-21" },
  s2j: { name: "2nd Seeded Jnr", date: "2025-09-28" },
  s3: { name: "3rd Seeded", date: "2025-10-10" },
  s4: { name: "4th Seeded", date: "2025-10-31" },
  s4j: { name: "4th Junior", date: "2025-11-02" },
  muf: { name: "Mufakose", date: "2025-11-16" },
  has: { name: "HAS Snr Champs", date: "2025-11-28" },
  s5: { name: "5th Seeded", date: "2026-01-09" },
  s6: { name: "6th Seeded", date: "2026-01-23" },
  nat: { name: "Zim Snr Nationals", date: "2026-02-19" },
} as const;

// Ruvarashe's achieved MEET times, transcribed from the season-target PDF.
// Single-decimal source values (e.g. "49.7") are written as hundredths ("49.70")
// so parseTime reads tenths correctly.
const RUVA_SWIMS: Array<
  Omit<SeasonSwim, "meet" | "date"> & { m: keyof typeof RUVA_MEET }
> = [
  // Freestyle
  { distance: 50, stroke: "FREE", m: "s1", time: "35.97" },
  { distance: 50, stroke: "FREE", m: "has", time: "33.72" },
  { distance: 50, stroke: "FREE", m: "nat", time: "34.14" },
  { distance: 100, stroke: "FREE", m: "s1", time: "1:19.94" },
  { distance: 100, stroke: "FREE", m: "s2", time: "1:22.09" },
  { distance: 100, stroke: "FREE", m: "s4", time: "1:20.47" },
  { distance: 100, stroke: "FREE", m: "has", time: "1:12.25" },
  { distance: 100, stroke: "FREE", m: "nat", time: "1:12.76" },
  { distance: 200, stroke: "FREE", m: "s4j", time: "2:52.45" },
  { distance: 200, stroke: "FREE", m: "has", time: "2:43.62" },
  { distance: 200, stroke: "FREE", m: "nat", time: "2:39.24" },
  { distance: 400, stroke: "FREE", m: "s1", time: "6:44.49" },
  { distance: 400, stroke: "FREE", m: "has", time: "6:03.70" },
  { distance: 400, stroke: "FREE", m: "s6", time: "6:02.63" },
  { distance: 400, stroke: "FREE", m: "nat", time: "5:44.68" },
  // Backstroke
  { distance: 50, stroke: "BACK", m: "muf", time: "49.70" },
  { distance: 50, stroke: "BACK", m: "has", time: "43.55" },
  { distance: 50, stroke: "BACK", m: "nat", time: "42.76" },
  { distance: 100, stroke: "BACK", m: "s2", time: "1:43.02" },
  { distance: 100, stroke: "BACK", m: "s4j", time: "1:40.28" },
  { distance: 100, stroke: "BACK", m: "has", time: "1:35.75" },
  { distance: 100, stroke: "BACK", m: "nat", time: "1:33.59" },
  { distance: 200, stroke: "BACK", m: "s2j", time: "3:34.63" },
  // Breaststroke
  { distance: 50, stroke: "BREAST", m: "has", time: "52.35" },
  { distance: 50, stroke: "BREAST", m: "s5", time: "52.18" },
  { distance: 50, stroke: "BREAST", m: "nat", time: "52.20" },
  { distance: 100, stroke: "BREAST", m: "s2", time: "2:00.83" },
  { distance: 100, stroke: "BREAST", m: "s3", time: "1:57.52" },
  { distance: 100, stroke: "BREAST", m: "muf", time: "1:55.30" },
  { distance: 100, stroke: "BREAST", m: "has", time: "1:54.25" },
  { distance: 100, stroke: "BREAST", m: "nat", time: "1:59.10" },
  // Butterfly
  { distance: 50, stroke: "FLY", m: "s2", time: "43.06" },
  { distance: 50, stroke: "FLY", m: "s2j", time: "41.89" },
  { distance: 50, stroke: "FLY", m: "has", time: "39.60" },
  { distance: 50, stroke: "FLY", m: "s6", time: "42.60" },
  { distance: 50, stroke: "FLY", m: "nat", time: "39.50" },
  { distance: 100, stroke: "FLY", m: "s4", time: "1:42.92" },
  { distance: 100, stroke: "FLY", m: "s4j", time: "1:36.95" },
  { distance: 100, stroke: "FLY", m: "muf", time: "1:38.39" },
  { distance: 100, stroke: "FLY", m: "has", time: "1:31.56" },
  { distance: 100, stroke: "FLY", m: "s6", time: "1:35.45" },
  { distance: 100, stroke: "FLY", m: "nat", time: "1:37.84" },
  { distance: 200, stroke: "FLY", m: "s3", time: "3:53.29" },
  { distance: 200, stroke: "FLY", m: "has", time: "3:42.03" },
  // Individual medley
  { distance: 200, stroke: "IM", m: "s2j", time: "3:24.44" },
  { distance: 200, stroke: "IM", m: "s4", time: "3:30.06" },
  { distance: 200, stroke: "IM", m: "has", time: "3:17.86" },
  { distance: 200, stroke: "IM", m: "nat", time: "3:17.23" },
  { distance: 400, stroke: "IM", m: "s5", time: "7:06.34" },
];

// Delete a swimmer plus every row that references it, so "removed from the
// system" leaves nothing dangling.
async function deleteSwimmerCascade(
  ctx: MutationCtx,
  swimmerId: Id<"swimmers">,
): Promise<void> {
  for (const r of await ctx.db
    .query("results")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .collect()) {
    await ctx.db.delete(r._id);
  }
  for (const m of await ctx.db
    .query("squadMemberships")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .collect()) {
    await ctx.db.delete(m._id);
  }
  for (const a of await ctx.db
    .query("swimmerAccess")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .collect()) {
    await ctx.db.delete(a._id);
  }
  for (const p of await ctx.db
    .query("pendingSwimmerAccess")
    .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
    .collect()) {
    await ctx.db.delete(p._id);
  }
  await ctx.db.delete(swimmerId);
}

export const setupRuvarashe = internalMutation({
  args: { course: v.optional(v.union(v.literal("LCM"), v.literal("SCM"))) },
  handler: async (ctx, { course }) => {
    const swimCourse = course ?? "LCM";

    // 1. Ensure the Sharks club exists.
    const clubs = await ctx.db.query("clubs").collect();
    const sharks = clubs.find((c) => c.name.trim().toLowerCase() === "sharks");
    const sharksId =
      sharks?._id ??
      (await ctx.db.insert("clubs", { name: "Sharks", createdAt: Date.now() }));

    // 2. Find Ruvarashe (name contains "ruvarashe"), and assign her to Sharks.
    const allSwimmers = await ctx.db.query("swimmers").collect();
    const matches = allSwimmers.filter((s) =>
      s.name.toLowerCase().includes("ruvarashe"),
    );
    if (matches.length === 0) {
      throw new ConvexError(
        `No swimmer whose name contains "Ruvarashe" was found. Existing swimmers: ${allSwimmers
          .map((s) => s.name)
          .join(", ")}`,
      );
    }
    if (matches.length > 1) {
      throw new ConvexError(
        `More than one swimmer matches "Ruvarashe": ${matches
          .map((s) => s.name)
          .join(", ")}. Rename so exactly one matches, then re-run.`,
      );
    }
    const ruva: Doc<"swimmers"> = matches[0];
    await ctx.db.patch(ruva._id, { clubId: sharksId, active: true });

    // Attribute the loaded results to a staff account (super-user preferred).
    const profiles = await ctx.db.query("profiles").collect();
    const enteredBy =
      profiles.find((p) => p.role === "SUPER_USER")?._id ??
      profiles.find((p) => p.role === "COACH")?._id ??
      profiles[0]?._id;
    if (!enteredBy) {
      throw new ConvexError("No profile exists to attribute the results to.");
    }

    // 3. Replace Ruvarashe's results (clear first → idempotent re-runs).
    for (const r of await ctx.db
      .query("results")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", ruva._id))
      .collect()) {
      await ctx.db.delete(r._id);
    }

    let inserted = 0;
    for (const s of RUVA_SWIMS) {
      const meet = RUVA_MEET[s.m];
      const timeMs = parseTime(s.time); // throws on anything unparseable
      await ctx.db.insert("results", {
        swimmerId: ruva._id,
        distance: s.distance,
        stroke: s.stroke,
        course: swimCourse,
        timeMs,
        swimType: "MEET",
        swimDate: meet.date,
        ageAtSwim: computeAge(ruva.dob, meet.date),
        meetName: meet.name,
        enteredBy,
        createdAt: Date.now(),
      });
      inserted++;
    }

    // 4. Remove every OTHER swimmer (and their dependent rows).
    let removed = 0;
    for (const s of allSwimmers) {
      if (s._id === ruva._id) continue;
      await deleteSwimmerCascade(ctx, s._id);
      removed++;
    }

    return {
      swimmer: ruva.name,
      club: "Sharks",
      course: swimCourse,
      resultsInserted: inserted,
      otherSwimmersRemoved: removed,
    };
  },
});
