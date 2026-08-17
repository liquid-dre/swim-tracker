import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { parseTime } from "../lib/swim";
import { GALA_ORDER, type GalaCode } from "../lib/galas";

/*
  Galas end-to-end (§4.2, §4.9): the two rules this change turns on, exercised
  through the real queries rather than the pure helpers.

    1. EITHER COURSE QUALIFIES. Every gala publishes separate long- and
       short-course standards and both are valid for entry, so a short-course
       meet PB that clears the short-course cut makes a swimmer qualified — and a
       cut is NEVER borrowed across courses.
    2. ENTRY WINDOWS. Outside a gala's age range there is no cut to chase, so an
       under-age swimmer is never listed however fast they are.

  Plus the seeding migration, which must be safe to re-run.
*/

// Modules convex-test needs to see (it cannot glob in this setup).
const modules = import.meta.glob("./**/*.ts");

/** A swimmer who is comfortably inside SANY's 17-25 window today. */
function dobForAge(age: number): string {
  const now = new Date();
  return `${now.getUTCFullYear() - age}-01-01`;
}

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const club = await ctx.db.insert("clubs", {
      name: "Test Club",
      createdAt: 0,
    });
    const coachUser = await ctx.db.insert("users", {
      name: "Coach",
      email: "coach@x.test",
    });
    const coach = await ctx.db.insert("profiles", {
      authId: coachUser,
      name: "Coach",
      email: "coach@x.test",
      role: "COACH",
      clubId: club,
    });
    const superUser = await ctx.db.insert("users", {
      name: "Boss",
      email: "boss@x.test",
    });
    await ctx.db.insert("profiles", {
      authId: superUser,
      name: "Boss",
      email: "boss@x.test",
      role: "SUPER_USER",
      clubId: club,
    });
    // The matrix and road columns come from the event whitelist, so it has to
    // exist for a cell to be rendered at all.
    await ctx.db.insert("events", {
      distance: 100,
      stroke: "FREE",
      allowedCourses: ["LCM", "SCM"],
      label: "100 Free",
      active: true,
    });

    return { club, coach, coachUser, superUser };
  });
  return {
    t,
    ids,
    asCoach: t.withIdentity({ subject: `${ids.coachUser}|s` }),
    asSuper: t.withIdentity({ subject: `${ids.superUser}|s` }),
  };
}

/** Insert one gala plus a matching cut in each course, and a swimmer + PB. */
async function seedScenario(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: Awaited<ReturnType<typeof setup>>["ids"],
  opts: {
    code: "SANS" | "SANY" | "SANJ";
    ageScope: "AGE_GRADED" | "OPEN";
    minAge?: number;
    maxAge?: number;
    swimmerAge: number;
    lcmCutMs: number;
    scmCutMs: number;
    /** The swimmer's meet PBs, per course. Omit a course to leave it unraced. */
    pbs: Partial<Record<"LCM" | "SCM", number>>;
  },
) {
  return await t.run(async (ctx) => {
    const gala = await ctx.db.insert("galas", {
      code: opts.code,
      displayName: `Gala ${opts.code}`,
      shortLabel: opts.code,
      ageScope: opts.ageScope,
      minAge: opts.minAge,
      maxAge: opts.maxAge,
      coveredEvents: [{ distance: 100, stroke: "FREE" }],
      sortHint: GALA_ORDER.indexOf(opts.code),
      season: "2027",
    });
    for (const [course, timeMs] of [
      ["LCM", opts.lcmCutMs],
      ["SCM", opts.scmCutMs],
    ] as const) {
      await ctx.db.insert("standards", {
        galaId: gala,
        course,
        gender: "F",
        distance: 100,
        stroke: "FREE",
        ...(opts.ageScope === "OPEN" ? {} : { age: opts.swimmerAge }),
        isCatchAllYoung: false,
        isCatchAllOld: false,
        timeMs,
      });
    }
    const swimmer = await ctx.db.insert("swimmers", {
      name: "Ava",
      dob: dobForAge(opts.swimmerAge),
      gender: "F",
      active: true,
      clubId: ids.club,
      createdAt: 0,
    });
    for (const course of ["LCM", "SCM"] as const) {
      const timeMs = opts.pbs[course];
      if (timeMs === undefined) continue;
      await ctx.db.insert("results", {
        swimmerId: swimmer,
        distance: 100,
        stroke: "FREE",
        course,
        timeMs,
        swimType: "MEET",
        swimDate: "2026-06-01",
        ageAtSwim: opts.swimmerAge,
        enteredBy: ids.coach,
        createdAt: 0,
      });
    }
    return { gala, swimmer };
  });
}

