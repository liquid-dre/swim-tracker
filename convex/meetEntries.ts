import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  accessibleSwimmerIds,
  assertCoachManagesSwimmer,
  requireCoach,
  requireSuperUser,
} from "./authz";
import { galaCodeValidator } from "./galas";
import {
  assertValidEvent,
  describeMeetSwim,
  parseTimeBounded,
} from "./resultsShared";
import {
  assertGenderAllowed,
  cleanEntryDay,
  entriesForClubAtMeet,
  entriesForSwimmerAtMeet,
  lineOrThrow,
  loadMeetOrThrow,
  MAX_ENTRIES_PER_CLUB,
  pbBeforeMeet,
  requireClub,
  resultsBySwimmer,
} from "./meetEntriesShared";
import { tallyEntriesByMeet } from "../lib/meetEntries";
import {
  compareMeetEvents,
  genderAllowsSwimmer,
  meetDates,
  meetEventLabel,
  type MeetEvent,
} from "../lib/meets";
import { compareToPbBefore, computeAge } from "../lib/swim";

/*
  Meet sign-ups (§R19) — who is swimming what, and what they went.

  ONE ROW, WHOLE LIFE. A `meetEntries` row is a plan before the meet and the
  swim after it: typing a time on it creates a real `results` doc and links it
  back. There is no separate "the entry became a result" state, so the two can
  never disagree.

  TWO BOUNDARIES, NOT ONE. The meet is global reference data only the
  super-user writes (`convex/meets.ts`); an entry on it is club-scoped and
  coach-owned. So every function here is `requireCoach` plus
  `assertCoachManagesSwimmer` on each swimmer touched, and every read is seeked
  by the caller's own club — a coach never sees, and can never touch, another
  club's entries on the same fixture.

  A TIME HERE IS A TIME ANYWHERE. Recording one goes through `resultsShared`,
  the same seam the log form uses, so a swim entered poolside is parsed, dated
  and judged exactly as one typed on /log. `swimType` is not a parameter: an
  entry is on a meet's programme, so the swim is a MEET swim.
*/

const entryRow = v.object({
  _id: v.id("meetEntries"),
  swimmerId: v.id("swimmers"),
  name: v.string(),
  swimDate: v.string(),
  /** The swimmer no longer matches the line's sex scope — flagged, never dropped. */
  genderMismatch: v.boolean(),
  resultId: v.union(v.id("results"), v.null()),
  timeMs: v.union(v.number(), v.null()),
  /** The PB they took INTO this meet; null when there is nothing to compare. */
  pbBeforeMs: v.union(v.number(), v.null()),
  /** Signed, positive = faster than the mark they came in with. */
  deltaMs: v.union(v.number(), v.null()),
  newPb: v.boolean(),
  firstTime: v.boolean(),
});

