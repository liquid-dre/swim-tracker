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

import { formatTime } from "@/lib/swim";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";

/*
  %-of-cut profile (BRD §5.11): each applicable event's headline MEET PB as a
  percentage of the target-tier cut. 100% = exactly on the line; < 100% =
  qualified. Sorted horizontal bars with a reference line at 100%, so the
  swimmer's strongest and weakest events relative to the standard read at a
  glance. Two colours only (calm, not a rainbow): qualified bars use the success
  green the system reserves for it; still-chasing bars use the one brand accent.

  The axis is ZOOMED around the data and the 100% line (not anchored at 0) so a
  cluster of 96–108% values reads clearly against the reference; every bar is
  labelled with its exact percentage, so length is never asked to carry meaning
  alone. Decorative — the gap list above carries the same numbers for assistive
  tech, so the SVG is hidden from the a11y tree.
*/

export type PctBar = {
  key: string;
  label: string;
  pctOfCut: number;
  pbMs: number;
  cutMs: number;
  qualified: boolean;
};

export function PctOfCutChart({ bars }: { bars: PctBar[] }) {
  const reduced = usePrefersReducedMotion();

  const rowHeight = 40;
  const height = Math.max(140, bars.length * rowHeight + 44);

  const longestLabel = bars.reduce((m, b) => Math.max(m, b.label.length), 0);
  const yWidth = Math.min(140, Math.max(64, longestLabel * 7.5));

  // Zoom the axis around the values AND the 100% line so the reference is always
  // on-scale and small differences stay legible.
  const pcts = bars.map((b) => b.pctOfCut);
  const lo = Math.min(100, ...pcts);
  const hi = Math.max(100, ...pcts);
  const pad = Math.max(2, (hi - lo) * 0.12);
  const domain: [number, number] = [Math.floor(lo - pad), Math.ceil(hi + pad)];

  return (
    <div style={{ width: "100%", height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={bars}
          layout="vertical"
          margin={{ top: 20, right: 52, bottom: 4, left: 4 }}
          barCategoryGap={12}
        >
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={domain}
            allowDecimals={false}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: CHART.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            height={20}
          />
          <YAxis
            type="category"
            dataKey="label"
            reversed
            width={yWidth}
            tick={{ fill: CHART.ink, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
          />
          <Tooltip cursor={{ fill: CHART.cursor }} content={<PctTooltip />} />
          <ReferenceLine
            x={100}
            stroke={CHART.ink}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            ifOverflow="extendDomain"
            label={{
              value: "100% · the cut",
              position: "top",
              fill: CHART.ink,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          <Bar
            dataKey="pctOfCut"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={!reduced}
            animationDuration={CHART_ANIM_MS}
          >
            {bars.map((b) => (
              <Cell
                key={b.key}
                fill={b.qualified ? "var(--color-qualified)" : CHART.accent}
              />
            ))}
            <LabelList
              dataKey="pctOfCut"
              position="right"
              formatter={(v: unknown) => `${(Number(v)).toFixed(1)}%`}
              className="tnum"
              fill={CHART.ink}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: PctBar }>;
};

function PctTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-theme-md">
      <p className="font-medium text-ink">{b.label}</p>
      <p className="mt-0.5 tabular-nums text-ink">
        {b.pctOfCut.toFixed(1)}% of cut
        {b.qualified && <span className="text-success-ink"> · qualified</span>}
      </p>
      <p className="time tnum mt-1 text-xs text-ink-muted">
        {formatTime(b.pbMs)} vs {formatTime(b.cutMs)}
      </p>
    </div>
  );
}
