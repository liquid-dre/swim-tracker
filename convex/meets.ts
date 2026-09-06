import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSignedIn, requireSuperUser } from "./authz";
import {
  cleanMeetDate,
  meetOverlapsRange,
  type MeetEvent,
} from "../lib/meets";
import { isWhitelistedEvent } from "../lib/swim";

/*
  Meets — the dated competitions on the season calendar (§R19).

  Global reference data (docs/access-control.md): the SUPER_USER maintains it,
  every signed-in role reads it. Coaches and viewers alike need "when is the next
  gala and what's on the programme"; nobody but the super-user changes it, and
  that boundary is enforced HERE, not merely in the nav — `requireSuperUser`
  guards every mutation below, so a hidden button is a convenience, never the
  control.

  Distinct from `galas` (the five qualifying standard sets). A meet may carry a
  display-only `galaCode` tag, but `galas.tourDate` remains the sole authority
  for the birthday rule — nothing in this file reads or writes it.
*/

// A season is ~20 meets; a generous bound that still cannot silently truncate.
const MAX_MEETS = 500;
const MAX_EVENTS = 200; // HY-TEK numbers sessions in hundreds; 200 covers days
const NAME_MAX = 120;
const VENUE_MAX = 120;
const LABEL_MAX = 120;
/** A meet cannot run longer than this — a typo'd end date is not a 3-year gala. */
const MAX_SPAN_DAYS = 31;

const courseValidator = v.union(v.literal("SCM"), v.literal("LCM"));
const galaCodeValidator = v.union(
  v.literal("SANS"),
  v.literal("SANY"),
  v.literal("SANJ"),
  v.literal("LEVEL_3"),
  v.literal("LEVEL_2"),
);
const distanceValidator = v.union(
  v.literal(25),
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const strokeValidator = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);

const meetEventValidator = v.object({
  eventNumber: v.optional(v.number()),
  rawLabel: v.string(),
  gender: v.optional(
    v.union(v.literal("M"), v.literal("F"), v.literal("MIXED")),
  ),
  distance: v.optional(distanceValidator),
  stroke: v.optional(strokeValidator),
});

/** The shape every read surface receives. Optionals are normalised to null. */
export const meetShape = v.object({
  _id: v.id("meets"),
  name: v.string(),
  startDate: v.string(),
  endDate: v.union(v.string(), v.null()),
  venue: v.union(v.string(), v.null()),
  course: v.union(courseValidator, v.null()),
  galaCode: v.union(galaCodeValidator, v.null()),
  events: v.array(meetEventValidator),
});

function toMeetShape(meet: Doc<"meets">) {
  return {
    _id: meet._id,
    name: meet.name,
    startDate: meet.startDate,
    endDate: meet.endDate ?? null,
    venue: meet.venue ?? null,
    course: meet.course ?? null,
    galaCode: meet.galaCode ?? null,
    events: meet.events,
  };
}

// ---------------------------------------------------------------------------
// Validation — the one place a meet's fields are checked
// ---------------------------------------------------------------------------

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") throw new ConvexError("A meet needs a name.");
  if (name.length > NAME_MAX) {
    throw new ConvexError(`That name is too long (max ${NAME_MAX} characters).`);
  }
  return name;
}

function cleanOptionalText(
  raw: string | undefined,
  max: number,
  label: string,
): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().replace(/\s+/g, " ");
  if (value === "") return undefined;
  if (value.length > max) {
    throw new ConvexError(`${label} is too long (max ${max} characters).`);
  }
  return value;
}

