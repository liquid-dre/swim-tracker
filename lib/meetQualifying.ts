// ---------------------------------------------------------------------------
// Meet qualifying times — a competition's OWN entry standards
// ---------------------------------------------------------------------------
//
// Some meets on the calendar publish their own qualifying table: the HAS
// Championships 2026 prints one cut per (gender, event, age) and a swimmer may
// only enter an event they have swum under it. That table is a fact about the
// MEET, not one of the five federation standard sets in `lib/galas.ts`:
//
//   * it is not a gala, so it never joins `GALA_ORDER`, never draws a chart
//     line, never colours a tier badge (CLAUDE.md: "A MEET IS NOT A GALA");
//   * it is stored per meet (`meetQualifying` table) and resolved here.
//
// The rules a meet's table is judged by mirror the gala rules on purpose:
//
//   * ONE COURSE per table. The document states its course or the person who
//     loads it chooses one; a swim in the other pool is never compared (§4.2).
//   * MEET swims only, inside a window — `fastestMeetSwimInWindow` is the one
//     copy of that rule, so a time trial qualifies nobody here either.
//   * The window ends the day BEFORE the meet starts: a swim at the
//     championship itself cannot be its own entry ticket.
//   * AGE is the swimmer's exact age on the meet's FIRST day.
//
// Pure: no Convex imports, so the server and the tests share every line.

import { formatShortDate } from "./format";
import {
  computeAge,
  fastestMeetSwimInWindow,
  parseTime,
  type Course,
  type Distance,
  type Stroke,
  type SwimType,
} from "./swim";

/**
 * How one age column applies. Published tables bracket their ends — the
 * youngest column of the HAS table is "11" and covers every younger swimmer,
 * its oldest is "16 and over" — and an exact column in between.
 */
export type AgeBand = "EXACT" | "AND_UNDER" | "AND_OVER";

export type MeetCut = {
  gender: "M" | "F";
  distance: Distance;
  stroke: Stroke;
  age: number;
  band: AgeBand;
  timeMs: number;
};

