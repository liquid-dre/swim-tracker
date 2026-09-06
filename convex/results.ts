import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { assertMayWriteResult, requireSignedIn } from "./authz";
import { recordResultDeletion } from "./audit";
import { computeAge } from "../lib/swim";
import { formatMeetDates, meetDates } from "../lib/meets";
import { pickEntryToFill } from "../lib/meetEntries";
import { entriesForSwimmerAtMeet, entryForResult } from "./meetEntriesShared";
import { galaCodeValidator } from "./galas";
import {
  assertValidEvent,
  cleanSwimDate,
  describeMeetSwim,
  parseTimeBounded,
} from "./resultsShared";

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

/** Trim an optional free-text field; empty → undefined so it's not stored blank. */
function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
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
    /**
     * The meet on the calendar, when the coach picked one. `meetName` still
     * travels with the swim — the id is the join, the name is the record, and
     * a meet can be deleted while the words must survive.
     */
    meetId: v.optional(v.id("meets")),
    meetName: v.optional(v.string()),
    venue: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    resultId: v.id("results"),
    // What this swim MEANT, so the save feedback can say so (§4.6: a new
    // headline = fastest MEET time on this event+course).
    newPb: v.boolean(),
    // The hardest gala this time meets that the previous best didn't, judged
    // against THIS COURSE's own cut (both courses qualify, §4.2) and resolved
    // per the tour rule. Null when nothing changed.
    newlyMetGala: v.union(galaCodeValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const profile = await requireSignedIn(ctx);

    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    // Coaches log anything for their club; a viewer only a SCHOOL_GALA time for
    // a linked swimmer. Everything else is rejected before we touch the data.
    await assertMayWriteResult(ctx, profile, swimmer, args.swimType);

    await assertValidEvent(ctx, args.distance, args.stroke, args.course);

    const swimDate = cleanSwimDate(args.swimDate, swimmer.dob);
    const timeMs = parseTimeBounded(args.timeInput);
    const ageAtSwim = computeAge(swimmer.dob, swimDate);

    // A picked meet has to be one that was actually running that day, or the
    // swim would appear on a meet nobody attended.
    let meet: Doc<"meets"> | null = null;
    if (args.meetId !== undefined) {
      meet = await ctx.db.get(args.meetId);
      if (meet === null) throw new ConvexError("That meet no longer exists.");
      if (!meetDates(meet).includes(swimDate)) {
        throw new ConvexError(
          `${meet.name} runs ${formatMeetDates(meet)}, so a swim on ${swimDate} can't belong to it.`,
        );
      }
    }

    // What this swim MEANT — PB and newly-met cut — through the one seam both
    // doors into `results` share, so a time typed on the meet sheet is judged
    // exactly as one typed here.
    const { newPb, newlyMetGala } = await describeMeetSwim(ctx, {
      swimmer,
      distance: args.distance,
      stroke: args.stroke,
      course: args.course,
      timeMs,
      swimType: args.swimType,
    });

    const resultId = await ctx.db.insert("results", {
      swimmerId: args.swimmerId,
      distance: args.distance,
      stroke: args.stroke,
      course: args.course,
      timeMs,
      swimType: args.swimType,
      swimDate,
      ageAtSwim,
      ...(meet === null ? {} : { meetId: meet._id }),
      meetName: cleanOptional(args.meetName) ?? meet?.name,
      venue: cleanOptional(args.venue) ?? meet?.venue,
      notes: cleanOptional(args.notes),
      enteredBy: profile._id,
      createdAt: Date.now(),
    });

    // A coach who logs poolside the usual way should not also have to tick the
    // swimmer off on the meet sheet. If they were signed up for this event and
    // have no time yet, this swim IS that entry's time. Only when the course
    // matches the meet's: filling an entry with a swim from the other pool
    // would compare it against a PB it has nothing to do with.
    if (meet !== null && meet.course === args.course) {
      const entry = pickEntryToFill(
        await entriesForSwimmerAtMeet(ctx, args.swimmerId, meet._id),
        { distance: args.distance, stroke: args.stroke },
      );
      if (entry !== null) {
        await ctx.db.patch(entry._id, {
          resultId,
          swimDate,
          lastEditedBy: profile._id,
          updatedAt: Date.now(),
        });
      }
    }

    return { resultId, newPb, newlyMetGala };
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
    if (!existing) throw new ConvexError("Result not found.");
    const swimmer = await ctx.db.get(existing.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
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

    // A swim recorded on a meet's sign-up sheet takes its event FROM the
    // programme line. Letting it be edited here would give the same swim two
    // sources of truth for what race it was, so the line is where that changes.
    const linkedEntry = await entryForResult(ctx, args.resultId);
    const changesEvent =
      args.distance !== undefined ||
      args.stroke !== undefined ||
      args.course !== undefined;
    if (linkedEntry !== null && changesEvent) {
      throw new ConvexError(
        "This time is attached to a meet's programme, which decides what event it was. Change it on the meet, or delete the time first.",
      );
    }

    if (changesEvent) {
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
  args: {
    resultId: v.id("results"),
    // Why it's going, in the deleter's own words (§R17 Part C). Optional — see
    // recordResultDeletion for why it isn't forced.
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireSignedIn(ctx);
    const existing = await ctx.db.get(args.resultId);
    if (!existing) throw new ConvexError("Result not found.");
    const swimmer = await ctx.db.get(existing.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    // A delete doesn't change the type, so target = the row's own type: a viewer
    // may delete a SCHOOL_GALA row they're linked to, nothing else.
    await assertMayWriteResult(
      ctx,
      profile,
      swimmer,
      existing.swimType,
      existing.swimType,
    );
    // Tombstone FIRST: the audit trail reads this row's provenance, and after
    // the delete there is nothing left to read. Every deletion is logged, a
    // parent removing their own school-gala time included — that entry point is
    // exactly the one a coach can't otherwise see.
    await recordResultDeletion(ctx, {
      result: existing,
      swimmer,
      actor: profile,
      reason: args.reason,
    });
    // A meet sign-up pointing at this row survives the deletion as a plan again,
    // rather than being left pointing at nothing. This is also the only way to
    // free an entry for removal: `removeEntry` refuses while a time exists, and
    // deleting the swim is deliberately routed through here so it is tombstoned.
    const entry = await entryForResult(ctx, args.resultId);
    if (entry !== null) {
      await ctx.db.patch(entry._id, {
        resultId: undefined,
        lastEditedBy: profile._id,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(args.resultId);
    return null;
  },
});
