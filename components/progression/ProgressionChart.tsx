"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  computeAge,
  computeQualifyProjection,
  formatTime,
  pickApplicableStandards,
  worldRecordMs,
  type Distance,
  type QualifyProjection,
  type StandardCut,
  type Stroke,
  type Tier,
  type TourDateByTier,
} from "@/lib/swim";
import { formatMonthYear, formatSeconds, formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  CHART,
  CHART_ANIM_MS,
  isoToMs,
  OVERLAY_TIER_ORDER,
  seriesColor,
  TIER_STYLE,
  type OverlayTier,
} from "@/components/analysis/chartTheme";

/*
  Progression line chart (Step 7, BRD §5.6). x = date, y = time, with the y-axis
  UPRIGHT (a faster time sits LOWER, so the axis reads like a stopwatch) and its
  floor pinned just under the event's world record — one second faster than the
  record for the plotted gender(s). No club swim ever reaches the record, so the
  line fills the grid instead of being crushed against a distant zero baseline.
  Every logged swim is plotted (all types); MEET swims are filled dots, trials /
  practice are hollow, and the current PB carries a ring. School-gala times
  (parent-entered, UNOFFICIAL — §R15) plot on the trajectory too but wear a
  distinct hollow diamond in the warning tone so they can never be mistaken for
  an official swim or a best. One line per swimmer for a group.

  Step 10 overlays the qualifying cuts (LCM only, §4.9): applicable L2/L3/SANJ
  cuts for the swimmer's EXACT age become horizontal tier lines. A cut can step
  across a birthday, so a single swimmer's line is drawn as dated segments joined
  by a vertical riser at each birthday — one stepped line, not two floating cuts;
  a swim plotted on the fast side of a line (below it, on the upright axis) has
  met that tier. For a group the lines only appear when every swimmer shares one
  exact age (and gender) — otherwise a single line would be a lie.

  Step 14 adds the time-to-qualify projection (single swimmer, LCM, one target
  tier — §5.6). All the judgement is the pure `computeQualifyProjection`; here we
  only draw its result: a MUTED, dashed continuation of the recent meet trend to
  where it meets the target cut, marked with an estimated month. It is deliberately
  quieter than the real series so it never competes with logged data, and it is
  always chaperoned by the mandatory "estimate only" caveat. When the guard rails
  refuse a projection (too few meets, no downward trend, beyond 12 months, already
  qualified) we draw nothing and say why instead.
*/

export type ProgressionPoint = {
  resultId: string;
  swimDate: string;
  timeMs: number;
  swimType: "MEET" | "TIME_TRIAL" | "PRACTICE" | "SCHOOL_GALA";
  isMeet: boolean;
  isPB: boolean;
};

export type StandardRow = StandardCut & { gender: "M" | "F"; tier: Tier };

export type ProgressionSeries = {
  swimmerId: string;
  name: string;
  gender: "M" | "F";
  // null when the caller may not see this swimmer's exact DOB (a "public" view);
  // the qualifying-cut overlay is then omitted for the series (see buildTierOverlay).
  dob: string | null;
  points: ProgressionPoint[];
};

// A training-note marker for the single-swimmer overlay (§R16): a subtle flag at
// the note's phase date so a training focus lines up with the time trend.
export type NoteMarker = {
  noteDate: string;
  focus: string | null;
  scopeLabel: string;
};

type ChartPoint = ProgressionPoint & { t: number };

function msToShort(ms: number): string {
  const iso = new Date(ms).toISOString().slice(0, 10);
  return formatShortDate(iso);
}

