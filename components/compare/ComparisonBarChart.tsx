"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatTime, type Tier } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  CHART,
  CHART_ANIM_MS,
  OVERLAY_TIER_ORDER,
  TIER_STYLE,
} from "@/components/analysis/chartTheme";

/*
  Horizontal bar chart of each swimmer's headline MEET PB (BRD §5.5). Fastest at
  the top (mirrors the leaderboard order). Shorter bar = faster; each bar is
  labelled with its exact time so the chart never asks the eye to estimate.

  Step 10 overlay (§4.9): when one exact age + gender is pinned, the applicable
  L2/L3/SANJ cuts are drawn as vertical threshold lines (a bar ending left of a
  line has met that tier). For "all ages" the lines are suppressed — each
  swimmer's cut differs by age — and every bar is instead coloured by the hardest
  tier its own PB meets. The long-course cut is the reference on both courses, so
  colouring applies on SCM too (an event with no cut leaves bars on-accent).
*/

export type CompareBar = {
  swimmerId: string;
  name: string;
  timeMs: number;
  swimDate: string;
  meetName: string | null;
  highestTier: Tier | null;
};

/** Vertical cut lines for one pinned (age, gender); empty suppresses them. */
export type ComparisonCut = { tier: Tier; timeMs: number };

// "No tier" must not read as a tier: on LCM the no-tier bar uses the gray
// --tier-none the system reserves for it, never the brand accent (which would
// read as an action, not a standard). SCM has no standards at all, so its bars
// keep the plain brand accent.
function barColor(tier: Tier | null, overlay: boolean): string {
  if (!overlay) return CHART.accent;
  return tier ? TIER_STYLE[tier].color : "var(--color-tier-none)";
}

export function ComparisonBarChart({
  rows,
  cuts,
  overlay,
}: {
  rows: CompareBar[];
  cuts: ComparisonCut[];
  overlay: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  // Phone-width: shrink the label gutters so the bars keep most of the plot.
  // Decorative-only trade-off — the leaderboard table carries the full names.
  const narrow = useMediaQuery("(max-width: 639px)");

  // Fastest first in the leaderboard = top of the chart. Recharts plots the
  // first category at the bottom by default, so reverse the axis to match.
  const data = rows;
  const rowHeight = 44;
  const height = Math.max(160, data.length * rowHeight + 48);

  // Longest name drives the label gutter so names never clip or over-reserve.
  const longestName = data.reduce((m, r) => Math.max(m, r.name.length), 0);
  const yWidth = narrow
    ? Math.min(92, Math.max(64, longestName * 7.5))
    : Math.min(180, Math.max(72, longestName * 7.5));
  const nameChars = Math.floor(yWidth / 7.5);

  // Keep the fastest cut on-scale so a bar can visibly sit left of it.
  const maxCut = cuts.reduce((m, c) => Math.max(m, c.timeMs), 0);

  return (
    // Decorative: the leaderboard table beneath carries the same data for
    // assistive tech, so the SVG itself is hidden from the a11y tree.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          // Reserve headroom for the tier-line labels sitting above the plot.
          margin={{
            top: cuts.length > 0 ? 22 : 4,
            right: narrow ? 52 : 72,
            bottom: 4,
            left: 4,
          }}
          barCategoryGap={12}
        >
          <CartesianGrid
            horizontal={false}
            stroke={CHART.grid}
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            domain={[0, (max: number) => Math.max(max, maxCut) * 1.08]}
            tickFormatter={(v: number) => formatTime(v)}
            tick={{ fill: CHART.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            height={20}
          />
          <YAxis
            type="category"
            dataKey="name"
            reversed
            width={yWidth}
            tick={{ fill: CHART.ink, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            tickFormatter={(name: string) =>
              name.length > nameChars ? `${name.slice(0, nameChars - 1)}…` : name
            }
          />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={<CompareTooltip />}
          />
          {cuts.map((c) => {
            const st = TIER_STYLE[c.tier];
            return (
              <ReferenceLine
                key={c.tier}
                x={c.timeMs}
                stroke={st.color}
                strokeWidth={1.5}
                strokeDasharray={st.dash}
                strokeOpacity={0.9}
                ifOverflow="extendDomain"
                label={{
                  value: `${st.glyph} ${st.label}`,
                  position: "top",
                  fill: st.color,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            );
          })}
          <Bar
            dataKey="timeMs"
            radius={[0, 4, 4, 0]}
            maxBarSize={26}
            isAnimationActive={!reduced}
            animationDuration={CHART_ANIM_MS}
          >
            {data.map((r) => (
              <Cell key={r.swimmerId} fill={barColor(r.highestTier, overlay)} />
            ))}
            <LabelList
              dataKey="timeMs"
              position="right"
              formatter={(v: unknown) => formatTime(Number(v))}
              className="tnum"
              fill={CHART.ink}
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Colour + glyph key for the tier bars/lines; render only when standards show. */
export function ComparisonTierLegend({ tiers }: { tiers: Tier[] }) {
  const present = OVERLAY_TIER_ORDER.filter((t) => tiers.includes(t));
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="font-medium text-ink-muted">Tier met</span>
      {present.map((t) => {
        const st = TIER_STYLE[t];
        return (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ background: st.color }}
            />
            <span aria-hidden style={{ color: st.color }} className="text-2xs leading-none">
              {st.glyph}
            </span>
            <span className="font-medium text-ink">{st.label}</span>
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: "var(--color-tier-none)" }}
        />
        <span className="text-ink-muted">No tier</span>
      </span>
    </div>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: CompareBar }>;
};

function CompareTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-theme-md">
      <p className="font-medium text-ink">{r.name}</p>
      <p className="time tnum mt-0.5 text-ink">{formatTime(r.timeMs)}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {formatShortDate(r.swimDate)}
        {r.meetName ? ` · ${r.meetName}` : ""}
      </p>
    </div>
  );
}
