import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { assertMayWriteResult, requireSignedIn } from "./authz";
import { computeAge, isValidEvent, parseTime } from "../lib/swim";

// Result logging (BRD §6, Step 5) — the core data-entry flow. Every write goes
// through the same domain gates: whitelisted event + valid course, a bulletproof-
// parsed in-bounds time, and a server-computed age. Authorization is unified in
// `assertMayWriteResult` (§R15): coaches edit their club's swimmers (any type);
// a VIEWER (parent) may create/edit/delete ONLY a SCHOOL_GALA time, and only for
// a swimmer they are linked to — every other viewer write is rejected here.

// ---------------------------------------------------------------------------
// Shared validators (mirror the schema unions, BRD §4.1–4.3)
// ---------------------------------------------------------------------------

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
  v.literal("SCHOOL_GALA"), // parent-entered, unofficial (§R15)
);

// A time above an hour is not a real pool swim (the slowest 1500 is well under
// half that). Bound defensively so a fat-fingered entry fails loudly.
const MAX_TIME_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** parseTime + range guard. Throws a clear message the form surfaces inline. */
function parseTimeBounded(input: string): number {
  const ms = parseTime(input); // throws on anything ambiguous / out of range
  if (ms > MAX_TIME_MS) {
    throw new Error("That time looks too long — check the minutes.");
  }
  return ms;
}

/** A swim date must be a real ISO day, on or after the swimmer's DOB, not future. */
function cleanSwimDate(input: string, dob: string): string {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Swim date must be YYYY-MM-DD.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error("That is not a real date.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (trimmed > today) {
    throw new Error("Swim date cannot be in the future.");
  }
  if (computeAge(dob, trimmed) < 0) {
    throw new Error("Swim date is before the swimmer's date of birth.");
  }
  return trimmed;
}

/** Trim an optional free-text field; empty → undefined so it's not stored blank. */
function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Assert (distance, stroke, course) is on the active whitelist (§4.3). */
async function assertValidEvent(
  ctx: MutationCtx,
  d: number,
  s: string,
  c: string,
): Promise<void> {
  const events = await ctx.db.query("events").take(200);
  if (!isValidEvent(d, s, c, events)) {
    throw new Error(`${d} ${s} is not a valid ${c} event.`);
  }
}

// ---------------------------------------------------------------------------
// logResult — create one result
// ---------------------------------------------------------------------------

export const logResult = mutation({
  args: {
    swimmerId: v.id("swimmers"),
    distance,
    stroke,
    course,
    swimType,
    swimDate: v.string(),
    timeInput: v.string(),
    meetName: v.optional(v.string()),
    venue: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("results"),
  handler: async (ctx, args) => {
    const profile = await requireSignedIn(ctx);

    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    // Coaches log anything for their club; a viewer only a SCHOOL_GALA time for
    // a linked swimmer. Everything else is rejected before we touch the data.
    await assertMayWriteResult(ctx, profile, swimmer, args.swimType);

    await assertValidEvent(ctx, args.distance, args.stroke, args.course);

    const swimDate = cleanSwimDate(args.swimDate, swimmer.dob);
    const timeMs = parseTimeBounded(args.timeInput);
    const ageAtSwim = computeAge(swimmer.dob, swimDate);

    return await ctx.db.insert("results", {
      swimmerId: args.swimmerId,
      distance: args.distance,
      stroke: args.stroke,
      course: args.course,
      timeMs,
      swimType: args.swimType,
      swimDate,
      ageAtSwim,
      meetName: cleanOptional(args.meetName),
      venue: cleanOptional(args.venue),
      notes: cleanOptional(args.notes),
      enteredBy: profile._id,
      createdAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// updateResult — edit an existing result (re-validates anything that changed)
// ---------------------------------------------------------------------------

export const updateResult = mutation({
  args: {
    resultId: v.id("results"),
    distance: v.optional(distance),
    stroke: v.optional(stroke),
    course: v.optional(course),
    swimType: v.optional(swimType),
    swimDate: v.optional(v.string()),
    timeInput: v.optional(v.string()),
    meetName: v.optional(v.string()),
    venue: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireSignedIn(ctx);

    const existing = await ctx.db.get(args.resultId);
    if (!existing) throw new Error("Result not found.");
    const swimmer = await ctx.db.get(existing.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    // The resulting type is the new one if the edit changes it, else the row's
    // current type. A viewer may only ever touch a SCHOOL_GALA row and only keep
    // it SCHOOL_GALA — `assertMayWriteResult` enforces both from these facts.
    const nextSwimType = args.swimType ?? existing.swimType;
    await assertMayWriteResult(
      ctx,
      profile,
      swimmer,
      nextSwimType,
      existing.swimType,
    );

    // Merge the event fields so we validate the resulting combination as a whole
    // (e.g. changing only the stroke must still land on the whitelist).
    const nextDistance = args.distance ?? existing.distance;
    const nextStroke = args.stroke ?? existing.stroke;
    const nextCourse = args.course ?? existing.course;

    const patch: Partial<Doc<"results">> = {};

    if (
      args.distance !== undefined ||
      args.stroke !== undefined ||
      args.course !== undefined
    ) {
      await assertValidEvent(ctx, nextDistance, nextStroke, nextCourse);
      patch.distance = nextDistance;
      patch.stroke = nextStroke;
      patch.course = nextCourse;
    }

    if (args.swimType !== undefined) patch.swimType = args.swimType;

    // Date and time changes recompute their derived values.
    const nextDate =
      args.swimDate !== undefined
        ? cleanSwimDate(args.swimDate, swimmer.dob)
        : existing.swimDate;
    if (args.swimDate !== undefined) {
      patch.swimDate = nextDate;
      patch.ageAtSwim = computeAge(swimmer.dob, nextDate);
    }

    if (args.timeInput !== undefined) {
      patch.timeMs = parseTimeBounded(args.timeInput);
    }

    if (args.meetName !== undefined) patch.meetName = cleanOptional(args.meetName);
    if (args.venue !== undefined) patch.venue = cleanOptional(args.venue);
    if (args.notes !== undefined) patch.notes = cleanOptional(args.notes);

    // Edit provenance (§R17, Part B): record WHO changed the time and WHEN on
    // every edit, so a coach can audit later changes — not just the original entry.
    patch.lastEditedBy = profile._id;
    patch.updatedAt = Date.now();

    await ctx.db.patch(args.resultId, patch);
    return null;
  },
});

// ---------------------------------------------------------------------------
// deleteResult — remove a mis-entered result
// ---------------------------------------------------------------------------

export const deleteResult = mutation({
  args: { resultId: v.id("results") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireSignedIn(ctx);
    const existing = await ctx.db.get(args.resultId);
    if (!existing) throw new Error("Result not found.");
    const swimmer = await ctx.db.get(existing.swimmerId);
    if (!swimmer) throw new Error("Swimmer not found.");
    // A delete doesn't change the type, so target = the row's own type: a viewer
    // may delete a SCHOOL_GALA row they're linked to, nothing else.
    await assertMayWriteResult(
      ctx,
      profile,
      swimmer,
      existing.swimType,
      existing.swimType,
    );
    await ctx.db.delete(args.resultId);
    return null;
  },
});
