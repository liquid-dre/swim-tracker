import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSignedIn, requireSuperUser } from "./authz";
import {
  cleanMeetDate,
  meetDates,
  meetOverlapsRange,
  reconcileLines,
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
/** 200 events × a squad's worth of swimmers, with room to spare. */
const MAX_ENTRIES = 5000;

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
  /** Stable line identity — what a sign-up points at. See lib/meets.ts. */
  id: v.optional(v.string()),
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
  // An event number IS the running order — `compareMeetEvents` sorts by it, and
  // a coach reads it off the poolside sheet. Two lines claiming one number
  // therefore order arbitrarily wherever the programme is read, so the rule is
  // enforced here and not only in the form that usually produces it.
  const seen = new Set<number>();
  for (const event of events) {
    if (event.eventNumber === undefined) continue;
    if (seen.has(event.eventNumber)) {
      throw new ConvexError(
        `Two events are both numbered ${event.eventNumber}. An event number is the running order, so it has to be unique.`,
      );
    }
    seen.add(event.eventNumber);
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
      ...(event.id === undefined ? {} : { id: event.id }),
      ...(event.eventNumber === undefined ? {} : { eventNumber: event.eventNumber }),
      rawLabel,
      ...(event.gender === undefined ? {} : { gender: event.gender }),
      ...(hasDistance ? { distance: event.distance, stroke: event.stroke } : {}),
    };
  });
}

/**
 * Clean a programme AND settle every line's identity against what is already
 * stored, so a re-import of the same document keeps its ids (and therefore its
 * sign-ups) instead of minting a fresh set.
 */
function prepareEvents(
  existing: ReadonlyArray<MeetEvent>,
  incoming: ReadonlyArray<MeetEvent>,
): { lines: MeetEvent[]; droppedIds: string[] } {
  return reconcileLines(existing, cleanEvents(incoming));
}

/**
 * Refuse to strand sign-ups on a programme line that is about to disappear.
 *
 * Replacing a programme is a legitimate thing to do — that is what an import
 * is — but it must not silently delete a coach's entries. So: a line whose
 * entries carry no time can be cleared with an explicit confirmation, and a
 * line whose entries carry a RECORDED TIME cannot be dropped at all, because
 * the swim is real and deleting it belongs on the tombstoned delete path, not
 * as a side effect of re-reading a PDF.
 */
async function clearEntriesForDroppedLines(
  ctx: MutationCtx,
  meetId: Id<"meets">,
  droppedIds: ReadonlyArray<string>,
  allowDroppingEntries: boolean | undefined,
): Promise<void> {
  if (droppedIds.length === 0) return;
  const dropped = new Set(droppedIds);

  const entries = (
    await ctx.db
      .query("meetEntries")
      .withIndex("by_meet_line", (q) => q.eq("meetId", meetId))
      .take(MAX_ENTRIES)
  ).filter((entry) => dropped.has(entry.lineId));
  if (entries.length === 0) return;

  const timed = entries.filter((entry) => entry.resultId !== undefined);
  if (timed.length > 0) {
    throw new ConvexError(
      `${timed.length === 1 ? "A swimmer has" : `${timed.length} swimmers have`} a recorded time on ${timed.length === 1 ? "an event" : "events"} this programme would remove. Delete ${timed.length === 1 ? "that time" : "those times"} first, or keep the event on the programme.`,
    );
  }
  if (allowDroppingEntries !== true) {
    throw new ConvexError(
      `This programme removes ${droppedIds.length === 1 ? "an event" : `${droppedIds.length} events`} that ${entries.length === 1 ? "1 swimmer is" : `${entries.length} swimmers are`} signed up for. Confirm to remove those sign-ups.`,
    );
  }
  for (const entry of entries) await ctx.db.delete(entry._id);
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
 * The calendar as a picker: every meet, without its programme.
 *
 * The log form keeps this subscribed while a coach types, and a programme is
 * the one part of a meet it has no use for — a season of full programmes is
 * thousands of lines to hold open for a dropdown of twenty names.
 */
export const listMeetOptions = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("meets"),
      name: v.string(),
      startDate: v.string(),
      endDate: v.union(v.string(), v.null()),
      venue: v.union(v.string(), v.null()),
      course: v.union(courseValidator, v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireSignedIn(ctx);
    return (await loadMeets(ctx)).map((meet) => ({
      _id: meet._id,
      name: meet.name,
      startDate: meet.startDate,
      endDate: meet.endDate ?? null,
      venue: meet.venue ?? null,
      course: meet.course ?? null,
    }));
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
      events: prepareEvents([], args.events).lines,
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
  args: {
    meetId: v.id("meets"),
    ...meetFields,
    /** Set once the super-user has confirmed the sign-ups this would clear. */
    allowDroppingEntries: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireSuperUser(ctx);
    const meet = await ctx.db.get(args.meetId);
    if (meet === null) throw new ConvexError("That meet no longer exists.");

    const { startDate, endDate } = cleanDates(args.startDate, args.endDate);
    const { lines, droppedIds } = prepareEvents(meet.events, args.events);
    await clearEntriesForDroppedLines(
      ctx,
      args.meetId,
      droppedIds,
      args.allowDroppingEntries,
    );

    await ctx.db.patch(args.meetId, {
      name: cleanName(args.name),
      startDate,
      endDate,
      venue: cleanOptionalText(args.venue, VENUE_MAX, "The venue"),
      course: args.course,
      galaCode: args.galaCode,
      events: lines,
      updatedAt: Date.now(),
      updatedBy: profile._id,
    });
    await syncEntryMeetDates(
      ctx,
      args.meetId,
      { startDate: meet.startDate, endDate: meet.endDate },
      { startDate, endDate },
    );
    return null;
  },
});