const LCM_CUT = parseTime("1:00:00"); // 60_000
const SCM_CUT = parseTime("58:00"); // 58_000

/**
 * The real entry windows, so the wheel tests exercise the production gate rather
 * than a convenient fiction. All five galas are always seeded — what excludes a
 * gala from a wheel must be the WINDOW, not the absence of rows.
 */
const WHEEL_WINDOWS: Record<
  GalaCode,
  { ageScope: "AGE_GRADED" | "OPEN"; minAge?: number; maxAge?: number }
> = {
  SANS: { ageScope: "OPEN", minAge: 15 },
  SANY: { ageScope: "OPEN", minAge: 17, maxAge: 25 },
  SANJ: { ageScope: "AGE_GRADED", maxAge: 16 },
  LEVEL_3: { ageScope: "AGE_GRADED", maxAge: 16 },
  LEVEL_2: { ageScope: "AGE_GRADED", maxAge: 16 },
};

type WheelEventSpec = {
  distance: 50 | 100 | 200;
  stroke: "FREE" | "BACK";
  label: string;
  /** LCM cut per gala. Omit a gala to mean "this gala does not cover this event". */
  cuts: Partial<Record<GalaCode, number>>;
  /** Headline LCM meet PB; omit for an unraced event. */
  pbMs?: number;
};

/**
 * Seed a whole stroke-profile wheel: every gala, its window, the per-event LCM
 * cuts, and the swimmer's headline meet PBs. Age-graded cuts are written at the
 * swimmer's exact age — including for galas whose window excludes them, which is
 * what lets a test prove the window (not a missing row) does the excluding.
 */
async function seedWheel(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: Awaited<ReturnType<typeof setup>>["ids"],
  opts: { swimmerAge: number; events: ReadonlyArray<WheelEventSpec> },
) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("events").take(200);
    for (const e of opts.events) {
      if (
        existing.some((x) => x.distance === e.distance && x.stroke === e.stroke)
      ) {
        continue;
      }
      await ctx.db.insert("events", {
        distance: e.distance,
        stroke: e.stroke,
        allowedCourses: ["LCM", "SCM"],
        label: e.label,
        active: true,
      });
    }

    for (const code of GALA_ORDER) {
      const window = WHEEL_WINDOWS[code];
      const covered = opts.events.filter((e) => e.cuts[code] !== undefined);
      const gala = await ctx.db.insert("galas", {
        code,
        displayName: `Gala ${code}`,
        shortLabel: code,
        ageScope: window.ageScope,
        minAge: window.minAge,
        maxAge: window.maxAge,
        coveredEvents: covered.map((e) => ({
          distance: e.distance,
          stroke: e.stroke,
        })),
        sortHint: GALA_ORDER.indexOf(code),
        season: "2027",
      });
      for (const e of covered) {
        await ctx.db.insert("standards", {
          galaId: gala,
          course: "LCM",
          gender: "F",
          distance: e.distance,
          stroke: e.stroke,
          ...(window.ageScope === "OPEN" ? {} : { age: opts.swimmerAge }),
          isCatchAllYoung: false,
          isCatchAllOld: false,
          timeMs: e.cuts[code]!,
        });
      }
    }

    const swimmer = await ctx.db.insert("swimmers", {
      name: "Ava",
      dob: dobForAge(opts.swimmerAge),
      gender: "F",
      active: true,
      clubId: ids.club,
      createdAt: 0,
    });
    for (const e of opts.events) {
      if (e.pbMs === undefined) continue;
      await ctx.db.insert("results", {
        swimmerId: swimmer,
        distance: e.distance,
        stroke: e.stroke,
        course: "LCM",
        timeMs: e.pbMs,
        swimType: "MEET",
        swimDate: "2026-06-01",
        ageAtSwim: opts.swimmerAge,
        enteredBy: ids.coach,
        createdAt: 0,
      });
    }
    return { swimmer };
  });
}

