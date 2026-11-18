import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  accessibleSwimmerIds,
  requireSignedIn,
  requireSuperUser,
  staffSwimmers,
} from "./authz";
import { loadMeetOrThrow, resultsBySwimmer } from "./meetEntriesShared";
import { cleanMeetDate } from "../lib/meets";
import {
  findMeetQualifyingPreset,
  meetQualifyingWindow,
  qualifySwimmerForMeet,
} from "../lib/meetQualifying";

/*
  A meet's OWN qualifying table and who has met it (lib/meetQualifying.ts).

  The table is global reference data, like the meet: the super-user attaches
  it, every role reads it. The VERDICTS are swimmer data and follow the normal
  read boundary — a viewer sees only their linked swimmers, a coach only their
  own club's, the Admin everyone. Nothing is stored per swimmer: qualification
  is derived from `results` at read time, so a time typed on Friday night shows
  up on Saturday morning with nothing to recompute.
*/

const courseV = v.union(v.literal("SCM"), v.literal("LCM"));
const strokeV = v.union(
  v.literal("FREE"),
  v.literal("BACK"),
  v.literal("BREAST"),
  v.literal("FLY"),
  v.literal("IM"),
);
const distanceV = v.union(
  v.literal(25),
  v.literal(50),
  v.literal(100),
  v.literal(200),
  v.literal(400),
  v.literal(800),
  v.literal(1500),
);
const cutV = v.object({
  gender: v.union(v.literal("M"), v.literal("F")),
  distance: distanceV,
  stroke: strokeV,
  age: v.number(),
  band: v.union(v.literal("EXACT"), v.literal("AND_UNDER"), v.literal("AND_OVER")),
  timeMs: v.number(),
});

async function tableForMeet(
  ctx: Parameters<typeof requireSignedIn>[0],
  meetId: Id<"meets">,
): Promise<Doc<"meetQualifying"> | null> {
  return await ctx.db
    .query("meetQualifying")
    .withIndex("by_meet", (q) => q.eq("meetId", meetId))
    .first();
}

/** The table itself — what the cut grid on the meet page draws. */
export const getMeetQualifyingTable = query({
  args: { meetId: v.id("meets") },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      course: courseV,
      qualifyingFrom: v.union(v.string(), v.null()),
      qualifyingTo: v.string(),
      presetKey: v.union(v.string(), v.null()),
      cuts: v.array(cutV),
    }),
  ),
  handler: async (ctx, { meetId }) => {
    await requireSignedIn(ctx);
    const meet = await ctx.db.get(meetId);
    if (meet === null) return null;
    const table = await tableForMeet(ctx, meetId);
    if (table === null) return null;
    const window = meetQualifyingWindow(table, meet.startDate);
    return {
      title: table.title,
      course: table.course,
      qualifyingFrom: window.qualifyingFrom,
      qualifyingTo: window.qualifyingTo,
      presetKey: table.presetKey ?? null,
      cuts: table.cuts,
    };
  },
});

const eventResultV = v.object({
  distance: distanceV,
  stroke: strokeV,
  cutMs: v.union(v.number(), v.null()),
  bestMs: v.union(v.number(), v.null()),
  bestDate: v.union(v.string(), v.null()),
  bestMeetName: v.union(v.string(), v.null()),
  met: v.boolean(),
  gapMs: v.union(v.number(), v.null()),
});

/**
 * Every swimmer the caller may read, judged against the meet's table.
 *
 * Null when the meet carries no table — the page then shows nothing, because
 * "no qualifying times" is the normal state of a meet, not an empty result.
 */
export const getMeetQualifiers = query({
  args: { meetId: v.id("meets") },
  returns: v.union(
    v.null(),
    v.object({
      viewer: v.boolean(),
      swimmers: v.array(
        v.object({
          swimmerId: v.id("swimmers"),
          name: v.string(),
          gender: v.union(v.literal("M"), v.literal("F")),
          exactAge: v.number(),
          metCount: v.number(),
          events: v.array(eventResultV),
        }),
      ),
    }),
  ),
  handler: async (ctx, { meetId }) => {
    const { profile, swimmerIds } = await accessibleSwimmerIds(ctx);
    const meet = await ctx.db.get(meetId);
    if (meet === null) return null;
    const table = await tableForMeet(ctx, meetId);
    if (table === null) return null;

    // The read boundary: linked swimmers for a viewer; the own club's ACTIVE
    // roster for a coach (the Admin: every club's).
    let swimmers: Doc<"swimmers">[];
    if (swimmerIds === "ALL") {
      swimmers = await staffSwimmers(ctx, profile, { activeOnly: true });
    } else {
      swimmers = [];
      for (const id of swimmerIds) {
        const s = await ctx.db.get(id);
        if (s !== null) swimmers.push(s);
      }
    }

    const history = await resultsBySwimmer(
      ctx,
      swimmers.map((s) => s._id),
    );

    const rows = swimmers.map((s) => {
      const verdict = qualifySwimmerForMeet(
        table,
        meet.startDate,
        { gender: s.gender, dob: s.dob },
        history.get(s._id) ?? [],
      );
      return {
        swimmerId: s._id,
        name: s.name,
        gender: s.gender,
        exactAge: verdict.exactAge,
        metCount: verdict.metCount,
        events: verdict.events,
      };
    });
    rows.sort((a, b) => b.metCount - a.metCount || a.name.localeCompare(b.name));

    return { viewer: swimmerIds !== "ALL", swimmers: rows };
  },
});

/**
 * Attach a published table to a meet (replacing any it already carries).
 *
 * The preset's cuts are COPIED onto the meet, so a later correction to the
 * preset list never silently re-judges a meet already set up.
 */
export const applyMeetQualifyingPreset = mutation({
  args: {
    meetId: v.id("meets"),
    presetKey: v.string(),
    qualifyingFrom: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { meetId, presetKey, qualifyingFrom }) => {
    const profile = await requireSuperUser(ctx);
    const meet = await loadMeetOrThrow(ctx, meetId);
    const preset = findMeetQualifyingPreset(presetKey);
    if (preset === null) {
      throw new ConvexError("That qualifying table isn't available.");
    }

    let from: string | undefined;
    if (qualifyingFrom !== undefined && qualifyingFrom.trim() !== "") {
      const clean = cleanMeetDate(qualifyingFrom);
      if (clean === null) {
        throw new ConvexError("The first counting day isn't a valid date.");
      }
      if (clean >= meet.startDate) {
        throw new ConvexError(
          "Swims must start counting before the meet does. Pick an earlier date.",
        );
      }
      from = clean;
    }

    const doc = {
      meetId,
      title: preset.title,
      course: preset.course,
      qualifyingFrom: from,
      presetKey: preset.key,
      cuts: [...preset.cuts],
      updatedAt: Date.now(),
      updatedBy: profile._id,
    };
    const existing = await tableForMeet(ctx, meetId);
    if (existing === null) {
      await ctx.db.insert("meetQualifying", doc);
    } else {
      await ctx.db.replace(existing._id, doc);
    }
    return null;
  },
});

/** Take a meet's qualifying table off. Nothing a swimmer did is touched. */
export const removeMeetQualifying = mutation({
  args: { meetId: v.id("meets") },
  returns: v.null(),
  handler: async (ctx, { meetId }) => {
    await requireSuperUser(ctx);
    const existing = await tableForMeet(ctx, meetId);
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  },
});