/** Start + end as a validated pair: end may be absent, never before the start. */
function cleanDates(
  startRaw: string,
  endRaw: string | undefined,
): { startDate: string; endDate?: string } {
  const startDate = cleanMeetDate(startRaw);
  if (startDate === null) {
    throw new ConvexError("The start date must be a real date in YYYY-MM-DD form.");
  }
  if (endRaw === undefined || endRaw.trim() === "") return { startDate };

  const endDate = cleanMeetDate(endRaw);
  if (endDate === null) {
    throw new ConvexError("The end date must be a real date in YYYY-MM-DD form.");
  }
  if (endDate < startDate) {
    throw new ConvexError("The end date cannot be before the start date.");
  }
  // A single-day meet is stored with no end date at all, so "one day" has one
  // representation rather than two that render identically.
  if (endDate === startDate) return { startDate };

  const spanDays =
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
    86_400_000;
  if (spanDays > MAX_SPAN_DAYS) {
    throw new ConvexError(
      `A meet cannot run longer than ${MAX_SPAN_DAYS} days — check the end date.`,
    );
  }
  return { startDate, endDate };
}

/**
 * Validate a programme. Every line keeps its `rawLabel` — a relay or a 25 m
 * sprint belongs on the programme even though this app has no event for it —
 * but a line claiming a (distance, stroke) must claim a REAL one, so nothing
 * downstream ever keys on an event that does not exist (§4.3).
 */
function cleanEvents(events: ReadonlyArray<MeetEvent>): MeetEvent[] {
  if (events.length > MAX_EVENTS) {
    throw new ConvexError(
      `That programme has ${events.length} events — more than the ${MAX_EVENTS} a meet can hold.`,
    );
  }
  return events.map((event, i) => {
    const rawLabel = event.rawLabel.trim().replace(/\s+/g, " ");
    if (rawLabel === "") {
      throw new ConvexError(`Event ${i + 1} has no name.`);
    }
    if (rawLabel.length > LABEL_MAX) {
      throw new ConvexError(`Event ${i + 1}'s name is too long.`);
    }
    const hasDistance = event.distance !== undefined;
    const hasStroke = event.stroke !== undefined;
    if (hasDistance !== hasStroke) {
      throw new ConvexError(
        `Event ${i + 1} has only half an event — a distance needs a stroke and vice versa.`,
      );
    }
    if (hasDistance && !isWhitelistedEvent(event.distance!, event.stroke!)) {
      throw new ConvexError(
        `Event ${i + 1} ("${rawLabel}") is not a real event — leave it unresolved instead.`,
      );
    }
    if (
      event.eventNumber !== undefined &&
      (!Number.isInteger(event.eventNumber) ||
        event.eventNumber < 0 ||
        event.eventNumber > 9999)
    ) {
      throw new ConvexError(`Event ${i + 1} has an impossible event number.`);
    }
    return {
      ...(event.eventNumber === undefined ? {} : { eventNumber: event.eventNumber }),
      rawLabel,
      ...(event.gender === undefined ? {} : { gender: event.gender }),
      ...(hasDistance ? { distance: event.distance, stroke: event.stroke } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every meet, earliest first. Bounded; the season is tens of rows. */
async function loadMeets(ctx: QueryCtx | MutationCtx): Promise<Doc<"meets">[]> {
  return await ctx.db.query("meets").withIndex("by_startDate").take(MAX_MEETS);
}

/**
 * The whole calendar, earliest first. The Meets screen filters upcoming/past on
 * the client from a single subscription — a season is small enough that paging
 * it would cost more than it saves, and switching the filter stays instant.
 */
export const listMeets = query({
  args: {},
  returns: v.array(meetShape),
  handler: async (ctx) => {
    await requireSignedIn(ctx);
    return (await loadMeets(ctx)).map(toMeetShape);
  },
});

/** One meet with its programme, for the detail screen. */
export const getMeet = query({
  args: { meetId: v.id("meets") },
  returns: v.union(meetShape, v.null()),
  handler: async (ctx, { meetId }) => {
    await requireSignedIn(ctx);
    const meet = await ctx.db.get(meetId);
    return meet === null ? null : toMeetShape(meet);
  },
});

/**
 * Meets touching [from, to] — the calendar's month window. A multi-day meet is
 * returned when ANY of its days fall in range, so a gala spanning a month
 * boundary shows in both months rather than only the one it starts in.
 *
 * The index seeks on `startDate`, so the lower bound is widened by the longest
 * span a meet may have; the exact overlap test then filters.
 */
export const listMeetsInRange = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(meetShape),
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);
    const from = cleanMeetDate(args.from);
    const to = cleanMeetDate(args.to);
    if (from === null || to === null || from > to) return [];

    const earliestStart = new Date(`${from}T00:00:00Z`);
    earliestStart.setUTCDate(earliestStart.getUTCDate() - MAX_SPAN_DAYS);
    const lowerBound = earliestStart.toISOString().slice(0, 10);

    const rows = await ctx.db
      .query("meets")
      .withIndex("by_startDate", (q) =>
        q.gte("startDate", lowerBound).lte("startDate", to),
      )
      .take(MAX_MEETS);

    return rows.filter((m) => meetOverlapsRange(m, from, to)).map(toMeetShape);
  },
});

/**
 * The meet name to pre-fill on the log form for a swim date, or null.
 *
 * This replaced the hardcoded `lib/galaCalendar.ts` map, whose only consumer was
 * that pre-fill and which had already drifted from the real fixture list. With
 * the calendar as the source, correcting a date in one place corrects both.
 */
export const meetNameForDate = query({
  args: { date: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);
    const date = cleanMeetDate(args.date);
    if (date === null) return null;

    const earliest = new Date(`${date}T00:00:00Z`);
    earliest.setUTCDate(earliest.getUTCDate() - MAX_SPAN_DAYS);

    const rows = await ctx.db
      .query("meets")
      .withIndex("by_startDate", (q) =>
        q.gte("startDate", earliest.toISOString().slice(0, 10)).lte("startDate", date),
      )
      .take(MAX_MEETS);

    // Latest-starting match wins, so a one-day meet inside a longer one (rare,
    // but a club gala during a national week happens) reads as the nearer event.
    const hits = rows.filter((m) => meetOverlapsRange(m, date, date));
    if (hits.length === 0) return null;
    return hits[hits.length - 1].name;
  },
});