describe("stroke profile wheel rings (§5)", () => {
  test("the wheel carries only the galas the swimmer can enter, easiest ring inward", async () => {
    const { t, ids, asCoach } = await setup();
    // At 15 the age-graded galas are still open (maxAge 16) and SANS has just
    // opened (minAge 15), but SANY does not start until 17 — four rings, not five.
    const { swimmer } = await seedWheel(t, ids, {
      swimmerAge: 15,
      events: [
        {
          distance: 100,
          stroke: "FREE",
          label: "100 Free",
          cuts: {
            LEVEL_2: 70_000,
            LEVEL_3: 65_000,
            SANJ: 62_000,
            SANS: 58_000,
            SANY: 63_000, // seeded, but out of window → must not appear
          },
          pbMs: 62_000, // exactly the SANJ cut
        },
      ],
    });

    const profile = await asCoach.query(api.analysis.getStrokeProfile, {
      swimmerId: swimmer,
    });
    expect(profile!.ringGalas).toEqual(["LEVEL_2", "LEVEL_3", "SANJ", "SANS"]);

    const free = profile!.events.find(
      (e) => e.distance === 100 && e.stroke === "FREE",
    )!;
    expect(free.cuts.map((c) => c.gala)).toEqual([
      "LEVEL_2",
      "LEVEL_3",
      "SANJ",
      "SANS",
    ]);
    expect(free.cuts.find((c) => c.gala === "SANJ")!.timeMs).toBe(62_000);
    expect(free.fullCoverage).toBe(true);
    expect(free.highestGala).toBe("SANJ");
    // The acceptance invariant, end to end: a PB at the SANJ cut lands exactly
    // on the SANJ ring (third of four), so "crosses the ring" == "beats the cut".
    expect(free.calibratedRadius).toBeCloseTo(3, 10);
  });

  test("a 17-year-old gets a two-ring wheel even though age-graded rows exist for that age", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedWheel(t, ids, {
      swimmerAge: 17,
      events: [
        {
          distance: 100,
          stroke: "FREE",
          label: "100 Free",
          // L2/L3/SANJ rows are written AT AGE 17 here. They are still excluded,
          // because the entry window closes at 16 — the gate is the window.
          cuts: {
            LEVEL_2: 70_000,
            LEVEL_3: 65_000,
            SANJ: 62_000,
            SANS: 58_000,
            SANY: 63_000, // the youth standard is the SOFTER of the two (see the CSV)
          },
          pbMs: 63_000, // exactly the SANY cut — the inner ring at this age
        },
      ],
    });

    const profile = await asCoach.query(api.analysis.getStrokeProfile, {
      swimmerId: swimmer,
    });
    expect(profile!.ringGalas).toEqual(["SANY", "SANS"]);

    const free = profile!.events.find(
      (e) => e.distance === 100 && e.stroke === "FREE",
    )!;
    expect(free.cuts.map((c) => c.gala)).toEqual(["SANY", "SANS"]);
    expect(free.highestGala).toBe("SANY");
    expect(free.calibratedRadius).toBeCloseTo(1, 10);
  });

  test("an event only the easier galas cover anchors on fewer rings and reports partial coverage", async () => {
    const { t, ids, asCoach } = await setup();
    // The real coverage rule: no 50m at L3/SANJ, and SANS publishes none either,
    // so a 50 Free carries a single L2 anchor while the 100 spans all four rings.
    const { swimmer } = await seedWheel(t, ids, {
      swimmerAge: 15,
      events: [
        {
          distance: 50,
          stroke: "FREE",
          label: "50 Free",
          cuts: { LEVEL_2: 32_000 },
          pbMs: 27_000, // far inside the only cut it has
        },
        {
          distance: 100,
          stroke: "FREE",
          label: "100 Free",
          cuts: {
            LEVEL_2: 70_000,
            LEVEL_3: 65_000,
            SANJ: 62_000,
            SANS: 58_000,
          },
          pbMs: 72_000, // slower than every cut it has
        },
      ],
    });

    const profile = await asCoach.query(api.analysis.getStrokeProfile, {
      swimmerId: swimmer,
    });
    // The ring layout is a property of the whole wheel: the union across events.
    expect(profile!.ringGalas).toEqual(["LEVEL_2", "LEVEL_3", "SANJ", "SANS"]);

    const fifty = profile!.events.find((e) => e.distance === 50)!;
    expect(fifty.cuts.map((c) => c.gala)).toEqual(["LEVEL_2"]);
    expect(fifty.fullCoverage).toBe(false);
    expect(fifty.highestGala).toBe("LEVEL_2");
    // Bar length must stay comparable across spokes: beating the only cut this
    // event has caps the bar on the LEVEL_2 ring, never out in the headroom that
    // belongs to beating SANS on the outermost ring.
    expect(fifty.calibratedRadius).toBeCloseTo(1, 10);

    const hundred = profile!.events.find((e) => e.distance === 100)!;
    expect(hundred.fullCoverage).toBe(true);
    // 72.00 misses even the easiest cut, so the bar stays INSIDE the first ring —
    // short of a cut can never look like it reached that cut's ring.
    expect(hundred.highestGala).toBeNull();
    expect(hundred.calibratedRadius).toBeGreaterThan(0);
    expect(hundred.calibratedRadius).toBeLessThan(1);
  });
});

