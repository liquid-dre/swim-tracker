import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildRingScale,
  findAgeInversions,
  isGalaAgeEligible,
  parseStandardsCsv,
  parseTime,
  prepareStandardImport,
  resolveGalaCut,
  resolveStandardTime,
  GALA_ORDER,
  type Course,
  type EventDef,
  type GalaCode,
  type PreparedStandard,
} from "./swim";
import { GALA_SEED, GALA_SEED_BY_CODE } from "./galas";
import { STANDARDS_SEED_ROWS } from "../convex/standardsSeedData";

/*
  Guards data/qualifying-times.csv — the OFFICIAL 2027 SSA qualifying tables,
  transcribed from the three federation documents:

    • SA Age Group QT 2027    — Level 2 / Level 3 / SANJ, LONG and SHORT course
    • SA Nationals QT 2027    — SANS (SA Senior National Aquatic Champs), open
    • SA Youth Nationals 2027 — SANY (SA National Youth Champs), open

  These numbers are the product's ground truth; this suite makes a transcription
  slip or an accidental edit fail CI rather than quietly skew every gap, gala and
  qualification in the app.
*/

// The event whitelist slice these cuts live on (mirrors convex/events.ts EVENTS).
// Cuts exist in BOTH courses, so every event here allows both.
const BOTH: ReadonlyArray<Course> = ["LCM", "SCM"];
const EVENTS: EventDef[] = [
  ...[50, 100, 200].flatMap((d) =>
    ["FREE", "BACK", "BREAST", "FLY"].map((s) => ({
      distance: d,
      stroke: s,
      allowedCourses: BOTH,
      active: true,
    })),
  ),
  { distance: 200, stroke: "IM", allowedCourses: BOTH, active: true },
  { distance: 400, stroke: "FREE", allowedCourses: BOTH, active: true },
  { distance: 400, stroke: "IM", allowedCourses: BOTH, active: true },
  { distance: 800, stroke: "FREE", allowedCourses: BOTH, active: true },
  { distance: 1500, stroke: "FREE", allowedCourses: BOTH, active: true },
];

// Coverage + age scope come from the seeded gala definitions, exactly as the
// Convex importer supplies them from the `galas` table.
const GALAS = GALA_SEED.map((g) => ({
  code: g.code,
  ageScope: g.ageScope,
  coveredEvents: g.coveredEvents,
}));

const csv = readFileSync(join(__dirname, "..", "data", "qualifying-times.csv"), "utf8");

function importAll(): PreparedStandard[] {
  const parsed = parseStandardsCsv(csv);
  expect(parsed.rejected).toEqual([]);
  const prepared = prepareStandardImport(
    parsed.rows.map((r) => r.row),
    EVENTS,
    GALAS,
  );
  expect(prepared.rejected).toEqual([]);
  return prepared.accepted;
}

/** Cuts for one gala + course + gender + event, for the resolver tests. */
function cutsFor(
  accepted: PreparedStandard[],
  gala: GalaCode,
  course: Course,
  gender: string,
  d: number,
  s: string,
) {
  return accepted.filter(
    (c) =>
      c.gala === gala &&
      c.course === course &&
      c.gender === gender &&
      c.distance === d &&
      c.stroke === s,
  );
}