export function ProgressionChart({
  series,
  single,
  distance,
  stroke,
  course,
  standards,
  projectionTier = null,
  noteMarkers,
  tourDates = {},
}: {
  series: ProgressionSeries[];
  single: boolean;
  // The event (distance + stroke) — used to look up the world record that pins
  // the y-axis floor. Course comes in separately since records differ per course.
  distance: Distance;
  stroke: Stroke;
  course: "SCM" | "LCM";
  standards: StandardRow[];
  // The target tier for the time-to-qualify projection (§5.6). Non-null only for
  // a single swimmer on LCM; the projection draws toward this tier's cut.
  projectionTier?: Tier | null;
  // Training-note markers (§R16) — single-swimmer only; undefined/empty hides them.
  noteMarkers?: NoteMarker[];
  // Tour dates by tier — the projection targets the age-on-tour-day cut.
  tourDates?: TourDateByTier;
}) {
  const reduced = usePrefersReducedMotion();
  // Phone-width: a slightly shorter plot and slimmer time gutter keep the
  // chart plus its summary strip inside one viewport without squeezing the data.
  const narrow = useMediaQuery("(max-width: 639px)");

  const data: Array<{ color: string; name: string; points: ChartPoint[] }> = series.map(
    (s, i) => ({
      color: single ? CHART.accent : seriesColor(i),
      name: s.name,
      points: s.points.map((p) => ({ ...p, t: isoToMs(p.swimDate) })),
    }),
  );

  // Shared numeric domains across every series (dates differ per swimmer, so a
  // numeric time axis is the honest way to place them on one timeline).
  const allTimes = data.flatMap((s) => s.points.map((p) => p.timeMs));
  const allT = data.flatMap((s) => s.points.map((p) => p.t));
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);

  // Time-to-qualify projection (§5.6) — single swimmer + LCM + a chosen tier.
  const projection = buildProjection(
    series,
    standards,
    single,
    course,
    projectionTier,
    tourDates,
  );
  const projected = projection?.status === "projected" ? projection : null;

  // The projection crosses in the FUTURE, past the last real swim, so the x-axis
  // has to stretch to reach it (the overlay still spans only the real range).
  const domainTMax = projected ? Math.max(tMax, projected.toT) : tMax;
  // A one-day pad keeps single-date series from collapsing onto the axis edge.
  const tSpan = domainTMax - tMin;
  const tPad = tSpan === 0 ? 86_400_000 : Math.round(tSpan * 0.04);

  // Qualifying-cut overlay (§4.9). The long-course cut is the reference on SCM
  // too, so it's drawn on both courses (the server sends no rows for an event
  // with no cut, so nothing is faked). Drawn across the real swim range (not the
  // padding), so birthday steps line up with the plotted swims and the padding
  // stays clean breathing room at the edges.
  const overlay = buildTierOverlay(series, standards, single, tMin, tMax);

  // Training-note markers (§R16) — single swimmer only. Group notes that share a
  // date into one flag (its title lists them) so a busy phase doesn't stack flags,
  // and drop any whose date falls outside the visible x-domain.
  const markers = buildNoteMarkers(
    single ? noteMarkers : undefined,
    tMin - tPad,
    domainTMax + tPad,
  );

  // Fold the drawn cut values (and the projection's endpoints) into the y-domain
  // so a cut faster or slower than every swim still shows — the gap to the next
  // tier is the point of the view.
  const cutYs = overlay
    ? overlay.lines.flatMap((l) => (l.y2 === undefined ? [l.y] : [l.y, l.y2]))
    : [];
  const projYs = projected ? [projected.fromMs, projected.toMs] : [];
  const yLo = Math.min(...allTimes, ...cutYs, ...projYs);
  const yHi = Math.max(...allTimes, ...cutYs, ...projYs);

  // Y-axis floor: one second faster than the world record, so the line fills the
  // grid rather than sinking toward zero. Use the fastest record among the
  // genders actually plotted (mixed groups → the outright record) so no line can
  // ever dip below the floor. Clamp below the fastest plotted value as a belt-
  // and-braces guard against a stale record, and fall back to a zero-anchored
  // axis when the event has no listed record.
  const genders = Array.from(new Set(series.map((s) => s.gender)));
  const wr =
    genders.length === 1
      ? worldRecordMs(distance, stroke, course, genders[0])
      : worldRecordMs(distance, stroke, course);
  const yFloor = wr === null ? 0 : Math.min(wr - 1_000, yLo);

  // Breathing room above the top value; the floor sits at yFloor, not zero.
  const yPad = Math.max(500, Math.round((yHi - yFloor) * 0.08));

  const projColor = projectionTier ? TIER_STYLE[projectionTier].color : CHART.accent;

  // The chart is SVG; give assistive tech a plain-language read of each line.
  const summary = series
    .map((s) => {
      const pb = s.points.find((p) => p.isPB);
      const meets = s.points.filter((p) => p.isMeet).length;
      const galas = s.points.filter((p) => p.swimType === "SCHOOL_GALA").length;
      return `${s.name}: ${s.points.length} swims, ${meets} meets${
        galas ? `, ${galas} unofficial school gala${galas === 1 ? "" : "s"}` : ""
      }${pb ? `, personal best ${formatTime(pb.timeMs)}` : ""}.`;
    })
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{ width: "100%", height: narrow ? 300 : 360 }}
        role="img"
        aria-label={`Progression chart, time over date with a faster time plotted lower; the axis floor sits just under the world record. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 20, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="t"
              domain={[tMin - tPad, domainTMax + tPad]}
              tickFormatter={msToShort}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              minTickGap={40}
              height={22}
            />
            <YAxis
              type="number"
              domain={[yFloor, yHi + yPad]}
              tickFormatter={(v: number) => formatTime(v)}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              width={narrow ? 54 : 64}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }}
              content={<ProgressionTooltip single={single} />}
            />
            {/* Training-note markers (§R16): a quiet dashed vertical at each phase
                date topped with a small flag; the focus shows on hover/tap via the
                SVG title. Rendered first so cut lines and swims sit on top. */}
            {markers.map((m) => (
              <ReferenceLine
                key={`note-${m.t}`}
                x={m.t}
                stroke="var(--color-gray-400)"
                strokeWidth={1}
                strokeDasharray="2 4"
                strokeOpacity={0.5}
                ifOverflow="hidden"
                label={<NoteFlagLabel title={m.title} />}
              />
            ))}
            {overlay?.lines.map((l) => (
              <ReferenceLine
                key={l.key}
                {...(l.full
                  ? { y: l.y }
                  : l.y2 !== undefined
                    ? {
                        segment: [
                          { x: l.x1, y: l.y },
                          { x: l.x1, y: l.y2 },
                        ],
                      }
                    : {
                        segment: [
                          { x: l.x1, y: l.y },
                          { x: l.x2, y: l.y },
                        ],
                      })}
                stroke={l.color}
                strokeWidth={1.5}
                strokeDasharray={l.dash}
                strokeOpacity={0.9}
                ifOverflow="extendDomain"
              />
            ))}
            {/* Projection (§5.6): a muted, dashed continuation of the recent
                trend to where it meets the cut. Rendered under the real series so
                logged swims always sit on top and read as the primary data. */}
            {projected && (
              <>
                {/* A faint level guide extends the target cut out to the crossing
                    so the eye sees the dashed trend "arrive" at the line. */}
                <ReferenceLine
                  segment={[
                    { x: tMax, y: projected.toMs },
                    { x: projected.toT, y: projected.toMs },
                  ]}
                  stroke={projColor}
                  strokeWidth={1}
                  strokeDasharray="1 5"
                  strokeOpacity={0.3}
                  ifOverflow="extendDomain"
                />
                <ReferenceLine
                  segment={[
                    { x: projected.fromT, y: projected.fromMs },
                    { x: projected.toT, y: projected.toMs },
                  ]}
                  stroke={projColor}
                  strokeWidth={1.75}
                  strokeDasharray="2 4"
                  strokeOpacity={0.55}
                  ifOverflow="extendDomain"
                />
                <ReferenceDot
                  x={projected.toT}
                  y={projected.toMs}
                  r={3.5}
                  fill="var(--color-gray-25)"
                  stroke={projColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.9}
                  ifOverflow="extendDomain"
                />
              </>
            )}
            {data.map((s) => (
              <Line
                key={s.name}
                data={s.points}
                type="linear"
                dataKey="timeMs"
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                isAnimationActive={!reduced}
                animationDuration={CHART_ANIM_MS}
                dot={(props: DotProps) => <ProgressionDot {...props} color={s.color} />}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-gray-25)" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {overlay && overlay.legend.length > 0 && (
        <TierOverlayLegend entries={overlay.legend} single={single} />
      )}

      {markers.length > 0 && (
        // The flags' content, readable without a pointer: hover works on
        // desktop (the SVG <title>), but touch and keyboard users get the same
        // phases as plain text. One row per flag, chart order.
        <div className="flex flex-col gap-1 px-1 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <svg aria-hidden width="14" height="12" viewBox="0 0 14 12">
              <line
                x1="2"
                y1="0"
                x2="2"
                y2="12"
                stroke="var(--color-gray-400)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <path d="M2 1 L9 3 L2 5 Z" fill="var(--color-gray-400)" />
            </svg>
            <span>Training phases marked on the chart:</span>
          </div>
          <ul className="flex flex-col gap-0.5 pl-5">
            {markers.map((m) => (
              <li key={m.t} className="text-ink-muted">
                {m.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {projection && projectionTier && (
        <ProjectionNote projection={projection} tier={projectionTier} color={projColor} />
      )}

      <Legend series={data} single={single} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training-note markers (§R16)
// ---------------------------------------------------------------------------

type ChartMarker = { t: number; title: string };

// Group note markers by their (numeric) date so notes sharing a day become one
// flag whose hover title lists them, and drop any outside the visible x-window.
function buildNoteMarkers(
  markers: NoteMarker[] | undefined,
  xLo: number,
  xHi: number,
): ChartMarker[] {
  if (!markers || markers.length === 0) return [];
  const byT = new Map<number, string[]>();
  for (const m of markers) {
    const t = isoToMs(m.noteDate);
    if (Number.isNaN(t) || t < xLo || t > xHi) continue;
    const label = m.focus ? `${m.focus} · ${m.scopeLabel}` : m.scopeLabel;
    const arr = byT.get(t);
    if (arr) arr.push(label);
    else byT.set(t, [label]);
  }
  return [...byT.entries()]
    .map(([t, labels]) => ({
      t,
      title: `${msToShort(t)} — ${labels.join(" · ")}`,
    }))
    .sort((a, b) => a.t - b.t);
}

// The flag drawn at the top of a note-marker line. Recharts hands the label a
// viewBox in plot pixels; we anchor a small flag at its top-left and expose the
// focus as an SVG <title> (native hover/tap tooltip, no extra chart chrome).
function NoteFlagLabel(props: {
  title: string;
  viewBox?: { x?: number; y?: number };
}) {
  const { title, viewBox } = props;
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  return (
    <g transform={`translate(${x}, ${y})`} style={{ cursor: "default" }}>
      <title>{title}</title>
      {/* A generous transparent hit area so the flag is easy to hover/tap. */}
      <rect x={-4} y={-2} width={16} height={14} fill="transparent" />
      <path d="M0 1 L8 3.5 L0 6 Z" fill="var(--color-gray-400)" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Time-to-qualify projection (Step 14, §5.6)
// ---------------------------------------------------------------------------
//
// Pure glue: resolve the swimmer's exact-age cut for the chosen tier, then hand
// their meet times to `computeQualifyProjection`, which owns every guard rail
// (≥ 4 meets, a real downward trend, the ~12-month horizon). Projection is a
// single-swimmer, LCM-only affair; anything else returns null and draws nothing.

function buildProjection(
  series: ProgressionSeries[],
  standards: StandardRow[],
  single: boolean,
  course: "SCM" | "LCM",
  tier: Tier | null,
  tourDates: TourDateByTier,
): QualifyProjection | null {
  if (!single || course !== "LCM" || tier === null || series.length === 0) {
    return null;
  }
  const s = series[0];
  // No DOB (a "public" view) => no exact age => nothing to project against.
  if (s.dob === null) return null;
  const dob = s.dob;
  const today = todayIso();
  const rows = standards.filter((r) => r.gender === s.gender);
  // The projection aims at a FUTURE swim, so with a tour date it targets the
  // cut for the age the swimmer will be on tour day; else today's exact age.
  const tourDate = tourDates[tier];
  const cutAge = computeAge(dob, tourDate ?? today);
  const cuts = pickApplicableStandards(rows, cutAge);
  const cutMs = cuts[tier] ?? null;
  const meets = s.points
    .filter((p) => p.isMeet)
    .map((p) => ({ swimDate: p.swimDate, timeMs: p.timeMs }));
  return computeQualifyProjection(meets, cutMs, today);
}

const TIER_LABEL: Record<Tier, string> = {
  LEVEL_2: "Level 2",
  LEVEL_3: "Level 3",
  SANJ: "SANJ",
};

// A monthly drop reads more naturally to a coach than ms-per-day; slope is
// negative (improving), so negate to state it as time gained.
function monthlyDrop(slopeMsPerDay: number): string {
  return formatSeconds(-slopeMsPerDay * (365.25 / 12));
}

function ProjectionNote({
  projection,
  tier,
  color,
}: {
  projection: QualifyProjection;
  tier: Tier;
  color: string;
}) {
  const label = TIER_LABEL[tier];

  // The projected case is the only one that draws a line — so it, and only it,
  // carries the mandatory "estimate only" caveat right beside the estimate.
  if (projection.status === "projected") {
    return (
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden width="18" height="8" viewBox="0 0 18 8">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke={color}
                strokeWidth="1.75"
                strokeDasharray="2 4"
                strokeOpacity="0.7"
              />
            </svg>
            <span className="font-medium text-ink">Projected {label}</span>
          </span>
          <span className="text-ink-muted">
            on track for{" "}
            <span className="time tnum text-ink">{formatTime(projection.cutMs)}</span>{" "}
            around{" "}
            <span className="font-medium text-ink">
              {formatMonthYear(projection.etaIso)}
            </span>
            <span className="text-ink-faint">
              {" "}
              · ~{monthlyDrop(projection.slopeMsPerDay)}s/month
            </span>
          </span>
        </div>
        <p className="text-xs italic text-ink-muted">
          Estimate only: assumes the recent rate continues. Not a guaranteed date.
        </p>
      </div>
    );
  }

  // Every other outcome draws nothing; say plainly why, in the same quiet voice.
  const reason: string =
    projection.status === "no_cut"
      ? `No ${label} cut for this event at this age, so there's nothing to project.`
      : projection.status === "already_qualified"
        ? `Already meets the ${label} cut (${formatTime(projection.cutMs)}); no projection needed.`
        : projection.status === "not_enough_data"
          ? `Not enough meet times to project ${label}: ${projection.meetCount} of 4 needed.`
          : projection.status === "no_trend"
            ? `No clear downward trend in recent meets, so no ${label} estimate is shown.`
            : `${label} is beyond 12 months at the current rate, too far out to estimate.`;

  const positive = projection.status === "already_qualified";
  return (
    <div className="flex items-center gap-2 border-t border-border pt-3 text-xs">
      {positive ? (
        <span className="font-medium text-success-ink">{reason}</span>
      ) : (
        <span className="text-ink-muted">{reason}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Qualifying-cut overlay (Step 10, §4.9) — LCM only
// ---------------------------------------------------------------------------
//
// For a single swimmer the applicable cut for a tier can change on a birthday,
// so each tier is drawn as one or more dated SEGMENTS (a step function) at the
// cut for the age held over that stretch. For a group the cuts only make sense
// when every swimmer shares one exact age AND gender — otherwise a single line
// would misrepresent someone, so we draw nothing.

type OverlayLine = {
  key: string;
  color: string;
  dash: string;
  y: number;
  full: boolean; // spans the whole x-domain (group) vs a dated segment (single)
  x1: number;
  x2: number;
  // When set, this line is a vertical RISER at x1 connecting the cut before a
  // birthday (y) to the cut after it (y2) — so a stepped cut reads as one line.
  y2?: number;
};

type OverlayLegendEntry = {
  tier: OverlayTier;
  color: string;
  glyph: string;
  label: string;
  cutMs: number;
};

type TierOverlay = { lines: OverlayLine[]; legend: OverlayLegendEntry[] };

/** Epoch-ms of the swimmer's birthday in the year they turn `age`. */
function birthdayMs(dob: string, age: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]) + age, Number(m[2]) - 1, Number(m[3]));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildTierOverlay(
  series: ProgressionSeries[],
  standards: StandardRow[],
  single: boolean,
  x0: number,
  x1: number,
): TierOverlay | null {
  if (series.length === 0 || standards.length === 0) return null;

  const cutsFor = (gender: "M" | "F"): Array<StandardCut & { tier: Tier }> =>
    standards.filter((r) => r.gender === gender);

  if (single) {
    const s = series[0];
    // No DOB (a "public" view of another swimmer) => no exact-age cut to draw.
    if (s.dob === null) return null;
    const dob = s.dob;
    const rows = cutsFor(s.gender);
    if (rows.length === 0) return null;

    // Breakpoints: the padded start, each birthday inside the window, the end.
    const ageAtStart = computeAge(dob, new Date(x0));
    const ageAtEnd = computeAge(dob, new Date(x1));
    const breaks = [x0];
    for (let a = ageAtStart + 1; a <= ageAtEnd; a++) {
      const b = birthdayMs(dob, a);
      if (b > x0 && b < x1) breaks.push(b);
    }
    breaks.push(x1);

    // One segment per (tier, era); merge neighbours that share a cut so a tier
    // whose value is unchanged across a birthday reads as a single line.
    const byTier = new Map<
      OverlayTier,
      Array<{ x1: number; x2: number; y: number }>
    >();
    for (let i = 0; i < breaks.length - 1; i++) {
      const segStart = breaks[i];
      const segEnd = breaks[i + 1];
      const age = computeAge(dob, new Date(segStart));
      const cuts = pickApplicableStandards(rows, age);
      for (const tier of OVERLAY_TIER_ORDER) {
        const y = cuts[tier];
        if (y === undefined) continue;
        const segs = byTier.get(tier) ?? [];
        const last = segs[segs.length - 1];
        if (last && last.y === y && last.x2 === segStart) {
          last.x2 = segEnd; // extend the previous run
        } else {
          segs.push({ x1: segStart, x2: segEnd, y });
        }
        byTier.set(tier, segs);
      }
    }

    const lines: OverlayLine[] = [];
    for (const tier of OVERLAY_TIER_ORDER) {
      const segs = byTier.get(tier);
      if (!segs) continue;
      const st = TIER_STYLE[tier];
      segs.forEach((seg, i) => {
        lines.push({
          key: `${tier}-${i}`,
          color: st.color,
          dash: st.dash,
          y: seg.y,
          full: false,
          x1: seg.x1,
          x2: seg.x2,
        });
        // Bridge a birthday step with a vertical riser so the two dated segments
        // read as one cut that moved, not two separate cuts for the same tier.
        const next = segs[i + 1];
        if (next && next.y !== seg.y) {
          lines.push({
            key: `${tier}-riser-${i}`,
            color: st.color,
            dash: st.dash,
            y: seg.y,
            y2: next.y,
            full: false,
            x1: seg.x2,
            x2: seg.x2,
          });
        }
      });
    }

    // Legend anchors to the cut at the swimmer's age TODAY — "how close now".
    const legend = legendFor(rows, computeAge(dob, todayIso()));
    return lines.length > 0 ? { lines, legend } : null;
  }

  // Group: draw only when every swimmer shares one exact age and one gender —
  // and only when EVERY swimmer's DOB is visible (a public view hides it, and a
  // single shared line can't honestly stand in for a swimmer whose age is unknown).
  const today = todayIso();
  const first = series[0];
  if (first.dob === null) return null;
  const gender = first.gender;
  const age = computeAge(first.dob, today);
  const uniform = series.every(
    (s) => s.dob !== null && s.gender === gender && computeAge(s.dob, today) === age,
  );
  if (!uniform) return null;

  const rows = cutsFor(gender);
  const cuts = pickApplicableStandards(rows, age);
  const lines: OverlayLine[] = [];
  for (const tier of OVERLAY_TIER_ORDER) {
    const y = cuts[tier];
    if (y === undefined) continue;
    const st = TIER_STYLE[tier];
    lines.push({
      key: tier,
      color: st.color,
      dash: st.dash,
      y,
      full: true,
      x1: x0,
      x2: x1,
    });
  }
  return lines.length > 0 ? { lines, legend: legendFor(rows, age) } : null;
}

function legendFor(
  rows: Array<StandardCut & { tier: Tier }>,
  age: number,
): OverlayLegendEntry[] {
  const cuts = pickApplicableStandards(rows, age);
  const entries: OverlayLegendEntry[] = [];
  for (const tier of OVERLAY_TIER_ORDER) {
    const cutMs = cuts[tier];
    if (cutMs === undefined) continue;
    const st = TIER_STYLE[tier];
    entries.push({ tier, color: st.color, glyph: st.glyph, label: st.label, cutMs });
  }
  return entries;
}

function TierOverlayLegend({
  entries,
  single,
}: {
  entries: OverlayLegendEntry[];
  single: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs">
      <span className="font-medium text-ink-muted">
        {single ? "Qualifying cuts" : "Qualifying cuts (shared age)"}
      </span>
      {entries.map((e) => (
        <span key={e.tier} className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="18" height="8" viewBox="0 0 18 8">
            <line
              x1="0"
              y1="4"
              x2="18"
              y2="4"
              stroke={e.color}
              strokeWidth="1.5"
              strokeDasharray={TIER_STYLE[e.tier].dash}
            />
          </svg>
          <span aria-hidden style={{ color: e.color }} className="text-2xs leading-none">
            {e.glyph}
          </span>
          <span className="font-medium text-ink">{e.label}</span>
          <span className="time tnum text-ink-muted">{formatTime(e.cutMs)}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom dot — meet vs trial/practice vs PB
// ---------------------------------------------------------------------------

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

function ProgressionDot({
  cx,
  cy,
  payload,
  color,
}: DotProps & { color: string }) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  const { isMeet, isPB } = payload;

  // School gala (unofficial, §R15): a distinct hollow DIAMOND in the warning tone
  // — never a filled/PB dot, never the same hollow circle as a trial/practice —
  // so it reads at a glance as "on the trajectory, but not an official time".
  if (payload.swimType === "SCHOOL_GALA") {
    const r = 4.5;
    return (
      <path
        d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`}
        fill="var(--color-gray-25)"
        stroke="var(--color-warning-500)"
        strokeWidth={1.75}
      />
    );
  }

  if (isPB) {
    // PB: filled core with an outer ring so it reads as the anchor point.
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} />
        <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--color-gray-25)" strokeWidth={1.5} />
      </g>
    );
  }
  if (isMeet) {
    // Meet: filled dot.
    return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--color-gray-25)" strokeWidth={1} />;
  }
  // Trial / practice: hollow dot.
  return <circle cx={cx} cy={cy} r={3} fill="var(--color-gray-25)" stroke={color} strokeWidth={1.5} />;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<ProgressionPoint["swimType"], string> = {
  MEET: "Meet",
  TIME_TRIAL: "Trial",
  PRACTICE: "Practice",
  SCHOOL_GALA: "School gala",
};

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint; name?: string; color?: string }>;
  single: boolean;
};

function ProgressionTooltip({ active, payload, single }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const p = entry.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-theme-md">
      {!single && entry.name && (
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.name}
        </p>
      )}
      <p className="time tnum mt-0.5 text-ink">{formatTime(p.timeMs)}</p>
      <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
        <span>{msToShort(p.t)}</span>
        <span aria-hidden className="h-3 w-px bg-border" />
        {p.swimType === "SCHOOL_GALA" ? (
          <span className="font-medium text-warning-ink">School gala · unofficial</span>
        ) : (
          <span>{TYPE_LABEL[p.swimType]}</span>
        )}
        {p.isPB && <span className="font-medium text-brand-500">PB</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend — marks (single) or swimmer swatches (group)
// ---------------------------------------------------------------------------

function Legend({
  series,
  single,
}: {
  series: Array<{ color: string; name: string }>;
  single: boolean;
}) {
  if (single) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-ink-muted">
        <LegendMark>
          <span className="size-2.5 rounded-full bg-brand-500" /> Meet
        </LegendMark>
        <LegendMark>
          <span className="size-2.5 rounded-full border-[1.5px] border-brand-500 bg-gray-25" /> Trial /
          practice
        </LegendMark>
        <LegendMark>
          <span className="relative flex size-3.5 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-[1.5px] border-brand-500 opacity-40" />
            <span className="size-2 rounded-full bg-brand-500" />
          </span>
          Personal best
        </LegendMark>
        <LegendMark>
          <GalaDiamond />
          <span className="text-warning-ink">School gala · unofficial</span>
        </LegendMark>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-ink-muted">
      {series.map((s) => (
        <LegendMark key={s.name}>
          <span className="size-2.5 rounded-full" style={{ background: s.color }} />
          <span className="text-ink">{s.name}</span>
        </LegendMark>
      ))}
      <LegendMark>
        <GalaDiamond />
        <span className="text-warning-ink">school gala · unofficial</span>
      </LegendMark>
      <span className="text-ink-faint">Filled = meet · hollow = trial/practice · ring = PB</span>
    </div>
  );
}

function LegendMark({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

/** The chart's school-gala marker (hollow warning-tone diamond), for legends. */
function GalaDiamond() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M6 1 L11 6 L6 11 L1 6 Z"
        fill="var(--color-gray-25)"
        stroke="var(--color-warning-500)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