/** A meet's whole qualifying table, as stored and as resolved. */
export type MeetQualifyingTable = {
  title: string;
  course: Course;
  /** First day a swim counts, inclusive. Absent = no lower bound. */
  qualifyingFrom?: string | null;
  cuts: ReadonlyArray<MeetCut>;
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Does a column apply to a swimmer of this exact age? */
function bandCovers(cut: Pick<MeetCut, "age" | "band">, exactAge: number): boolean {
  if (cut.band === "EXACT") return exactAge === cut.age;
  if (cut.band === "AND_UNDER") return exactAge <= cut.age;
  return exactAge >= cut.age;
}

/**
 * The cut this swimmer must beat for one event, or null when the table has no
 * column for them (or no row for the event — a 50 free is simply not on the
 * HAS table, and "no cut" must never read as "qualified").
 *
 * An EXACT column wins over a catch-all if a table ever overlaps them.
 */
export function resolveMeetCut(
  cuts: ReadonlyArray<MeetCut>,
  swimmer: { gender: "M" | "F"; exactAge: number },
  event: { distance: Distance; stroke: Stroke },
): MeetCut | null {
  let catchAll: MeetCut | null = null;
  for (const cut of cuts) {
    if (
      cut.gender !== swimmer.gender ||
      cut.distance !== event.distance ||
      cut.stroke !== event.stroke ||
      !bandCovers(cut, swimmer.exactAge)
    ) {
      continue;
    }
    if (cut.band === "EXACT") return cut;
    catchAll ??= cut;
  }
  return catchAll;
}

/** The events a table covers, in the order the table lists them. */
export function tableEvents(
  cuts: ReadonlyArray<MeetCut>,
): Array<{ distance: Distance; stroke: Stroke }> {
  const seen = new Set<string>();
  const out: Array<{ distance: Distance; stroke: Stroke }> = [];
  for (const cut of cuts) {
    const key = `${cut.distance}|${cut.stroke}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ distance: cut.distance, stroke: cut.stroke });
  }
  return out;
}

/** The day before an ISO date — the last day a swim may count for a meet. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The window a table is judged on: its own start, up to the eve of the meet. */
export function meetQualifyingWindow(
  table: Pick<MeetQualifyingTable, "qualifyingFrom">,
  meetStartDate: string,
): { qualifyingFrom: string | null; qualifyingTo: string } {
  return {
    qualifyingFrom: table.qualifyingFrom ?? null,
    qualifyingTo: dayBefore(meetStartDate),
  };
}

/** "Long course · meet swims 24 Aug – 20 Nov 2026 · age on 21 Nov 2026". */
export function describeMeetQualifyingBasis(
  table: Pick<MeetQualifyingTable, "course" | "qualifyingFrom">,
  meetStartDate: string,
): string {
  const window = meetQualifyingWindow(table, meetStartDate);
  const course = table.course === "LCM" ? "Long course" : "Short course";
  const from = window.qualifyingFrom
    ? `${formatShortDate(window.qualifyingFrom)} – `
    : "up to ";
  return `${course} only · fastest official meet swim ${from}${formatShortDate(
    window.qualifyingTo,
  )} · age on ${formatShortDate(meetStartDate)}`;
}

type SwimRow = {
  distance: number;
  stroke: string;
  course: string;
  timeMs: number;
  swimDate: string;
  swimType: SwimType | string;
  meetName?: string | null;
};

/** One event, judged for one swimmer. */
export type EventQualification = {
  distance: Distance;
  stroke: Stroke;
  /** Null when the table has no column for this swimmer's age/gender. */
  cutMs: number | null;
  bestMs: number | null;
  bestDate: string | null;
  bestMeetName: string | null;
  /** Under the cut — strictly faster, or equal (a tie meets a standard). */
  met: boolean;
  /** `bestMs - cutMs`: positive = still to find. Null when either is missing. */
  gapMs: number | null;
};

export type SwimmerQualification = {
  exactAge: number;
  events: EventQualification[];
  metCount: number;
};

/**
 * Judge every event on a meet's table for one swimmer.
 *
 * `rows` is the swimmer's whole history; this filters it to the table's course
 * and event and hands the rest to `fastestMeetSwimInWindow`, so the MEET-only
 * and in-window gates cannot be skipped.
 */
export function qualifySwimmerForMeet(
  table: MeetQualifyingTable,
  meetStartDate: string,
  swimmer: { gender: "M" | "F"; dob: string },
  rows: ReadonlyArray<SwimRow>,
): SwimmerQualification {
  const exactAge = computeAge(swimmer.dob, meetStartDate);
  const window = meetQualifyingWindow(table, meetStartDate);

  const events: EventQualification[] = tableEvents(table.cuts).map((event) => {
    const cut = resolveMeetCut(
      table.cuts,
      { gender: swimmer.gender, exactAge },
      event,
    );
    const best = fastestMeetSwimInWindow(
      rows.filter(
        (r) =>
          r.distance === event.distance &&
          r.stroke === event.stroke &&
          r.course === table.course,
      ),
      window,
    );
    const cutMs = cut?.timeMs ?? null;
    const bestMs = best?.timeMs ?? null;
    return {
      ...event,
      cutMs,
      bestMs,
      bestDate: best?.swimDate ?? null,
      bestMeetName: best?.meetName ?? null,
      met: cutMs !== null && bestMs !== null && bestMs <= cutMs,
      gapMs: cutMs !== null && bestMs !== null ? bestMs - cutMs : null,
    };
  });

  return { exactAge, events, metCount: events.filter((e) => e.met).length };
}

// ---------------------------------------------------------------------------
// Presets — published tables, transcribed once
// ---------------------------------------------------------------------------

/** Column headings left → right: "11" (and under) … "16 and over". */
const HAS_AGES: ReadonlyArray<{ age: number; band: AgeBand }> = [
  { age: 11, band: "AND_UNDER" },
  { age: 12, band: "EXACT" },
  { age: 13, band: "EXACT" },
  { age: 14, band: "EXACT" },
  { age: 15, band: "EXACT" },
  { age: 16, band: "AND_OVER" },
];

type PresetRow = [Distance, Stroke, string, string, string, string, string, string];

/*
  HAS Championships 2026, "Championship qualifying times" (programme p.10).
  Transcribed VERBATIM, including the columns that look inverted (girls' 15
  column is faster than 16-and-over in several events, girls' 13 200 free is
  slower than 12). Those are the published entry standards; "correcting" them
  here would turn a swimmer away the organisers would accept, or the reverse.
*/
const HAS_2026_GIRLS: ReadonlyArray<PresetRow> = [
  [100, "FREE", "1:34.18", "1:29.35", "1:25.64", "1:23.69", "1:15.21", "1:21.90"],
  [200, "FREE", "3:36.03", "2:59.36", "3:08.25", "3:07.81", "2:50.34", "3:06.89"],
  [100, "BREAST", "2:02.00", "1:56.85", "1:54.64", "1:53.67", "1:42.91", "1:52.89"],
  [200, "BREAST", "4:37.43", "4:32.06", "4:22.72", "4:14.55", "4:00.68", "4:12.96"],
  [100, "BACK", "1:48.81", "1:43.17", "1:38.84", "1:37.83", "1:38.72", "1:37.35"],
  [200, "BACK", "4:04.73", "3:36.11", "3:43.04", "3:42.05", "3:31.27", "3:40.76"],
  [100, "FLY", "2:10.25", "2:06.68", "1:48.72", "1:47.90", "1:47.73", "1:47.11"],
  [200, "IM", "4:03.03", "3:51.22", "3:37.09", "3:32.06", "3:31.31", "3:30.82"],
];

const HAS_2026_BOYS: ReadonlyArray<PresetRow> = [
  [100, "FREE", "1:34.18", "1:27.00", "1:20.00", "1:15.01", "1:12.78", "1:12.02"],
  [200, "FREE", "3:55.53", "3:27.55", "3:04.20", "2:53.17", "2:48.54", "2:46.32"],
  [100, "BREAST", "2:09.74", "2:01.37", "1:52.51", "1:49.80", "1:41.48", "1:40.13"],
  [200, "BREAST", "4:50.50", "4:38.30", "4:20.36", "4:11.66", "4:00.10", "3:56.03"],
  [100, "BACK", "1:55.05", "1:45.00", "1:39.79", "1:36.11", "1:31.98", "1:30.84"],
  [200, "BACK", "4:09.30", "4:03.65", "3:52.22", "3:42.23", "3:22.44", "3:22.11"],
  [100, "FLY", "2:10.00", "2:02.38", "1:52.51", "1:43.07", "1:30.10", "1:28.53"],
  [200, "IM", "4:07.54", "3:43.34", "3:22.36", "3:12.83", "3:04.31", "3:02.20"],
];

function expand(gender: "M" | "F", rows: ReadonlyArray<PresetRow>): MeetCut[] {
  return rows.flatMap(([distance, stroke, ...times]) =>
    times.map((time, i) => ({
      gender,
      distance,
      stroke,
      age: HAS_AGES[i].age,
      band: HAS_AGES[i].band,
      timeMs: parseTime(time),
    })),
  );
}

export type MeetQualifyingPreset = {
  key: string;
  label: string;
  title: string;
  course: Course;
  /** Suggested first counting day — the person applying it may change it. */
  defaultFrom: string;
  cuts: ReadonlyArray<MeetCut>;
};

/**
 * Published tables the super-user can attach to a meet in one step. A preset is
 * copied onto the meet when applied, so editing this list never silently
 * re-judges a meet that has already been set up.
 */
export const MEET_QUALIFYING_PRESETS: ReadonlyArray<MeetQualifyingPreset> = [
  {
    key: "HAS_CHAMPS_2026",
    label: "HAS Championships 2026",
    title: "HAS Championships 2026 qualifying times",
    // The document does not print a course; the club confirmed long course.
    course: "LCM",
    // The first fixture of the 2026/27 calendar (`MEET_SEED`).
    defaultFrom: "2026-08-24",
    cuts: [...expand("F", HAS_2026_GIRLS), ...expand("M", HAS_2026_BOYS)],
  },
];

export function findMeetQualifyingPreset(key: string): MeetQualifyingPreset | null {
  return MEET_QUALIFYING_PRESETS.find((p) => p.key === key) ?? null;
}

/** The column heading for a cut — "11 & under", "13", "16 & over". */
export function ageBandLabel(cut: Pick<MeetCut, "age" | "band">): string {
  if (cut.band === "AND_UNDER") return `${cut.age} & under`;
  if (cut.band === "AND_OVER") return `${cut.age} & over`;
  return String(cut.age);
}