describe("official qualifying-times CSV", () => {
  it("parses completely: every row a valid, covered cut", () => {
    const accepted = importAll();
    expect(accepted).toHaveLength(948);
  });

  it("has the exact per-gala, per-course shape of the federation tables", () => {
    const accepted = importAll();
    const count = (gala: GalaCode, course: Course) =>
      accepted.filter((c) => c.gala === gala && c.course === course).length;
    // Age-graded: events × ages × 2 genders, the same set in each course.
    expect(count("LEVEL_2", "LCM")).toBe(168); // 12 events × 7 ages × 2
    expect(count("LEVEL_2", "SCM")).toBe(168);
    expect(count("LEVEL_3", "LCM")).toBe(108); // 9 events × 6 ages × 2
    expect(count("LEVEL_3", "SCM")).toBe(108);
    expect(count("SANJ", "LCM")).toBe(130); // 13 events × 5 ages × 2
    expect(count("SANJ", "SCM")).toBe(130);
    // Open: one cut per event per gender — no age columns at all.
    expect(count("SANS", "LCM")).toBe(34); // 17 events × 2 genders
    expect(count("SANS", "SCM")).toBe(34);
    expect(count("SANY", "LCM")).toBe(34);
    expect(count("SANY", "SCM")).toBe(34);
  });

  it("gives the open galas no age and no catch-all flags", () => {
    const accepted = importAll();
    for (const cut of accepted.filter((c) => c.gala === "SANS" || c.gala === "SANY")) {
      expect(cut.age).toBeUndefined();
      expect(cut.isCatchAllYoung).toBe(false);
      expect(cut.isCatchAllOld).toBe(false);
    }
  });

  it("models the &U columns as young catch-alls (and nothing else)", () => {
    const accepted = importAll();
    const youngAge: Partial<Record<GalaCode, number>> = {
      LEVEL_2: 10,
      LEVEL_3: 11,
      SANJ: 12,
    };
    for (const cut of accepted.filter((c) => c.age !== undefined)) {
      // 16 is the exact oldest age in every age-graded table — 17+ has no cut,
      // which is exactly why SANS/SANY exist.
      expect(cut.isCatchAllOld).toBe(false);
      expect(cut.isCatchAllYoung).toBe(cut.age === youngAge[cut.gala]);
    }
  });

  it("has exactly one known age inversion, and it is the federation's own", () => {
    const accepted = importAll();
    // SANJ women 100 Back: the 2027 tables really do list 12&U 1:12.98 then 13
    // 1:14.83 — slower for the older age. It is present in BOTH courses, so it
    // is in the source, not a transcription slip. BRD §5.8 says warn, never
    // block; this test pins the exception so a NEW inversion still fails CI.
    const EXPECTED = new Set(["SANJ|LCM|F|100|BACK", "SANJ|SCM|F|100|BACK"]);

    const groups = new Map<string, PreparedStandard[]>();
    for (const cut of accepted) {
      if (cut.age === undefined) continue; // an open cut cannot be inverted
      const key = `${cut.gala}|${cut.course}|${cut.gender}|${cut.distance}|${cut.stroke}`;
      const list = groups.get(key);
      if (list) list.push(cut);
      else groups.set(key, [cut]);
    }

    const inverted = [...groups]
      .filter(([, cuts]) => findAgeInversions(cuts).length > 0)
      .map(([key]) => key)
      .sort();
    expect(inverted).toEqual([...EXPECTED].sort());
  });

  it("keeps SANJ < L3 < L2 at every (gender, event, age) in BOTH courses", () => {
    const accepted = importAll();
    const at = (
      gala: GalaCode,
      course: Course,
      gender: string,
      d: number,
      s: string,
      age: number,
    ) =>
      accepted.find(
        (c) =>
          c.gala === gala && c.course === course && c.gender === gender &&
          c.distance === d && c.stroke === s && c.age === age && !c.isCatchAllYoung,
      )?.timeMs;

    // Exact ages 13-16 exist in all three age-graded galas for shared events.
    for (const course of BOTH) {
      for (const gender of ["F", "M"] as const) {
        for (const [d, s] of [
          [100, "FREE"],
          [200, "BACK"],
          [100, "BREAST"],
          [200, "IM"],
        ] as const) {
          for (const age of [13, 14, 15, 16]) {
            const where = `${course} ${gender} ${d}${s} ${age}`;
            const sanj = at("SANJ", course, gender, d, s, age);
            const l3 = at("LEVEL_3", course, gender, d, s, age);
            const l2 = at("LEVEL_2", course, gender, d, s, age);
            expect(sanj, where).toBeDefined();
            expect(l3, where).toBeDefined();
            expect(l2, where).toBeDefined();
            expect(sanj!, where).toBeLessThan(l3!);
            expect(l3!, where).toBeLessThan(l2!);
          }
        }
      }
    }
  });

  it("is slower long course than short course on every open cut", () => {
    const accepted = importAll();
    const open = accepted.filter((c) => c.age === undefined && c.course === "LCM");
    expect(open.length).toBe(68);
    for (const lc of open) {
      const sc = accepted.find(
        (c) =>
          c.gala === lc.gala && c.course === "SCM" && c.gender === lc.gender &&
          c.distance === lc.distance && c.stroke === lc.stroke,
      );
      const where = `${lc.gala} ${lc.gender} ${lc.distance}${lc.stroke}`;
      expect(sc, where).toBeDefined();
      expect(lc.timeMs, where).toBeGreaterThan(sc!.timeMs);
    }
  });

  // -------------------------------------------------------------------------
  // GALA_ORDER guard — the property that makes a static difficulty order safe
  // -------------------------------------------------------------------------

  it("never contradicts GALA_ORDER at any age where two galas are both eligible", () => {
    const accepted = importAll();
    const refs = GALA_SEED.map((g) => ({
      code: g.code,
      minAge: g.minAge ?? null,
      maxAge: g.maxAge ?? null,
    }));
    const events = [
      ...new Set(accepted.map((c) => `${c.distance}|${c.stroke}`)),
    ].map((k) => k.split("|"));

    let overlaps = 0;
    for (const course of BOTH) {
      for (const gender of ["F", "M"] as const) {
        for (const [dStr, s] of events) {
          const d = Number(dStr);
          for (let age = 9; age <= 26; age++) {
            // Resolve every gala's cut for this exact age, honouring its window.
            const resolved = GALA_ORDER.flatMap((code) => {
              const ref = refs.find((r) => r.code === code)!;
              const ms = resolveGalaCut(
                ref,
                cutsFor(accepted, code, course, gender, d, s),
                age,
              );
              return ms === null ? [] : [{ code, ms }];
            });
            if (resolved.length < 2) continue;
            overlaps += 1;
            // Hardest-first by cut time must equal hardest-first by GALA_ORDER.
            const byCut = [...resolved].sort((a, b) => a.ms - b.ms).map((r) => r.code);
            expect(
              byCut,
              `${course} ${gender} ${d}${s} age ${age}`,
            ).toEqual(resolved.map((r) => r.code));
          }
        }
      }
    }
    // Guard the guard: if eligibility ever stopped overlapping, this test would
    // silently pass while checking nothing.
    expect(overlaps).toBeGreaterThan(500);
  });

  // -------------------------------------------------------------------------
  // Resolution: catch-alls, open standards, entry windows
  // -------------------------------------------------------------------------

  it("resolves kids YOUNGER than the &U column to the &U cut (the 12&U convention)", () => {
    const accepted = importAll();
    const resolve = (gala: GalaCode, gender: string, d: number, s: string, age: number) =>
      resolveStandardTime(cutsFor(accepted, gala, "LCM", gender, d, s), age);

    // SANJ: any age at or below 12 gets exactly the 12&U cut.
    const sanj12U = resolve("SANJ", "F", 100, "FREE", 12);
    expect(sanj12U).toBe(parseTime("1:07:98"));
    for (const age of [8, 9, 10, 11]) {
      expect(resolve("SANJ", "F", 100, "FREE", age)).toBe(sanj12U);
      expect(resolve("SANJ", "M", 200, "IM", age)).toBe(
        resolve("SANJ", "M", 200, "IM", 12),
      );
    }
    // Same rule at each gala's own youngest band: L3 → 11&U, L2 → 10&U.
    expect(resolve("LEVEL_3", "M", 100, "FREE", 9)).toBe(
      resolve("LEVEL_3", "M", 100, "FREE", 11),
    );
    expect(resolve("LEVEL_2", "F", 50, "FREE", 8)).toBe(
      resolve("LEVEL_2", "F", 50, "FREE", 10),
    );
    // And exact ages above the band never fall INTO it.
    expect(resolve("SANJ", "F", 100, "FREE", 13)).toBe(parseTime("1:06:74"));
  });

  it("resolves an open standard at every age inside the entry window", () => {
    const accepted = importAll();
    const sansCuts = cutsFor(accepted, "SANS", "LCM", "F", 100, "FREE");
    expect(sansCuts).toHaveLength(1);
    const ref = { code: "SANS" as GalaCode, minAge: 15, maxAge: null };
    for (const age of [15, 17, 21, 40]) {
      expect(resolveGalaCut(ref, sansCuts, age)).toBe(parseTime("59:84"));
    }
  });

  it("honours each gala's entry age window", () => {
    const accepted = importAll();
    const ref = (code: GalaCode) => {
      const seed = GALA_SEED_BY_CODE[code];
      return { code, minAge: seed.minAge ?? null, maxAge: seed.maxAge ?? null };
    };

    // SANS: 15 and up, no ceiling. A 14-year-old is never eligible.
    const sans = cutsFor(accepted, "SANS", "LCM", "F", 100, "FREE");
    expect(resolveGalaCut(ref("SANS"), sans, 14)).toBeNull();
    expect(resolveGalaCut(ref("SANS"), sans, 15)).not.toBeNull();
    expect(resolveGalaCut(ref("SANS"), sans, 40)).not.toBeNull();

    // SANY: 17-25 inclusive. 16 is too young, 26 too old.
    const sany = cutsFor(accepted, "SANY", "LCM", "F", 100, "FREE");
    expect(resolveGalaCut(ref("SANY"), sany, 16)).toBeNull();
    expect(resolveGalaCut(ref("SANY"), sany, 17)).not.toBeNull();
    expect(resolveGalaCut(ref("SANY"), sany, 25)).not.toBeNull();
    expect(resolveGalaCut(ref("SANY"), sany, 26)).toBeNull();

    // The age-graded galas stop at 16 both by data AND by window.
    for (const code of ["SANJ", "LEVEL_3", "LEVEL_2"] as const) {
      expect(isGalaAgeEligible(ref(code), 16)).toBe(true);
      expect(isGalaAgeEligible(ref(code), 17)).toBe(false);
    }
  });

  it("gives a 17-year-old no age-graded cut, but does give them SANS and SANY", () => {
    const accepted = importAll();
    for (const code of ["SANJ", "LEVEL_3", "LEVEL_2"] as const) {
      for (const gender of ["F", "M"] as const) {
        const seed = GALA_SEED_BY_CODE[code];
        const ref = { code, minAge: seed.minAge ?? null, maxAge: seed.maxAge ?? null };
        expect(
          resolveGalaCut(ref, cutsFor(accepted, code, "LCM", gender, 100, "FREE"), 17),
        ).toBeNull();
      }
    }
    // The gap the two open galas exist to fill.
    for (const code of ["SANS", "SANY"] as const) {
      const seed = GALA_SEED_BY_CODE[code];
      const ref = { code, minAge: seed.minAge ?? null, maxAge: seed.maxAge ?? null };
      expect(
        resolveGalaCut(ref, cutsFor(accepted, code, "LCM", "F", 100, "FREE"), 17),
      ).not.toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // Hand-checked anchors + the generated seed module
  // -------------------------------------------------------------------------

  it("gives each age exactly the galas the entry windows allow", () => {
    // The property the chart overlays and the wheel rings both depend on: nobody
    // is eligible for all five at once, so a progression chart never draws five
    // cut lines and a wheel never has five rings. SANS opens at 15 and SANY at
    // 17, while L2/L3/SANJ close at 16.
    const accepted = importAll();
    const refs = GALA_SEED.map((g) => ({
      code: g.code,
      minAge: g.minAge ?? null,
      maxAge: g.maxAge ?? null,
    }));

    // Resolve on a shared event every gala covers, so coverage never confounds
    // the eligibility question.
    const eligibleAt = (age: number) =>
      GALA_ORDER.filter((code) => {
        const ref = refs.find((r) => r.code === code)!;
        return (
          resolveGalaCut(
            ref,
            cutsFor(accepted, code, "LCM", "F", 100, "FREE"),
            age,
          ) !== null
        );
      });

    expect(eligibleAt(13)).toEqual(["SANJ", "LEVEL_3", "LEVEL_2"]);
    expect(eligibleAt(15)).toEqual(["SANS", "SANJ", "LEVEL_3", "LEVEL_2"]);
    expect(eligibleAt(16)).toEqual(["SANS", "SANJ", "LEVEL_3", "LEVEL_2"]);
    expect(eligibleAt(17)).toEqual(["SANS", "SANY"]);
    expect(eligibleAt(25)).toEqual(["SANS", "SANY"]);
    expect(eligibleAt(26)).toEqual(["SANS"]);

    // The headline claim, across every age a swimmer could plausibly be.
    for (let age = 8; age <= 40; age++) {
      expect(eligibleAt(age).length, `age ${age}`).toBeLessThanOrEqual(4);
    }
  });

  it("builds a 3-, 4- or 2-ring wheel scale for those ages", () => {
    // The wheel consumes the same eligible set, so its ring count follows.
    expect(buildRingScale(["SANJ", "LEVEL_3", "LEVEL_2"]).order).toHaveLength(3);
    expect(
      buildRingScale(["SANS", "SANJ", "LEVEL_3", "LEVEL_2"]).order,
    ).toHaveLength(4);
    expect(buildRingScale(["SANS", "SANY"]).order).toHaveLength(2);
    // Inner ring is always the easiest gala present.
    expect(buildRingScale(["SANS", "SANY"]).order[0]).toBe("SANY");
    expect(
      buildRingScale(["SANS", "SANJ", "LEVEL_3", "LEVEL_2"]).order[0],
    ).toBe("LEVEL_2");
  });

  it("matches hand-checked anchor values from each federation table", () => {
    const accepted = importAll();
    const ms = (
      gala: GalaCode,
      course: Course,
      gender: string,
      d: number,
      s: string,
      age?: number,
    ) =>
      accepted.find(
        (c) =>
          c.gala === gala && c.course === course && c.gender === gender &&
          c.distance === d && c.stroke === s && c.age === age,
      )!.timeMs;

    // SANJ (long course): W 16 100 Free, M 16 1500 Free.
    expect(ms("SANJ", "LCM", "F", 100, "FREE", 16)).toBe(parseTime("1:03:89"));
    expect(ms("SANJ", "LCM", "M", 1500, "FREE", 16)).toBe(parseTime("17:30:09"));
    // SANJ (short course): the known inversion pair, verbatim from the table.
    expect(ms("SANJ", "SCM", "F", 100, "BACK", 12)).toBe(parseTime("1:11:78"));
    expect(ms("SANJ", "SCM", "F", 100, "BACK", 13)).toBe(parseTime("1:13:63"));
    // Level 3: W 11&U 200 IM (LC), M 15 100 Free (LC).
    expect(ms("LEVEL_3", "LCM", "F", 200, "IM", 11)).toBe(parseTime("3:26:89"));
    expect(ms("LEVEL_3", "LCM", "M", 100, "FREE", 15)).toBe(parseTime("59:67"));
    // Level 2: unchanged from the previous tables — W 10&U 50 Free, M 16 50 Free.
    expect(ms("LEVEL_2", "LCM", "F", 50, "FREE", 10)).toBe(parseTime("39:72"));
    expect(ms("LEVEL_2", "LCM", "M", 50, "FREE", 16)).toBe(parseTime("28:26"));
    expect(ms("LEVEL_2", "SCM", "M", 200, "BACK", 15)).toBe(parseTime("3:01:64"));
    // SANS: W 100 Free both courses; M 400 IM — the men's open columns read
    // LONG then SHORT, so the LC time is the SLOWER of the pair.
    expect(ms("SANS", "LCM", "F", 100, "FREE")).toBe(parseTime("59:84"));
    expect(ms("SANS", "SCM", "F", 100, "FREE")).toBe(parseTime("58:24"));
    expect(ms("SANS", "LCM", "M", 400, "IM")).toBe(parseTime("4:43:62"));
    expect(ms("SANS", "SCM", "M", 400, "IM")).toBe(parseTime("4:37:22"));
    // SANY: M 200 IM (LC), W 200 Fly (SC).
    expect(ms("SANY", "LCM", "M", 200, "IM")).toBe(parseTime("2:24:93"));
    expect(ms("SANY", "SCM", "F", 200, "FLY")).toBe(parseTime("2:36:15"));
  });

  it("keeps convex/standardsSeedData.ts identical to the CSV", () => {
    // The CSV is the artefact a human proofreads against the PDFs; the generated
    // module is what the seeding mutation loads inside Convex. They must not drift
    // (regenerate with `npm run seed:standards:gen`).
    const parsed = parseStandardsCsv(csv);
    expect(parsed.rejected).toEqual([]);
    expect(STANDARDS_SEED_ROWS).toHaveLength(parsed.rows.length);

    parsed.rows.forEach(({ row }, i) => {
      const [gala, course, gender, distance, stroke, age, time, catchAll] =
        STANDARDS_SEED_ROWS[i];
      expect({ gala, course, gender, distance, stroke, age, time }).toEqual({
        gala: row.gala,
        course: row.course,
        gender: row.gender,
        distance: row.distance,
        stroke: row.stroke,
        age: row.age,
        time: row.time,
      });
      expect(catchAll).toBe(
        row.isCatchAllYoung ? "Y" : row.isCatchAllOld ? "O" : "",
      );
    });
  });

  it("covers exactly the events each gala's seeded coverage claims", () => {
    const accepted = importAll();
    for (const seed of GALA_SEED) {
      const inData = new Set(
        accepted
          .filter((c) => c.gala === seed.code)
          .map((c) => `${c.distance}|${c.stroke}`),
      );
      const claimed = new Set(
        seed.coveredEvents.map((e) => `${e.distance}|${e.stroke}`),
      );
      expect([...inData].sort(), seed.code).toEqual([...claimed].sort());
    }
  });
});
