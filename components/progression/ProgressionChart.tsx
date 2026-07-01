"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  computeAge,
  formatTime,
  pickApplicableStandards,
  type StandardCut,
  type Tier,
} from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
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
  INVERTED so a faster (lower) time sits higher and improvement reads as "up".
  Every logged swim is plotted (all types); MEET swims are filled dots, trials /
  practice are hollow, and the current PB carries a ring. One line per swimmer
  for a group.

  Step 10 overlays the qualifying cuts (LCM only, §4.9): applicable L2/L3/SANJ
  cuts for the swimmer's EXACT age become horizontal tier lines. A cut can step
  across a birthday, so a single swimmer's line is drawn as dated segments; a
  swim plotted on the fast side of a line (above it, since the axis is inverted)
  has met that tier. For a group the lines only appear when every swimmer shares
  one exact age (and gender) — otherwise a single line would be a lie.
*/

export type ProgressionPoint = {
  resultId: string;
  swimDate: string;
  timeMs: number;
  swimType: "MEET" | "TIME_TRIAL" | "PRACTICE";
  isMeet: boolean;
  isPB: boolean;
};

export type StandardRow = StandardCut & { gender: "M" | "F"; tier: Tier };

export type ProgressionSeries = {
  swimmerId: string;
  name: string;
  gender: "M" | "F";
  dob: string;
  points: ProgressionPoint[];
};

type ChartPoint = ProgressionPoint & { t: number };

function msToShort(ms: number): string {
  const iso = new Date(ms).toISOString().slice(0, 10);
  return formatShortDate(iso);
}

export function ProgressionChart({
  series,
  single,
  course,
  standards,
}: {
  series: ProgressionSeries[];
  single: boolean;
  course: "SCM" | "LCM";
  standards: StandardRow[];
}) {
  const reduced = usePrefersReducedMotion();

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
  // A one-day pad keeps single-date series from collapsing onto the axis edge.
  const tPad = tMin === tMax ? 86_400_000 : Math.round((tMax - tMin) * 0.04);

  // Qualifying-cut overlay — LCM only (§4.9). Drawn across the real swim range
  // (not the padding), so the birthday steps line up with the plotted swims and
  // the padding stays clean breathing room at the edges.
  const overlay =
    course === "LCM" ? buildTierOverlay(series, standards, single, tMin, tMax) : null;

  // Fold the drawn cut values into the y-domain so a cut faster or slower than
  // every swim still shows — the gap to the next tier is the point of the view.
  const cutYs = overlay ? overlay.lines.map((l) => l.y) : [];
  const yLo = Math.min(...allTimes, ...cutYs);
  const yHi = Math.max(...allTimes, ...cutYs);
  const yPad = Math.max(500, Math.round((yHi - yLo) * 0.12));

  // The chart is SVG; give assistive tech a plain-language read of each line.
  const summary = series
    .map((s) => {
      const pb = s.points.find((p) => p.isPB);
      const meets = s.points.filter((p) => p.isMeet).length;
      return `${s.name}: ${s.points.length} swims, ${meets} meets${
        pb ? `, personal best ${formatTime(pb.timeMs)}` : ""
      }.`;
    })
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{ width: "100%", height: 360 }}
        role="img"
        aria-label={`Progression chart, time over date with a faster time plotted higher. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 20, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="t"
              domain={[tMin - tPad, tMax + tPad]}
              tickFormatter={msToShort}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              minTickGap={40}
              height={22}
            />
            <YAxis
              type="number"
              reversed
              domain={[yLo - yPad, yHi + yPad]}
              tickFormatter={(v: number) => formatTime(v)}
              tick={{ fill: CHART.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }}
              content={<ProgressionTooltip single={single} />}
            />
            {overlay?.lines.map((l) => (
              <ReferenceLine
                key={l.key}
                {...(l.full
                  ? { y: l.y }
                  : { segment: [
                      { x: l.x1, y: l.y },
                      { x: l.x2, y: l.y },
                    ] })}
                stroke={l.color}
                strokeWidth={1.5}
                strokeDasharray={l.dash}
                strokeOpacity={0.9}
                ifOverflow="extendDomain"
              />
            ))}
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

      <Legend series={data} single={single} />
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
    const rows = cutsFor(s.gender);
    if (rows.length === 0) return null;

    // Breakpoints: the padded start, each birthday inside the window, the end.
    const ageAtStart = computeAge(s.dob, new Date(x0));
    const ageAtEnd = computeAge(s.dob, new Date(x1));
    const breaks = [x0];
    for (let a = ageAtStart + 1; a <= ageAtEnd; a++) {
      const b = birthdayMs(s.dob, a);
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
      const age = computeAge(s.dob, new Date(segStart));
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
      segs.forEach((seg, i) =>
        lines.push({
          key: `${tier}-${i}`,
          color: st.color,
          dash: st.dash,
          y: seg.y,
          full: false,
          x1: seg.x1,
          x2: seg.x2,
        }),
      );
    }

    // Legend anchors to the cut at the swimmer's age TODAY — "how close now".
    const legend = legendFor(rows, computeAge(s.dob, todayIso()));
    return lines.length > 0 ? { lines, legend } : null;
  }

  // Group: draw only when every swimmer shares one exact age and one gender.
  const today = todayIso();
  const gender = series[0].gender;
  const age = computeAge(series[0].dob, today);
  const uniform = series.every(
    (s) => s.gender === gender && computeAge(s.dob, today) === age,
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
          <span aria-hidden style={{ color: e.color }} className="text-[0.7rem] leading-none">
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
        <span>{TYPE_LABEL[p.swimType]}</span>
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
      <span className="text-ink-faint">Filled = meet · hollow = trial/practice · ring = PB</span>
    </div>
  );
}

function LegendMark({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}
