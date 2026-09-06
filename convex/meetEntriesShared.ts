import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  genderAllowsSwimmer,
  lineById,
  meetDates,
  meetEventLabel,
  MEET_GENDER_LABEL,
  type MeetEvent,
} from "../lib/meets";
import { pbBefore, type HeadlinePB, type ResultForPB } from "../lib/swim";

/*
  Shared server helpers for meet sign-ups (§R19). Ctx-bound, so they live here
  rather than in the pure lib/meetEntries. No registered functions.

  The boundary these enforce is the one that makes meets unusual: the MEET is
  global reference data the super-user owns, but an ENTRY on it is club-scoped
  and coach-owned, exactly like attendance. So a coach may sign their own
  swimmers up for a fixture they cannot themselves edit — and can never see, or
  touch, another club's entries on the same fixture.
*/

/** A club's entries on one meet — the sheet is never bigger than this. */
export const MAX_ENTRIES_PER_MEET = 2000;
/** A club's whole season of entries, for the meets-list counts. */
export const MAX_ENTRIES_PER_CLUB = 5000;
/** One swimmer's history, matching personalBests.ts' own bound. */
export const RESULTS_LIMIT = 2000;

/**
 * The club a coach acts for. Entries are club-scoped, so a staff account with
 * no club has nobody to enter and is told so rather than silently seeing an
 * empty sheet.
 */
export function requireClub(profile: Doc<"profiles">): Id<"clubs"> {
  if (!profile.clubId) {
    throw new ConvexError(
      "You aren't assigned to a club yet. Ask an admin to add you to one.",
    );
  }
  return profile.clubId;
}

export async function loadMeetOrThrow(
  ctx: QueryCtx | MutationCtx,
  meetId: Id<"meets">,
): Promise<Doc<"meets">> {
  const meet = await ctx.db.get(meetId);
  if (meet === null) throw new ConvexError("That meet no longer exists.");
  return meet;
}

/**
 * The programme line an entry points at.
 *
 * A line stored before ids shipped matches nothing, which is deliberate: the
 * alternative is guessing at a line by its position, and a wrong guess signs a
 * swimmer up for the wrong race. Until the backfill has run, such a meet simply
 * cannot take entries, and the screen says so.
 */
export function lineOrThrow(meet: Doc<"meets">, lineId: string): MeetEvent {
  const line = lineById(meet.events, lineId);
  if (line === null) {
    throw new ConvexError("That event is no longer on this meet's programme.");
  }
  return line;
}

/** A day the meet actually runs on — `ageAtSwim` is computed from it. */
export function cleanEntryDay(meet: Doc<"meets">, swimDate: string | undefined): string {
  const days = meetDates(meet);
  if (swimDate === undefined) return days[0] ?? meet.startDate;
  if (!days.includes(swimDate)) {
    throw new ConvexError(
      days.length === 1
        ? `This meet runs on ${days[0]} only.`
        : `This meet runs ${days[0]}–${days[days.length - 1]}; ${swimDate} is not one of its days.`,
    );
  }
  return swimDate;
}

/**
 * The sex-scope rule, as a refusal that names both sides.
 *
 * A Girls event takes girls. The check exists because it is the mistake a coach
 * working quickly down a roster will actually make, and nothing downstream
 * would ever surface it — a boy in a girls' race simply looks like a sign-up.
 */
export function assertGenderAllowed(
  line: MeetEvent,
  swimmer: Doc<"swimmers">,
): void {
  if (genderAllowsSwimmer(line.gender, swimmer.gender)) return;
  throw new ConvexError(
    `${meetEventLabel(line)} is a ${MEET_GENDER_LABEL[line.gender!]} event — ${swimmer.name} can't be entered.`,
  );
}

/** This club's entries on one meet. */
export async function entriesForClubAtMeet(
  ctx: QueryCtx | MutationCtx,
  clubId: Id<"clubs">,
  meetId: Id<"meets">,
): Promise<Doc<"meetEntries">[]> {
  return await ctx.db
    .query("meetEntries")
    .withIndex("by_club_meet", (q) => q.eq("clubId", clubId).eq("meetId", meetId))
    .take(MAX_ENTRIES_PER_MEET);
}

/** One swimmer's entries on one meet, whoever entered them. */
export async function entriesForSwimmerAtMeet(
  ctx: QueryCtx | MutationCtx,
  swimmerId: Id<"swimmers">,
  meetId: Id<"meets">,
): Promise<Doc<"meetEntries">[]> {
  return await ctx.db
    .query("meetEntries")
    .withIndex("by_swimmer_meet", (q) =>
      q.eq("swimmerId", swimmerId).eq("meetId", meetId),
    )
    .take(MAX_ENTRIES_PER_MEET);
}

/** The entry a result is attached to, if any. */
export async function entryForResult(
  ctx: QueryCtx | MutationCtx,
  resultId: Id<"results">,
): Promise<Doc<"meetEntries"> | null> {
  return await ctx.db
    .query("meetEntries")
    .withIndex("by_result", (q) => q.eq("resultId", resultId))
    .first();
}

/**
 * Every swim by these swimmers, keyed by swimmer.
 *
 * Read once per SWIMMER rather than once per entry: a coach's sheet for a whole
 * meet can hold two hundred entries across thirty swimmers, and the PB going
 * into the meet is a fact about the swimmer's history, not about the entry.
 */
export async function resultsBySwimmer(
  ctx: QueryCtx | MutationCtx,
  swimmerIds: ReadonlyArray<Id<"swimmers">>,
): Promise<Map<Id<"swimmers">, Doc<"results">[]>> {
  const out = new Map<Id<"swimmers">, Doc<"results">[]>();
  for (const swimmerId of new Set(swimmerIds)) {
    out.set(
      swimmerId,
      await ctx.db
        .query("results")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmerId))
        .take(RESULTS_LIMIT),
    );
  }
  return out;
}

/**
 * The PB this swimmer took into this meet for this line's event, or null when
 * there is nothing to compare against.
 *
 * Null has three genuinely different causes and the UI distinguishes them: the
 * meet has no course set (nothing can be compared), the line is not a tracked
 * event (a relay time is a team's), or the swimmer has simply never raced it —
 * which is what makes their time on the day their first.
 */
export function pbBeforeMeet(
  rows: ReadonlyArray<ResultForPB>,
  meet: Doc<"meets">,
  line: MeetEvent,
): HeadlinePB | null {
  if (meet.course === undefined) return null;
  if (line.distance === undefined || line.stroke === undefined) return null;
  return pbBefore(
    rows,
    { distance: line.distance, stroke: line.stroke, course: meet.course },
    meet.startDate,
  );
}