const lineRow = v.object({
  lineId: v.string(),
  eventNumber: v.union(v.number(), v.null()),
  rawLabel: v.string(),
  label: v.string(),
  gender: v.union(v.literal("M"), v.literal("F"), v.literal("MIXED"), v.null()),
  distance: v.union(v.number(), v.null()),
  stroke: v.union(v.string(), v.null()),
  /** The line maps to a real event, so a swimmer can be entered and timed. */
  resolved: v.boolean(),
  entered: v.number(),
  timed: v.number(),
  entries: v.array(entryRow),
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The whole sign-up sheet for one meet, scoped to the caller's club.
 *
 * One subscription serves both surfaces: the Entered column on the programme
 * table and whichever line's sheet is open. A meet's entries are tens of rows,
 * so splitting this into a per-line query would buy nothing but a second
 * round-trip every time a coach opens a different event.
 *
 * The PB going into the meet is computed from each SWIMMER's history read once,
 * not once per entry — thirty swimmers rather than two hundred entries.
 */
export const getMeetSignups = query({
  args: { meetId: v.id("meets") },
  returns: v.object({
    /** False when the meet has no course: entries are fine, times are not. */
    courseKnown: v.boolean(),
    /** The meet's days — a single-day meet needs no day control at all. */
    days: v.array(v.string()),
    lines: v.array(lineRow),
  }),
  handler: async (ctx, { meetId }) => {
    const profile = await requireCoach(ctx);
    const meet = await loadMeetOrThrow(ctx, meetId);

    const entries = profile.clubId
      ? await entriesForClubAtMeet(ctx, profile.clubId, meetId)
      : [];

    const swimmers = new Map<Id<"swimmers">, Doc<"swimmers">>();
    for (const id of new Set(entries.map((e) => e.swimmerId))) {
      const swimmer = await ctx.db.get(id);
      if (swimmer !== null) swimmers.set(id, swimmer);
    }
    const history = await resultsBySwimmer(ctx, [...swimmers.keys()]);

    const results = new Map<Id<"results">, Doc<"results">>();
    for (const entry of entries) {
      if (entry.resultId === undefined) continue;
      const result = await ctx.db.get(entry.resultId);
      if (result !== null) results.set(entry.resultId, result);
    }

    const byLine = new Map<string, Doc<"meetEntries">[]>();
    for (const entry of entries) {
      const bucket = byLine.get(entry.lineId);
      if (bucket === undefined) byLine.set(entry.lineId, [entry]);
      else bucket.push(entry);
    }

    const lines = [...meet.events]
      .sort(compareMeetEvents)
      .filter((line): line is MeetEvent & { id: string } => line.id !== undefined)
      .map((line) => {
        const rows = (byLine.get(line.id) ?? [])
          .map((entry) => {
            const swimmer = swimmers.get(entry.swimmerId);
            const result =
              entry.resultId === undefined ? null : results.get(entry.resultId) ?? null;
            const pb = swimmer
              ? pbBeforeMeet(history.get(entry.swimmerId) ?? [], meet, line)
              : null;
            const comparison = compareToPbBefore(result?.timeMs ?? null, pb?.timeMs ?? null);
            return {
              _id: entry._id,
              swimmerId: entry.swimmerId,
              name: swimmer?.name ?? "Unknown swimmer",
              swimDate: entry.swimDate,
              genderMismatch:
                swimmer !== undefined &&
                !genderAllowsSwimmer(line.gender, swimmer.gender),
              resultId: entry.resultId ?? null,
              ...comparison,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          lineId: line.id,
          eventNumber: line.eventNumber ?? null,
          rawLabel: line.rawLabel,
          label: meetEventLabel(line),
          gender: line.gender ?? null,
          distance: line.distance ?? null,
          stroke: line.stroke ?? null,
          resolved: line.distance !== undefined && line.stroke !== undefined,
          entered: rows.length,
          timed: rows.filter((r) => r.resultId !== null).length,
          entries: rows,
        };
      });

    return { courseKnown: meet.course !== undefined, days: meetDates(meet), lines };
  },
});

/**
 * A club's sign-up counts for every meet in a date window.
 *
 * The meets list needs a number on every row, so this reads the club's whole
 * range in one seek and tallies it, rather than firing a query per meet.
 */
export const getEntryCounts = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(
    v.object({
      meetId: v.id("meets"),
      entered: v.number(),
      timed: v.number(),
    }),
  ),
  handler: async (ctx, { from, to }) => {
    const profile = await requireCoach(ctx);
    if (!profile.clubId) return [];

    const entries = await ctx.db
      .query("meetEntries")
      .withIndex("by_club_date", (q) =>
        q.eq("clubId", profile.clubId!).gte("meetStartDate", from).lte("meetStartDate", to),
      )
      .take(MAX_ENTRIES_PER_CLUB);

    return [...tallyEntriesByMeet(entries.map((e) => ({ ...e, meetId: String(e.meetId) })))].map(
      ([meetId, tally]) => ({
        meetId: meetId as Id<"meets">,
        entered: tally.entered,
        timed: tally.timed,
      }),
    );
  },
});

/**
 * Sign-ups per programme line, across EVERY club.
 *
 * Deliberately not club-scoped, unlike the sheet. This is what the programme
 * editor warns from, and the warning has to match the refusal: the super-user
 * owns the programme, so the number they see before removing a line must be
 * every club's sign-ups on it, not their own club's — otherwise a line reading
 * "nobody is entered" could still take another club's entries with it.
 */
export const getLineEntryCounts = query({
  args: { meetId: v.id("meets") },
  returns: v.array(v.object({ lineId: v.string(), entered: v.number() })),
  handler: async (ctx, { meetId }) => {
    await requireSuperUser(ctx);
    const entries = await ctx.db
      .query("meetEntries")
      .withIndex("by_meet_line", (q) => q.eq("meetId", meetId))
      .take(MAX_ENTRIES_PER_CLUB);

    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.lineId, (counts.get(entry.lineId) ?? 0) + 1);
    }
    return [...counts].map(([lineId, entered]) => ({ lineId, entered }));
  },
});

