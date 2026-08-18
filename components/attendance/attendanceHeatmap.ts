import type {
  HeatmapColumn,
  HeatmapLevelStyles,
} from "@/components/charts/heatmap";
import type { AttendanceStatus } from "./types";

/*
  Pure data helpers for the attendance heatmap strip, kept out of the component
  so they are testable without mounting Visx.

  The strip encodes two different things depending on which calendar variant is
  showing, and they are NOT the same kind of scale:

    • summary — an attendance RATE. Genuinely ordinal, so a five-step intensity
      ramp is honest: more colour means more of the squad turned up.

    • swimmer — one of PRESENT / LATE / EXCUSED / ABSENT. Categorical. Rendering
      four categories as four intensities of one hue would claim an order that
      does not exist, so each level gets its own semantic colour, and the three
      that need noticing also get a distinct texture (see STATUS_LEVEL_STYLES).
      That keeps the meaning off colour alone (DESIGN.md §8) and keeps it
      readable in greyscale and under colour-blindness.

  Level 0 means "no session" in both, which is why the status levels start at 1.
*/

export type HeatmapDay = {
  date: string;
  ratePct: number | null;
  status: AttendanceStatus | null;
  marked: number;
};

/** No session that day. Distinct from "a session nobody attended", which is 1. */
export const LEVEL_EMPTY = 0;

/**
 * Bucket an attendance rate into the ramp's four filled steps.
 *
 * A day with marks but nothing eligible to rate (everyone excused) still reads
 * as level 1 rather than empty — something happened, and showing it as "no
 * session" would hide a whole session from the strip.
 */
export function rateLevel(day: HeatmapDay): number {
  if (day.marked === 0) return LEVEL_EMPTY;
  if (day.ratePct === null) return 1;
  if (day.ratePct < 50) return 1;
  if (day.ratePct < 75) return 2;
  if (day.ratePct < 90) return 3;
  return 4;
}

/** Categorical level per status. Order here is presentation, never magnitude. */
const STATUS_LEVEL: Record<AttendanceStatus, number> = {
  ABSENT: 1,
  EXCUSED: 2,
  LATE: 3,
  PRESENT: 4,
};

export function statusLevel(day: HeatmapDay): number {
  if (day.status === null) return LEVEL_EMPTY;
  return STATUS_LEVEL[day.status];
}

/**
 * The squad-rate ramp: one hue, five steps. Solid throughout — an ordinal scale
 * reads correctly as intensity, and patterning it would add noise for nothing.
 */
export const RATE_LEVEL_STYLES: HeatmapLevelStyles = [
  { color: "var(--color-gray-100)", fillMode: "solid", pattern: "none" },
  { color: "var(--color-brand-100)", fillMode: "solid", pattern: "none" },
  { color: "var(--color-brand-300)", fillMode: "solid", pattern: "none" },
  { color: "var(--color-brand-500)", fillMode: "solid", pattern: "none" },
  { color: "var(--color-brand-700)", fillMode: "solid", pattern: "none" },
];

/**
 * The per-swimmer status styles: four semantic colours, three of them carrying a
 * distinct TEXTURE as well, so the four categories are never told apart by hue
 * alone (DESIGN.md §8).
 *
 * The stroke colour is what makes the texture exist. `heatmapLevelPatternRenderOptions`
 * takes the pattern's stroke from `patternColor` and the tile beneath it from
 * `color`; set those to the same token and the hatching is drawn in the tile's
 * own colour and vanishes, which is exactly the bug this file shipped with. So
 * every pattern here strokes in a value that CONTRASTS with its tile: near-white
 * on the saturated fills, dark grey on the light one.
 *
 * Present is deliberately solid. It is the resting, expected state and the one
 * that should read calmest; texture is reserved for the three that need
 * noticing.
 */
export const STATUS_LEVEL_STYLES: HeatmapLevelStyles = [
  { color: "var(--color-gray-100)", fillMode: "solid", pattern: "none" },
  {
    color: "var(--color-error-500)",
    fillMode: "pattern",
    pattern: "cross",
    patternColor: "var(--color-gray-25)",
  },
  {
    color: "var(--color-gray-300)",
    fillMode: "pattern",
    pattern: "diagonal",
    patternColor: "var(--color-gray-600)",
  },
  {
    color: "var(--color-warning-500)",
    fillMode: "pattern",
    pattern: "dots",
    patternColor: "var(--color-gray-25)",
  },
  { color: "var(--color-success-500)", fillMode: "solid", pattern: "none" },
];

