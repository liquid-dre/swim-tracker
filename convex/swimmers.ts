import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { accessibleSwimmerIds, requireCoach, requireSignedIn } from "./authz";
import { computeAge } from "../lib/swim";

// Swimmer management (BRD §5, Step 4). Coaches only. Swimmers are never
// hard-deleted — `active` is toggled so history and PBs are preserved.

const gender = v.union(v.literal("M"), v.literal("F"));

// ---------------------------------------------------------------------------
// Validation (shared by add + update)
// ---------------------------------------------------------------------------

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Name is required.");
  if (trimmed.length > 120) throw new Error("Name is too long.");
  return trimmed;
}

// A DOB must be a real ISO date, not in the future, and inside a sane age
// range. We store the plain "YYYY-MM-DD" string (BRD §7).
function cleanDob(dob: string): string {
  const trimmed = dob.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Date of birth must be YYYY-MM-DD.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error("That is not a real date.");
  }
  const today = new Date().toISOString().slice(0, 10);
  const age = computeAge(trimmed, today);
  if (age < 0) throw new Error("Date of birth cannot be in the future.");
  if (age > 120) throw new Error("Please check the date of birth.");
  return trimmed;
}

function cleanNotes(notes: string | undefined): string | undefined {
  if (notes === undefined) return undefined;
  const trimmed = notes.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const addSwimmer = mutation({
  args: {
    name: v.string(),
    dob: v.string(),
    gender,
    notes: v.optional(v.string()),
  },
  returns: v.id("swimmers"),
  handler: async (ctx, args) => {
    await requireCoach(ctx);
    return await ctx.db.insert("swimmers", {
      name: cleanName(args.name),
      dob: cleanDob(args.dob),
      gender: args.gender,
      notes: cleanNotes(args.notes),
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const updateSwimmer = mutation({
  args: {
    swimmerId: v.id("swimmers"),
    name: v.optional(v.string()),
    dob: v.optional(v.string()),
    gender: v.optional(gender),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCoach(ctx);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");

    const patch: Partial<{
      name: string;
      dob: string;
      gender: "M" | "F";
      notes: string | undefined;
    }> = {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.dob !== undefined) patch.dob = cleanDob(args.dob);
    if (args.gender !== undefined) patch.gender = args.gender;
    if (args.notes !== undefined) patch.notes = cleanNotes(args.notes);

    await ctx.db.patch(args.swimmerId, patch);
    return null;
  },
});

export const setSwimmerActive = mutation({
  args: { swimmerId: v.id("swimmers"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCoach(ctx);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    await ctx.db.patch(args.swimmerId, { active: args.active });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Query: listSwimmers with each swimmer's age (as of today) and squad names
// ---------------------------------------------------------------------------

const swimmerRow = v.object({
  _id: v.id("swimmers"),
  _creationTime: v.number(),
  name: v.string(),
  dob: v.string(),
  gender,
  active: v.boolean(),
  notes: v.optional(v.string()),
  createdAt: v.number(),
  age: v.number(),
  squads: v.array(v.object({ _id: v.id("squads"), name: v.string() })),
});

export const listSwimmers = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    squadId: v.optional(v.id("squads")),
    search: v.optional(v.string()),
  },
  returns: v.array(swimmerRow),
  handler: async (ctx, args) => {
    await requireCoach(ctx);

    // Bounded read: a club roster is small, but cap defensively (guidelines).
    const LIMIT = 500;

    let swimmers;
    if (args.squadId !== undefined) {
      // Scope to a squad via the membership join table, then load each swimmer.
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_squad", (q) => q.eq("squadId", args.squadId!))
        .take(LIMIT);
      const loaded = await Promise.all(memberships.map((m) => ctx.db.get(m.swimmerId)));
      swimmers = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
      if (args.activeOnly) swimmers = swimmers.filter((s) => s.active);
    } else if (args.activeOnly) {
      swimmers = await ctx.db
        .query("swimmers")
        .withIndex("by_active", (q) => q.eq("active", true))
        .take(LIMIT);
    } else {
      swimmers = await ctx.db.query("swimmers").take(LIMIT);
    }

    // Case-insensitive substring search on name, in memory (bounded set).
    const needle = args.search?.trim().toLowerCase();
    if (needle) {
      swimmers = swimmers.filter((s) => s.name.toLowerCase().includes(needle));
    }

    // Stable, human order: by name.
    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    const today = new Date().toISOString().slice(0, 10);

    return await Promise.all(
      swimmers.map(async (s) => {
        const memberships = await ctx.db
          .query("squadMemberships")
          .withIndex("by_swimmer", (q) => q.eq("swimmerId", s._id))
          .take(50);
        const squads = (
          await Promise.all(
            memberships.map(async (m) => {
              const squad = await ctx.db.get(m.squadId);
              return squad ? { _id: squad._id, name: squad.name } : null;
            }),
          )
        )
          .filter((x): x is { _id: Id<"squads">; name: string } => x !== null)
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          _id: s._id,
          _creationTime: s._creationTime,
          name: s.name,
          dob: s.dob,
          gender: s.gender,
          active: s.active,
          notes: s.notes,
          createdAt: s.createdAt,
          age: computeAge(s.dob, today),
          squads,
        };
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// listForProfile — the swimmers the SIGNED-IN user may pick (role-aware)
// ---------------------------------------------------------------------------
//
// Powers pickers on swimmer-scoped screens that both roles can reach (Step 12.5
// stroke profile). A COACH gets the whole roster; a VIEWER gets only their
// linked swimmer(s) — enforced here, server-side, never by the client. The
// `role` travels with the list so the screen can decide what a viewer may do
// (no compare, no side-by-side) without a second round-trip.
export const listForProfile = query({
  args: {},
  returns: v.object({
    role: v.union(v.literal("COACH"), v.literal("VIEWER")),
    swimmers: v.array(
      v.object({
        _id: v.id("swimmers"),
        name: v.string(),
        gender,
        age: v.number(),
        active: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { profile, swimmerIds } = await accessibleSwimmerIds(ctx);

    const LIMIT = 500;
    let swimmers;
    if (swimmerIds === "ALL") {
      swimmers = await ctx.db.query("swimmers").take(LIMIT);
    } else {
      const loaded = await Promise.all(swimmerIds.map((id) => ctx.db.get(id)));
      swimmers = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
    }

    const today = new Date().toISOString().slice(0, 10);
    swimmers.sort((a, b) => a.name.localeCompare(b.name));

    return {
      role: profile.role,
      swimmers: swimmers.map((s) => ({
        _id: s._id,
        name: s.name,
        gender: s.gender,
        age: computeAge(s.dob, today),
        active: s.active,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// listSwimmersForPicker — the whole roster as PUBLIC picker rows
// ---------------------------------------------------------------------------
//
// Any signed-in user may list every swimmer here (docs/access-control.md): this
// powers the "chart any swimmer" progression picker a viewer uses to see how
// another swimmer has progressed. Public fields only — name, gender, age band,
// active flag; no DOB/notes. The heavy per-swimmer detail (and any sensitive
// field) still flows through the scoped reads, redacted per viewer.
export const listSwimmersForPicker = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("swimmers"),
      name: v.string(),
      gender,
      age: v.number(),
      active: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireSignedIn(ctx);
    const swimmers = await ctx.db.query("swimmers").take(500);
    const today = new Date().toISOString().slice(0, 10);
    return swimmers
      .map((s) => ({
        _id: s._id,
        name: s.name,
        gender: s.gender,
        age: computeAge(s.dob, today),
        active: s.active,
      }))
      // Active first, then by name — the current squad reads at the top.
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
      );
  },
});