/**
 * What the swimmers a viewer is linked to are down for at one meet.
 *
 * A programme runs to sixty lines and four of them concern this family, so the
 * answer is their entries — not the programme with theirs marked. Staff get an
 * empty list: their view of a meet is the sign-up sheet, which is a different
 * question asked by a different query.
 */
export const getMyMeetEntries = query({
  args: { meetId: v.id("meets") },
  returns: v.array(
    v.object({
      swimmerId: v.id("swimmers"),
      name: v.string(),
      entries: v.array(
        v.object({
          _id: v.id("meetEntries"),
          lineId: v.string(),
          eventNumber: v.union(v.number(), v.null()),
          label: v.string(),
          swimDate: v.string(),
          timeMs: v.union(v.number(), v.null()),
          pbBeforeMs: v.union(v.number(), v.null()),
          deltaMs: v.union(v.number(), v.null()),
          newPb: v.boolean(),
          firstTime: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { meetId }) => {
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    if (swimmerIds === "ALL") return [];

    const meet = await loadMeetOrThrow(ctx, meetId);
    const history = await resultsBySwimmer(ctx, swimmerIds);

    const out = [];
    for (const swimmerId of swimmerIds) {
      const swimmer = await ctx.db.get(swimmerId);
      if (swimmer === null) continue;

      const entries = await entriesForSwimmerAtMeet(ctx, swimmerId, meetId);
      if (entries.length === 0) continue;

      const rows = [];
      for (const entry of entries) {
        const line = meet.events.find((e) => e.id === entry.lineId);
        const result =
          entry.resultId === undefined ? null : await ctx.db.get(entry.resultId);
        const pb =
          line === undefined ? null : pbBeforeMeet(history.get(swimmerId) ?? [], meet, line);
        rows.push({
          _id: entry._id,
          lineId: entry.lineId,
          eventNumber: entry.eventNumber ?? null,
          // The entry's own denormalised label, so an entry survives a line
          // being re-worded and still says what it was for.
          label: line === undefined ? entry.rawLabel : meetEventLabel(line),
          swimDate: entry.swimDate,
          ...compareToPbBefore(result?.timeMs ?? null, pb?.timeMs ?? null),
        });
      }
      rows.sort(
        (a, b) =>
          (a.eventNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.eventNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.label.localeCompare(b.label),
      );
      out.push({ swimmerId, name: swimmer.name, entries: rows });
    }
    return out;
  },
});

/** How many events each linked swimmer is down for, per meet — the list badge. */
export const getMyEntryCounts = query({
  args: {},
  returns: v.array(v.object({ meetId: v.id("meets"), entered: v.number() })),
  handler: async (ctx) => {
    const { swimmerIds } = await accessibleSwimmerIds(ctx);
    if (swimmerIds === "ALL") return [];

    const counts = new Map<Id<"meets">, number>();
    for (const swimmerId of swimmerIds) {
      const entries = await ctx.db
        .query("meetEntries")
        .withIndex("by_swimmer_meet", (q) => q.eq("swimmerId", swimmerId))
        .take(MAX_ENTRIES_PER_CLUB);
      for (const entry of entries) {
        counts.set(entry.meetId, (counts.get(entry.meetId) ?? 0) + 1);
      }
    }
    return [...counts].map(([meetId, entered]) => ({ meetId, entered }));
  },
});

// ---------------------------------------------------------------------------
// Writes — coach-owned, club-scoped
// ---------------------------------------------------------------------------

/** The context every entry mutation needs, with both boundaries already checked. */
async function entryContext(ctx: MutationCtx, entryId: Id<"meetEntries">) {
  const profile = await requireCoach(ctx);
  const entry = await ctx.db.get(entryId);
  if (entry === null) throw new ConvexError("That sign-up no longer exists.");

  const swimmer = await ctx.db.get(entry.swimmerId);
  if (swimmer === null) throw new ConvexError("Swimmer not found.");
  assertCoachManagesSwimmer(profile, swimmer);

  const meet = await loadMeetOrThrow(ctx, entry.meetId);
  return { profile, entry, swimmer, meet, line: lineOrThrow(meet, entry.lineId) };
}

/** The denormalised facts an entry carries from its line. */
function denormalise(line: MeetEvent) {
  return {
    rawLabel: line.rawLabel,
    ...(line.eventNumber === undefined ? {} : { eventNumber: line.eventNumber }),
    ...(line.distance === undefined
      ? {}
      : { distance: line.distance, stroke: line.stroke }),
  };
}

/**
 * Sign swimmers up for one event.
 *
 * Idempotent by (meet, line, swimmer): adding a swimmer already on the sheet is
 * counted as skipped rather than refused, so a coach who ticks a name twice
 * gets the state they wanted instead of an error about the state they already
 * had.
 */
export const addEntries = mutation({
  args: {
    meetId: v.id("meets"),
    lineId: v.string(),
    swimmerIds: v.array(v.id("swimmers")),
    swimDate: v.optional(v.string()),
  },
  returns: v.object({ added: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const clubId = requireClub(profile);
    const meet = await loadMeetOrThrow(ctx, args.meetId);
    const line = lineOrThrow(meet, args.lineId);
    const swimDate = cleanEntryDay(meet, args.swimDate);

    if (args.swimmerIds.length > 100) {
      throw new ConvexError("That is more swimmers than one event can take at once.");
    }

    const existing = new Set(
      (await entriesForClubAtMeet(ctx, clubId, args.meetId))
        .filter((e) => e.lineId === args.lineId)
        .map((e) => String(e.swimmerId)),
    );

    let added = 0;
    let skipped = 0;
    for (const swimmerId of new Set(args.swimmerIds)) {
      if (existing.has(String(swimmerId))) {
        skipped++;
        continue;
      }
      const swimmer = await ctx.db.get(swimmerId);
      if (swimmer === null) throw new ConvexError("Swimmer not found.");
      assertCoachManagesSwimmer(profile, swimmer);
      if (!swimmer.active) {
        throw new ConvexError(`${swimmer.name} is no longer on the active roster.`);
      }
      assertGenderAllowed(line, swimmer);

      await ctx.db.insert("meetEntries", {
        meetId: args.meetId,
        lineId: args.lineId,
        swimmerId,
        clubId,
        meetStartDate: meet.startDate,
        swimDate,
        ...denormalise(line),
        enteredBy: profile._id,
        createdAt: Date.now(),
      });
      added++;
    }
    return { added, skipped };
  },
});

/**
 * Take a swimmer off an event.
 *
 * Refused once a time is recorded. Removing a sign-up is a change of plan;
 * deleting a swim is a change to the record, and that belongs on the tombstoned
 * `deleteResult` path where it is audited — not as a side effect here.
 */
export const removeEntry = mutation({
  args: { entryId: v.id("meetEntries") },
  returns: v.null(),
  handler: async (ctx, { entryId }) => {
    const profile = await requireCoach(ctx);
    const entry = await ctx.db.get(entryId);
    if (entry === null) return null; // already gone: removing twice is not an error

    const swimmer = await ctx.db.get(entry.swimmerId);
    if (swimmer === null) throw new ConvexError("Swimmer not found.");
    assertCoachManagesSwimmer(profile, swimmer);

    if (entry.resultId !== undefined) {
      throw new ConvexError(
        `${swimmer.name} has a time recorded for this event. Delete the time first — taking a swimmer off an event never removes a swim.`,
      );
    }
    await ctx.db.delete(entryId);
    return null;
  },
});

/** Move an entry to a different day of a multi-day meet. */
export const setEntryDay = mutation({
  args: { entryId: v.id("meetEntries"), swimDate: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, entry, swimmer, meet } = await entryContext(ctx, args.entryId);
    const swimDate = cleanEntryDay(meet, args.swimDate);

    await ctx.db.patch(entry._id, {
      swimDate,
      lastEditedBy: profile._id,
      updatedAt: Date.now(),
    });

    // The swim moved with the entry: it is the same race on a different day, and
    // `ageAtSwim` is computed from the date, so it has to move too.
    if (entry.resultId !== undefined) {
      await ctx.db.patch(entry.resultId, {
        swimDate,
        ageAtSwim: computeAge(swimmer.dob, swimDate),
        lastEditedBy: profile._id,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Record (or correct) the time a swimmer went in this event.
 *
 * Two "new PB" facts come back, and they are different questions:
 *
 *  - `newPb` — beat every previous MEET swim, the app-wide §4.6 rule. This is
 *    what the toast says, so the feedback reads identically to the log form's.
 *  - `newPbForMeet` — beat the mark they took INTO this meet. This is what the
 *    row badge shows, because "did they improve at this meet" is the question a
 *    coach is asking while typing up results.
 *
 * They diverge honestly: a swimmer who already went faster later in the season
 * still improved on the day. Do not collapse them.
 */
export const recordEntryTime = mutation({
  args: { entryId: v.id("meetEntries"), timeInput: v.string() },
  returns: v.object({
    resultId: v.id("results"),
    newPb: v.boolean(),
    newPbForMeet: v.boolean(),
    newlyMetGala: v.union(galaCodeValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const { profile, entry, swimmer, meet, line } = await entryContext(ctx, args.entryId);

    // A time needs a course before it can mean anything: a PB is per course and
    // never borrowed (§4.2), so guessing one here would file the swim in the
    // wrong pool and nothing downstream would ever flag it.
    if (meet.course === undefined) {
      throw new ConvexError(
        "Set this meet's course before recording times — a time in the wrong course can't be compared with anything.",
      );
    }
    if (line.distance === undefined || line.stroke === undefined) {
      throw new ConvexError(
        `"${line.rawLabel}" isn't an event this app tracks, so there is no time to record against it. A relay time belongs to the team, not to one swimmer.`,
      );
    }
    // Catches the combination the programme editor disables rather than hides:
    // 100 IM and 25 m are short-course only.
    await assertValidEvent(ctx, line.distance, line.stroke, meet.course);

    const timeMs = parseTimeBounded(args.timeInput);
    const swimDate = cleanEntryDay(meet, entry.swimDate);
    if (swimDate > new Date().toISOString().slice(0, 10)) {
      throw new ConvexError("That day hasn't happened yet.");
    }

    const meaning = await describeMeetSwim(ctx, {
      swimmer,
      distance: line.distance,
      stroke: line.stroke,
      course: meet.course,
      timeMs,
      swimType: "MEET",
      excludeResultId: entry.resultId,
    });

    const history = (
      await ctx.db
        .query("results")
        .withIndex("by_event", (q) =>
          q
            .eq("swimmerId", entry.swimmerId)
            .eq("distance", line.distance!)
            .eq("stroke", line.stroke!)
            .eq("course", meet.course!),
        )
        .take(1000)
    ).filter((r) => r._id !== entry.resultId);
    const pb = pbBeforeMeet(history, meet, line);
    const newPbForMeet = compareToPbBefore(timeMs, pb?.timeMs ?? null).newPb;

    if (entry.resultId !== undefined) {
      await ctx.db.patch(entry.resultId, {
        timeMs,
        swimDate,
        ageAtSwim: computeAge(swimmer.dob, swimDate),
        lastEditedBy: profile._id,
        updatedAt: Date.now(),
      });
      return { resultId: entry.resultId, newPbForMeet, ...meaning };
    }

    const resultId = await ctx.db.insert("results", {
      swimmerId: entry.swimmerId,
      distance: line.distance,
      stroke: line.stroke,
      course: meet.course,
      timeMs,
      // Not a parameter: an entry is a line on a meet's programme, so the swim
      // is a MEET swim and counts toward the headline PB.
      swimType: "MEET",
      swimDate,
      ageAtSwim: computeAge(swimmer.dob, swimDate),
      meetId: meet._id,
      meetName: meet.name,
      ...(meet.venue === undefined ? {} : { venue: meet.venue }),
      enteredBy: profile._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch(entry._id, {
      resultId,
      lastEditedBy: profile._id,
      updatedAt: Date.now(),
    });
    return { resultId, newPbForMeet, ...meaning };
  },
});