// ---------------------------------------------------------------------------
// Writes — super-user only
// ---------------------------------------------------------------------------

const meetFields = {
  name: v.string(),
  startDate: v.string(),
  endDate: v.optional(v.string()),
  venue: v.optional(v.string()),
  course: v.optional(courseValidator),
  galaCode: v.optional(galaCodeValidator),
  events: v.array(meetEventValidator),
};

export const createMeet = mutation({
  args: meetFields,
  returns: v.id("meets"),
  handler: async (ctx, args) => {
    const profile = await requireSuperUser(ctx);
    const { startDate, endDate } = cleanDates(args.startDate, args.endDate);
    const venue = cleanOptionalText(args.venue, VENUE_MAX, "The venue");

    return await ctx.db.insert("meets", {
      name: cleanName(args.name),
      startDate,
      ...(endDate === undefined ? {} : { endDate }),
      ...(venue === undefined ? {} : { venue }),
      ...(args.course === undefined ? {} : { course: args.course }),
      ...(args.galaCode === undefined ? {} : { galaCode: args.galaCode }),
      events: cleanEvents(args.events),
      createdAt: Date.now(),
      updatedBy: profile._id,
    });
  },
});

/**
 * Replace a meet's details and programme wholesale.
 *
 * Deliberately a full replace, not a patch: re-importing a corrected programme
 * must REPLACE the event list, never append to it, and a field cleared in the
 * form must clear on the row. Every optional absent from `args` is unset.
 */
export const updateMeet = mutation({
  args: { meetId: v.id("meets"), ...meetFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireSuperUser(ctx);
    const meet = await ctx.db.get(args.meetId);
    if (meet === null) throw new ConvexError("That meet no longer exists.");

    const { startDate, endDate } = cleanDates(args.startDate, args.endDate);
    await ctx.db.patch(args.meetId, {
      name: cleanName(args.name),
      startDate,
      endDate,
      venue: cleanOptionalText(args.venue, VENUE_MAX, "The venue"),
      course: args.course,
      galaCode: args.galaCode,
      events: cleanEvents(args.events),
      updatedAt: Date.now(),
      updatedBy: profile._id,
    });
    return null;
  },
});