/**
 * Keep `meetEntries.meetStartDate` true after a date edit.
 *
 * The date is denormalised onto the entry so the meets list can read a club's
 * whole season from one index rather than one query per meet — the same trade
 * `attendance` makes with its `date`. Denormalised means maintained: a meet
 * moved to a new date has to carry its sign-ups with it.
 */
async function syncEntryMeetDates(
  ctx: MutationCtx,
  meetId: Id<"meets">,
  before: { startDate: string; endDate?: string },
  after: { startDate: string; endDate?: string },
): Promise<void> {
  if (before.startDate === after.startDate && before.endDate === after.endDate) {
    return;
  }
  const days = new Set(meetDates(after));
  const entries = await ctx.db
    .query("meetEntries")
    .withIndex("by_meet_line", (q) => q.eq("meetId", meetId))
    .take(MAX_ENTRIES);
  for (const entry of entries) {
    await ctx.db.patch(entry._id, {
      meetStartDate: after.startDate,
      // A meet moved to new dates leaves entries pointing at days it no longer
      // runs on. Pull those back to the first day rather than leaving a date
      // outside the meet: `ageAtSwim` is computed from this, so a stale day is
      // not a cosmetic problem.
      ...(days.has(entry.swimDate) ? {} : { swimDate: after.startDate }),
    });
  }
}

/**
 * Delete a meet — but only one nobody is signed up for.
 *
 * Two things now reference a meet, and they are treated differently on purpose.
 *
 * SIGN-UPS block the delete outright. They belong to coaches, not to the
 * super-user doing the deleting, and a meet with entries is a meet somebody is
 * still using; the message names the count so the refusal is actionable rather
 * than mysterious. A postponed meet is an edited date, not a delete.
 *
 * RESULTS do not block it. A swim genuinely happened whatever becomes of the
 * calendar row, and every result still carries the free-text `meetName` it was
 * logged with — so clearing the link loses the join and nothing else. Deleting
 * real times as a side effect of tidying the calendar would be far worse.
 */
export const deleteMeet = mutation({
  args: { meetId: v.id("meets") },
  returns: v.null(),
  handler: async (ctx, { meetId }) => {
    await requireSuperUser(ctx);
    const meet = await ctx.db.get(meetId);
    if (meet === null) return null; // already gone: deleting twice is not an error

    const entries = await ctx.db
      .query("meetEntries")
      .withIndex("by_meet_line", (q) => q.eq("meetId", meetId))
      .take(MAX_ENTRIES);
    if (entries.length > 0) {
      const swimmers = new Set(entries.map((e) => e.swimmerId)).size;
      throw new ConvexError(
        `${entries.length === 1 ? "There is 1 sign-up" : `There are ${entries.length} sign-ups`} on this meet, across ${swimmers === 1 ? "1 swimmer" : `${swimmers} swimmers`}. Remove them before deleting it.`,
      );
    }

    const linked = await ctx.db
      .query("results")
      .withIndex("by_meet", (q) => q.eq("meetId", meetId))
      .take(MAX_ENTRIES);
    for (const result of linked) {
      await ctx.db.patch(result._id, { meetId: undefined });
    }

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
    /** Set once the super-user has confirmed the sign-ups this would clear. */
    allowDroppingEntries: v.optional(v.boolean()),
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
      //
      // The programme itself is still replaced wholesale, but line IDENTITY
      // survives: `prepareEvents` re-matches each incoming line to the one it
      // corresponds to, so re-importing a corrected document keeps the coaches'
      // sign-ups instead of stranding them behind 60 freshly minted ids.
      const { lines, droppedIds } = prepareEvents(existing.events, args.events);
      await clearEntriesForDroppedLines(
        ctx,
        args.meetId,
        droppedIds,
        args.allowDroppingEntries,
      );

      await ctx.db.patch(args.meetId, {
        name,
        startDate,
        ...(endDate === undefined ? {} : { endDate }),
        ...(venue === undefined ? {} : { venue }),
        ...(args.course === undefined ? {} : { course: args.course }),
        ...(args.galaCode === undefined ? {} : { galaCode: args.galaCode }),
        events: lines,
        updatedAt: Date.now(),
        updatedBy: profile._id,
      });
      await syncEntryMeetDates(
        ctx,
        args.meetId,
        { startDate: existing.startDate, endDate: existing.endDate },
        { startDate, endDate: endDate ?? existing.endDate },
      );
      return { meetId: args.meetId, created: false, eventCount: lines.length };
    }

    const events = prepareEvents([], args.events).lines;

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
