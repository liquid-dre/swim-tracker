import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireCoach } from "./authz";
import { cleanIsoDate, resolveSeasonEnd, todayIso } from "./attendanceLib";
import { rollingSeasonStart } from "../lib/swim";

/*
  Attendance insights (§R18) — coach-only analytics over the season. Per-swimmer
  and per-squad rates plus a worst-attenders slice, so a coach can see who's been
  skipping without opening every session. LATE counts as attended; EXCUSED is
  excluded from the denominator (a fair rate). No export in v1. Viewers never call
  this. Rates are aggregated from each swimmer's own marks; a swimmer in several
  squads contributes to each of their squads' figures.
*/

type Counts = { present: number; absent: number; late: number; excused: number };

function emptyCounts(): Counts {
  return { present: 0, absent: 0, late: 0, excused: 0 };
}

function addStatus(c: Counts, status: string): void {
  if (status === "PRESENT") c.present++;
  else if (status === "ABSENT") c.absent++;
  else if (status === "LATE") c.late++;
  else if (status === "EXCUSED") c.excused++;
}

function ratesFromCounts(c: Counts) {
  const attended = c.present + c.late;
  const eligible = attended + c.absent;
  return {
    ...c,
    marked: c.present + c.absent + c.late + c.excused,
    attended,
    eligible,
    ratePct: eligible > 0 ? Math.round((attended / eligible) * 100) : null,
  };
}

const ratesShape = {
  present: v.number(),
  absent: v.number(),
  late: v.number(),
  excused: v.number(),
  marked: v.number(),
  attended: v.number(),
  eligible: v.number(),
  ratePct: v.union(v.number(), v.null()),
};

export const getAttendanceInsights = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    squadId: v.optional(v.id("squads")),
  },
  returns: v.object({
    from: v.string(),
    to: v.string(),
    overall: v.object(ratesShape),
    perSquad: v.array(
      v.object({
        squadId: v.id("squads"),
        squadName: v.string(),
        swimmerCount: v.number(),
        ...ratesShape,
      }),
    ),
    perSwimmer: v.array(
      v.object({
        swimmerId: v.id("swimmers"),
        name: v.string(),
        ...ratesShape,
      }),
    ),
    worstAttenders: v.array(
      v.object({
        swimmerId: v.id("swimmers"),
        name: v.string(),
        ratePct: v.number(),
        eligible: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const profile = await requireCoach(ctx);
    const emptyResult = (from: string, to: string) => ({
      from,
      to,
      overall: ratesFromCounts(emptyCounts()),
      perSquad: [],
      perSwimmer: [],
      worstAttenders: [],
    });

    // Season window (custom or rolling default, capped).
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "app"))
      .unique();
    const seasonStart = settings?.seasonStart ?? rollingSeasonStart(todayIso());
    const from = cleanIsoDate(args.from ?? "") ?? seasonStart;
    const to =
      cleanIsoDate(args.to ?? "") ?? resolveSeasonEnd(seasonStart, settings?.seasonEnd ?? null);

    if (!profile.clubId) return emptyResult(from, to);

    // The club's active swimmers, optionally narrowed to one squad.
    let swimmers = await ctx.db
      .query("swimmers")
      .withIndex("by_club", (q) => q.eq("clubId", profile.clubId!))
      .take(2000);
    swimmers = swimmers.filter((s) => s.active);

    let squadFilterMembers: Set<string> | null = null;
    if (args.squadId) {
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_squad", (q) => q.eq("squadId", args.squadId!))
        .take(2000);
      squadFilterMembers = new Set(memberships.map((m) => String(m.swimmerId)));
      swimmers = swimmers.filter((s) => squadFilterMembers!.has(String(s._id)));
    }

    const overall = emptyCounts();
    const squadCounts = new Map<string, { name: string; counts: Counts; members: Set<string> }>();
    const perSwimmer = [];

    for (const swimmer of swimmers) {
      const rows = await ctx.db
        .query("attendance")
        .withIndex("by_swimmer_date", (q) =>
          q.eq("swimmerId", swimmer._id).gte("date", from).lte("date", to),
        )
        .take(2000);

      const counts = emptyCounts();
      for (const r of rows) {
        addStatus(counts, r.status);
        addStatus(overall, r.status);
      }
      perSwimmer.push({ swimmerId: swimmer._id, name: swimmer.name, ...ratesFromCounts(counts) });

      // Attribute this swimmer's counts to each squad they belong to.
      const memberships = await ctx.db
        .query("squadMemberships")
        .withIndex("by_swimmer", (q) => q.eq("swimmerId", swimmer._id))
        .take(100);
      for (const m of memberships) {
        if (args.squadId && m.squadId !== args.squadId) continue;
        const key = String(m.squadId);
        let entry = squadCounts.get(key);
        if (!entry) {
          const squad = await ctx.db.get(m.squadId);
          entry = { name: squad?.name ?? "Unknown squad", counts: emptyCounts(), members: new Set() };
          squadCounts.set(key, entry);
        }
        entry.counts.present += counts.present;
        entry.counts.absent += counts.absent;
        entry.counts.late += counts.late;
        entry.counts.excused += counts.excused;
        entry.members.add(String(swimmer._id));
      }
    }

    const perSquad = [...squadCounts.entries()].map(([key, entry]) => ({
      squadId: key as unknown as Id<"squads">,
      squadName: entry.name,
      swimmerCount: entry.members.size,
      ...ratesFromCounts(entry.counts),
    }));
    perSquad.sort((a, b) => a.squadName.localeCompare(b.squadName));

    perSwimmer.sort((a, b) => a.name.localeCompare(b.name));

    const worstAttenders = perSwimmer
      .filter((s) => s.eligible > 0 && s.ratePct !== null)
      .sort((a, b) => (a.ratePct as number) - (b.ratePct as number))
      .slice(0, 10)
      .map((s) => ({
        swimmerId: s.swimmerId,
        name: s.name,
        ratePct: s.ratePct as number,
        eligible: s.eligible,
      }));

    return {
      from,
      to,
      overall: ratesFromCounts(overall),
      perSquad,
      perSwimmer,
      worstAttenders,
    };
  },
});
