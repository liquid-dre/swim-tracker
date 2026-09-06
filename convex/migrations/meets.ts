import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import {
  MEET_SEED,
  meetDates,
  newLineId,
  normaliseMeetName,
} from "../../lib/meets";

/*
  Seed the 2026/27 fixtures into `meets` (§R19).

  These 15 dates lived in `lib/galaCalendar.ts`, a hardcoded map whose only
  consumer was the /log meet-name pre-fill. That map was a second source of
  truth for a fact the calendar now owns — and had already drifted from the real
  programme (it dates the 1st seeded gala 12 Sep; the HAS programme says the
  11th). The file is gone; these rows replace it, and importing a real programme
  corrects them.

  Idempotent by a stable `seedKey` stamped on each row, NOT by (name, date).
  Those are exactly the fields an import corrects — keying on them would let a
  re-run resurrect "1st seeded, 12 Sep" beside the corrected "HAS 1ST SEEDED
  GALA 2026, 11 Sep", which is the duplicate this whole flow exists to prevent.

  It never updates or deletes: a row may have been corrected by hand or by an
  import, and a seed must not undo that.

  Run once from the Convex dashboard:  migrations/meets:seedMeets
*/

export type SeedMeetsResult = { inserted: number; skipped: number };

/** A seed entry's stable identity, independent of the fields an import corrects. */
function seedKeyFor(seed: { name: string; startDate: string }): string {
  return `${seed.startDate}|${seed.name}`;
}

export async function applySeedMeets(ctx: MutationCtx): Promise<SeedMeetsResult> {
  // The whole table, once: 15 seed rows against a season of tens is far cheaper
  // to diff in memory than 15 indexed lookups.
  const existing = await ctx.db.query("meets").take(500);
  const seen = new Set(existing.map((m) => m.seedKey).filter(Boolean));

  let inserted = 0;
  let skipped = 0;
  for (const seed of MEET_SEED) {
    const seedKey = seedKeyFor(seed);
    if (seen.has(seedKey)) {
      skipped++;
      continue;
    }
    await ctx.db.insert("meets", {
      name: seed.name,
      startDate: seed.startDate,
      events: [],
      seedKey,
      createdAt: Date.now(),
    });
    inserted++;
  }
  return { inserted, skipped };
}

export const seedMeets = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx) => await applySeedMeets(ctx),
});

/*
  ---------------------------------------------------------------------------
  Backfill: give every stored programme line an identity
  ---------------------------------------------------------------------------

  `meets.events[].id` is what a sign-up points at, and it is minted by
  `cleanEvents` on every write — so every programme written from now on has one.
  Rows written BEFORE that field shipped do not, which is why the schema still
  declares it optional.

  This closes that window. Until it has run, a legacy meet's lines cannot be
  entered (the entry layer matches on the line's own id and finds nothing), and
  the meet page says so rather than guessing at a line by its position. Run it
  in the same maintenance window as the deploy and the state never exists in
  practice; once it has run everywhere, the field is narrowed to required.

  Idempotent: a line that already has an id keeps it, byte for byte, because the
  id IS the link and reissuing one would strand every entry behind it.

  Run once from the Convex dashboard:  migrations/meets:backfillMeetEventIds
*/

export type BackfillMeetEventIdsResult = { meets: number; lines: number };

export async function applyBackfillMeetEventIds(
  ctx: MutationCtx,
): Promise<BackfillMeetEventIdsResult> {
  const all = await ctx.db.query("meets").take(500);

  let meets = 0;
  let lines = 0;
  for (const meet of all) {
    const missing = meet.events.filter((line) => line.id === undefined).length;
    if (missing === 0) continue;
    await ctx.db.patch(meet._id, {
      events: meet.events.map((line) =>
        line.id === undefined ? { ...line, id: newLineId() } : line,
      ),
    });
    meets++;
    lines += missing;
  }
  return { meets, lines };
}

export const backfillMeetEventIds = internalMutation({
  args: {},
  returns: v.object({ meets: v.number(), lines: v.number() }),
  handler: async (ctx) => await applyBackfillMeetEventIds(ctx),
});

/*
  ---------------------------------------------------------------------------
  Backfill: attach already-logged times to the meet they were swum at
  ---------------------------------------------------------------------------

  `results.meetName` has always been free text typed on the log form, so every
  swim already recorded carries the words but not the link. This sets `meetId`
  where the two agree beyond doubt: the result is a MEET swim, it is not linked
  yet, its date falls on one of the meet's days, and its name matches the meet's
  once both are normalised for case and spacing.

  It NEVER guesses. Two meets on the same day whose names both match a result is
  a genuine ambiguity, and it is counted and skipped rather than resolved by a
  coin flip — a wrongly attached swim would show on a meet a swimmer never
  attended, and nothing downstream would ever flag it.

  It also creates no entries. A linked legacy time with no sign-up is a real
  state the meet page renders as an unentered swim; inventing a sign-up after
  the fact would claim a coach planned something they never did.

  Run once from the Convex dashboard:  migrations/meets:linkResultsToMeets
*/

export type LinkResultsToMeetsResult = {
  scanned: number;
  linked: number;
  ambiguous: number;
};

export async function applyLinkResultsToMeets(
  ctx: MutationCtx,
): Promise<LinkResultsToMeetsResult> {
  const meets = await ctx.db.query("meets").take(500);

  // Candidate meets per day, so each result is matched against only the meets
  // that were actually running when it was swum.
  const byDay = new Map<string, typeof meets>();
  for (const meet of meets) {
    for (const day of meetDates(meet)) {
      const bucket = byDay.get(day);
      if (bucket === undefined) byDay.set(day, [meet]);
      else bucket.push(meet);
    }
  }

  let scanned = 0;
  let linked = 0;
  let ambiguous = 0;
  for (const [day, candidates] of byDay) {
    const results = await ctx.db
      .query("results")
      .withIndex("by_date", (q) => q.eq("swimDate", day))
      .take(2000);

    for (const result of results) {
      if (result.swimType !== "MEET") continue;
      if (result.meetId !== undefined) continue;
      if (result.meetName === undefined) continue;
      scanned++;

      const name = normaliseMeetName(result.meetName);
      const hits = candidates.filter((m) => normaliseMeetName(m.name) === name);
      if (hits.length !== 1) {
        if (hits.length > 1) ambiguous++;
        continue;
      }
      await ctx.db.patch(result._id, { meetId: hits[0]._id });
      linked++;
    }
  }
  return { scanned, linked, ambiguous };
}

export const linkResultsToMeets = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    linked: v.number(),
    ambiguous: v.number(),
  }),
  handler: async (ctx) => await applyLinkResultsToMeets(ctx),
});