describe("either course qualifies (§4.2)", () => {
  test("a SHORT-course PB that clears the short-course cut qualifies", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANJ",
      ageScope: "AGE_GRADED",
      maxAge: 16,
      swimmerAge: 15,
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      // Long course misses its cut; short course clears its own.
      pbs: { LCM: 61_000, SCM: 57_000 },
    });

    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const cell = matrix.rows
      .find((r) => r.swimmerId === swimmer)!
      .cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    expect(cell.gala).toBe("SANJ");
    expect(cell.galaCourse).toBe("SCM"); // and the cell says WHICH course

    const qual = await asCoach.query(api.tours.getTourQualification, {});
    const sanj = qual.galas.find((g) => g.gala === "SANJ")!;
    expect(sanj.swimmers.map((s) => s.swimmerId)).toContain(swimmer);
    expect(sanj.swimmers[0].events[0].course).toBe("SCM");
  });

  test("a short-course PB is NEVER measured against the long-course cut", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANJ",
      ageScope: "AGE_GRADED",
      maxAge: 16,
      swimmerAge: 15,
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      // 59s beats the LONG-course cut but misses the SHORT-course one. Since it
      // was swum short course, it must NOT qualify.
      pbs: { SCM: 59_000 },
    });

    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const cell = matrix.rows
      .find((r) => r.swimmerId === swimmer)!
      .cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    expect(cell.gala).toBeNull();
    expect(cell.hasCut).toBe(true);
  });

  test("a single-course grid ignores the other course entirely", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANJ",
      ageScope: "AGE_GRADED",
      maxAge: 16,
      swimmerAge: 15,
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      pbs: { LCM: 61_000, SCM: 57_000 },
    });

    const lcmOnly = await asCoach.query(api.analysis.getQualificationMatrix, {
      courseMode: "LCM",
    });
    const cell = lcmOnly.rows
      .find((r) => r.swimmerId === swimmer)!
      .cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    // The qualifying SCM swim exists but must not appear on a long-course grid.
    expect(cell.gala).toBeNull();
    expect(cell.pbScmMs).toBeNull();
    expect(cell.pbLcmMs).toBe(61_000);
  });

  test("road to qualify measures the gap in the closest course", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANJ",
      ageScope: "AGE_GRADED",
      maxAge: 16,
      swimmerAge: 15,
      lcmCutMs: LCM_CUT, // 60.00
      scmCutMs: SCM_CUT, // 58.00
      // LCM shortfall 1.0s; SCM shortfall 3.0s → the LCM row is the real chance.
      pbs: { LCM: 61_000, SCM: 61_000 },
    });

    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: swimmer,
      gala: "SANJ",
    });
    const evt = road!.events.find((e) => e.distance === 100 && e.stroke === "FREE")!;
    expect(evt.course).toBe("LCM");
    expect(evt.gapMs).toBe(1_000);
    expect(evt.qualified).toBe(false);
  });
});