/**
 * Delete a meet.
 *
 * A hard delete is correct here where it is not for a session: nothing
 * references a meet. `results.meetName` is free text captured at log time and
 * stays exactly as the coach typed it, so no swim loses its provenance and
 * nothing is orphaned. A postponed meet is an edited date, not a delete.
 */
export const deleteMeet = mutation({
  args: { meetId: v.id("meets") },
  returns: v.null(),
  handler: async (ctx, { meetId }) => {
    await requireSuperUser(ctx);
    const meet = await ctx.db.get(meetId);
    if (meet === null) return null; // already gone: deleting twice is not an error
    await ctx.db.delete(meetId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Commit a parsed programme, either onto an existing meet or as a new one.
 *
 * The PARSING happens in the browser (`lib/meetImport.ts`, pure and tested);
 * this mutation only ever sees a draft the super-user has already reviewed and
 * confirmed. It deliberately does NOT auto-match: the seeded "1st seeded" row
 * sits on 12 Sep while the HAS programme says the 11th, so any date- or
 * name-based rule would silently create a near-duplicate. The screen suggests;
 * the person decides; this records the decision.
 */
export const importMeet = mutation({
  args: {
    /** Absent = create a new meet. Present = replace that meet's details. */
    meetId: v.optional(v.id("meets")),
    ...meetFields,
  },
  returns: v.object({
    meetId: v.id("meets"),
    created: v.boolean(),
    eventCount: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    meetId: Id<"meets">;
    created: boolean;
    eventCount: number;
  }> => {
    const profile = await requireSuperUser(ctx);

    const { startDate, endDate } = cleanDates(args.startDate, args.endDate);
    const name = cleanName(args.name);
    const venue = cleanOptionalText(args.venue, VENUE_MAX, "The venue");
    const events = cleanEvents(args.events);

    if (args.meetId !== undefined) {
      const existing = await ctx.db.get(args.meetId);
      if (existing === null) throw new ConvexError("That meet no longer exists.");

      // A programme states one date, and the patch below deliberately leaves
      // `endDate` alone — but a start date after the stored end would leave the
      // meet dated backwards, and `isUpcoming` reads the END date, so a future
      // meet would silently start showing as Past. Refuse, and say which two
      // dates disagree rather than quietly repairing one of them.
      if (existing.endDate !== undefined && startDate > existing.endDate) {
        throw new ConvexError(
          `This programme is dated ${startDate}, after that meet's end date (${existing.endDate}). Fix the meet's dates first, or import it as a new meet.`,
        );
      }
      // Patch only what a PROGRAMME actually states. An event list carries a
      // name, a date, a venue and events; it says nothing about how many days
      // the meet runs, which course the pool is, or whether this is a gala tour.
      // Blanking those because the document is silent would destroy details
      // someone entered by hand — so they survive the import untouched, and the
      // meet form stays the way to change them.
      await ctx.db.patch(args.meetId, {
        name,
        startDate,
        ...(endDate === undefined ? {} : { endDate }),
        ...(venue === undefined ? {} : { venue }),
        ...(args.course === undefined ? {} : { course: args.course }),
        ...(args.galaCode === undefined ? {} : { galaCode: args.galaCode }),
        events,
        updatedAt: Date.now(),
        updatedBy: profile._id,
      });
      return { meetId: args.meetId, created: false, eventCount: events.length };
    }

    const meetId = await ctx.db.insert("meets", {
      name,
      startDate,
      ...(endDate === undefined ? {} : { endDate }),
      ...(venue === undefined ? {} : { venue }),
      ...(args.course === undefined ? {} : { course: args.course }),
      ...(args.galaCode === undefined ? {} : { galaCode: args.galaCode }),
      events,
      createdAt: Date.now(),
      updatedBy: profile._id,
    });
    return { meetId, created: true, eventCount: events.length };
  },
});