/** Words for a level, so the legend and tooltip never depend on the swatch. */
export const RATE_LEVEL_LABELS = [
  "No session",
  "Under 50%",
  "50–74%",
  "75–89%",
  "90–100%",
] as const;

export const STATUS_LEVEL_LABELS = [
  "No session",
  "Absent",
  "Excused",
  "Late",
  "Present",
] as const;

/** Local-time date from an ISO `YYYY-MM-DD`, matching the rest of the app. */
function fromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lay the season out as week columns of seven weekday bins, GitHub-style.
 *
 * Bins are always Sunday-indexed (0–6); the chart's own `weekStartDay` rotates
 * them for display, so a Monday-first grid needs no reshaping here.
 *
 * Every day in [from, to] gets a bin, including days with no session — the gaps
 * are what give the strip its shape, and omitting them would silently shorten
 * the year.
 */
export function buildHeatmapColumns(
  days: ReadonlyArray<HeatmapDay>,
  from: string,
  to: string,
  level: (day: HeatmapDay) => number,
): HeatmapColumn[] {
  const start = fromIso(from);
  const end = fromIso(to);
  if (!start || !end || start > end) return [];

  const byDate = new Map(days.map((d) => [d.date, d]));

  // Back up to the Sunday on or before the range start so column 0 is a whole
  // week and every bin lands on its true weekday.
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const columns: HeatmapColumn[] = [];
  const cursor = new Date(gridStart);
  let week = 0;

  while (cursor <= end) {
    const bins = [];
    for (let i = 0; i < 7; i++) {
      const iso = toIsoLocal(cursor);
      const inRange = cursor >= start && cursor <= end;
      const day = inRange ? byDate.get(iso) : undefined;
      bins.push({
        bin: cursor.getDay(),
        count: day ? level(day) : LEVEL_EMPTY,
        date: new Date(cursor),
      });
      cursor.setTime(cursor.getTime() + DAY_MS);
      // Normalise back to midnight — stepping by a fixed 24h drifts an hour
      // across a daylight-saving boundary, which would skew every later bin.
      cursor.setHours(0, 0, 0, 0);
    }
    columns.push({ bin: week, bins });
    week += 1;
  }

  return columns;
}

/**
 * A one-sentence season summary in words, for the `sr-only` equivalent of the
 * strip.
 *
 * The strip is `aria-hidden`, and its old justification — "the month grid below
 * carries the same information" — was false twice over: the grid shows ONE
 * month against the strip's whole season, and below `lg` the grid is replaced
 * by the agenda entirely. A chart with no text equivalent is not accessible
 * because a different chart nearby is.
 */
export function seasonSummary(
  days: ReadonlyArray<HeatmapDay>,
  perSwimmer: boolean,
): string {
  const marked = days.filter((d) => d.marked > 0);
  if (marked.length === 0) return "No attendance recorded this season yet.";

  if (perSwimmer) {
    const counts = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 };
    for (const d of marked) if (d.status) counts[d.status] += 1;
    const attended = counts.PRESENT + counts.LATE;
    return (
      `${marked.length} session day${marked.length === 1 ? "" : "s"} this season: ` +
      `${attended} attended (${counts.LATE} late), ` +
      `${counts.ABSENT} absent, ${counts.EXCUSED} excused.`
    );
  }

  const rated = marked.filter((d) => d.ratePct !== null);
  if (rated.length === 0) {
    return `${marked.length} session days this season; none with a rateable turnout.`;
  }
  const mean = Math.round(
    rated.reduce((sum, d) => sum + (d.ratePct as number), 0) / rated.length,
  );
  const best = Math.max(...rated.map((d) => d.ratePct as number));
  const worst = Math.min(...rated.map((d) => d.ratePct as number));
  return (
    `${marked.length} session day${marked.length === 1 ? "" : "s"} this season, ` +
    `averaging ${mean}% turnout (best ${best}%, worst ${worst}%).`
  );
}
