"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatTime } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";

/*
  Horizontal bar chart of each swimmer's headline MEET PB (BRD §5.5). Fastest at
  the top (mirrors the leaderboard order). One accent, neutral grid — no per-bar
  colour yet (tier colouring arrives with the Step 10 overlay). Shorter bar =
  faster; each bar is labelled with its exact time so the chart never asks the
  eye to estimate a swim time.
*/

export type CompareBar = {
  swimmerId: string;
  name: string;
  timeMs: number;
  swimDate: string;
  meetName: string | null;
};

export function ComparisonBarChart({ rows }: { rows: CompareBar[] }) {
  const reduced = usePrefersReducedMotion();

  // Fastest first in the leaderboard = top of the chart. Recharts plots the
  // first category at the bottom by default, so reverse the axis to match.
  const data = rows;
  const rowHeight = 44;
  const height = Math.max(160, data.length * rowHeight + 48);

  // Longest name drives the label gutter so names never clip or over-reserve.
  const longestName = data.reduce((m, r) => Math.max(m, r.name.length), 0);
  const yWidth = Math.min(180, Math.max(72, longestName * 7.5));

  return (
    // Decorative: the leaderboard table beneath carries the same data for
    // assistive tech, so the SVG itself is hidden from the a11y tree.
    <div style={{ width: "100%", height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          barCategoryGap={12}
        >
          <CartesianGrid
            horizontal={false}
            stroke={CHART.grid}
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            domain={[0, (max: number) => max * 1.08]}
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
          />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={<CompareTooltip />}
          />
          <Bar
            dataKey="timeMs"
            fill={CHART.accent}
            radius={[0, 4, 4, 0]}
            maxBarSize={26}
            isAnimationActive={!reduced}
            animationDuration={CHART_ANIM_MS}
          >
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
