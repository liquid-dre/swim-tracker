import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { MEET_SEED } from "../../lib/meets";

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