describe("entry age windows (§4.9)", () => {
  test("an under-age swimmer is never listed, however fast", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANY",
      ageScope: "OPEN",
      minAge: 17,
      maxAge: 25,
      swimmerAge: 16, // one year too young for SANY
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      pbs: { LCM: 50_000 }, // comfortably inside both cuts
    });

    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const cell = matrix.rows
      .find((r) => r.swimmerId === swimmer)!
      .cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    // No cut applies at all — not "fast but unqualified", genuinely no target.
    expect(cell.hasCut).toBe(false);
    expect(cell.gala).toBeNull();

    const qual = await asCoach.query(api.tours.getTourQualification, {});
    const sany = qual.galas.find((g) => g.gala === "SANY")!;
    expect(sany.swimmers).toHaveLength(0);
  });

  test("the same swim DOES qualify once the swimmer is inside the window", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANY",
      ageScope: "OPEN",
      minAge: 17,
      maxAge: 25,
      swimmerAge: 17,
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      pbs: { LCM: 50_000 },
    });

    const matrix = await asCoach.query(api.analysis.getQualificationMatrix, {});
    const cell = matrix.rows
      .find((r) => r.swimmerId === swimmer)!
      .cells.find((c) => c.distance === 100 && c.stroke === "FREE")!;
    expect(cell.gala).toBe("SANY");
  });

  test("road to qualify says WHY there is no road, rather than showing nothing", async () => {
    const { t, ids, asCoach } = await setup();
    const { swimmer } = await seedScenario(t, ids, {
      code: "SANS",
      ageScope: "OPEN",
      minAge: 15,
      swimmerAge: 13,
      lcmCutMs: LCM_CUT,
      scmCutMs: SCM_CUT,
      pbs: { LCM: 50_000 },
    });

    const road = await asCoach.query(api.analysis.getRoadToQualify, {
      swimmerId: swimmer,
      gala: "SANS",
    });
    expect(road!.ineligible).toBe(true);
    expect(road!.events).toHaveLength(0);
  });
});

describe("seeding migration", () => {
  test("loads the five galas and all 948 cuts, and is safe to re-run", async () => {
    const { t, asSuper } = await setup();

    const first = await t.mutation(
      internal.migrations.galaStandards.migrateToGalas,
      {},
    );
    expect(first.galasInserted).toBe(5);
    expect(first.standardsInserted).toBe(948);
    expect(first.standardsDeleted).toBe(0);

    const galas = await asSuper.query(api.galas.listGalas, {});
    expect(galas.map((g) => g.code)).toEqual([...GALA_ORDER]);
    // The entry windows the coach specified.
    expect(galas.find((g) => g.code === "SANS")).toMatchObject({
      minAge: 15,
      maxAge: null,
    });
    expect(galas.find((g) => g.code === "SANY")).toMatchObject({
      minAge: 17,
      maxAge: 25,
    });
    for (const code of ["SANJ", "LEVEL_3", "LEVEL_2"] as const) {
      expect(galas.find((g) => g.code === code)!.maxAge).toBe(16);
    }

    const standards = await asSuper.query(api.standards.listStandards, {});
    expect(standards).toHaveLength(948);

    // Re-running replaces rather than duplicating, and adds no gala rows.
    const second = await t.mutation(
      internal.migrations.galaStandards.migrateToGalas,
      {},
    );
    expect(second.galasInserted).toBe(0);
    expect(second.galasUpdated).toBe(5);
    expect(second.standardsDeleted).toBe(948);
    expect(second.standardsInserted).toBe(948);
    expect(await asSuper.query(api.standards.listStandards, {})).toHaveLength(948);
  });

  test("carries an existing tour date across from the deprecated tours table", async () => {
    const { t, asSuper } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("tours", {
        tier: "SANJ",
        date: "2027-04-10",
        name: "SANJ Nationals",
      });
    });

    await t.mutation(internal.migrations.galaStandards.migrateToGalas, {});
    const galas = await asSuper.query(api.galas.listGalas, {});
    expect(galas.find((g) => g.code === "SANJ")).toMatchObject({
      tourDate: "2027-04-10",
      tourName: "SANJ Nationals",
    });
    // Galas that had no tours row keep no date.
    expect(galas.find((g) => g.code === "SANS")!.tourDate).toBeNull();
  });
});
