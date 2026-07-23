"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { trailForHref } from "@/lib/nav";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";

/*
  Attendance insights (§R18) — coach-only analytics over the season. A per-squad
  rate bar leads; overall and worst-attenders sit alongside. LATE counts as
  attended and EXCUSED is excluded from the denominator, so a rate is fair.
*/

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-ink-muted">{sub}</p>}
    </div>
  );
}

type SquareDatum = { squadName: string; ratePct: number; attended: number; eligible: number };

function RateTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SquareDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-theme-md">
      <p className="font-semibold text-ink">{d.squadName}</p>
      <p className="mt-0.5 tabular-nums text-ink-muted">
        {d.ratePct}% · {d.attended}/{d.eligible} attended
      </p>
    </div>
  );
}

export function AttendanceInsightsScreen() {
  const [squadId, setSquadId] = useState<string>("");
  const reduced = usePrefersReducedMotion();

  const squads = useQuery(api.squads.listSquads, {});
  const data = useQuery(api.attendanceInsights.getAttendanceInsights, {
    squadId: squadId ? (squadId as Id<"squads">) : undefined,
  });

  const squadOptions = [
    { value: "", label: "All squads" },
    ...(squads ?? []).map((s) => ({ value: s._id, label: s.name })),
  ];

  const chartData: SquareDatum[] =
    data?.perSquad
      .filter((s) => s.eligible > 0)
      .map((s) => ({
        squadName: s.squadName,
        ratePct: s.ratePct ?? 0,
        attended: s.attended,
        eligible: s.eligible,
      })) ?? [];

  const overall = data?.overall;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Insights"
        breadcrumb={trailForHref("/attendance/insights")}
        description={
          data
            ? `Season ${formatShortDate(data.from)} – ${formatShortDate(data.to)}.`
            : "Attendance across the season."
        }
      />

      <FilterBar
        trailing={
          <FilterField label="Squad">
            <Select
              aria-label="Filter by squad"
              value={squadId}
              onValueChange={setSquadId}
              options={squadOptions}
            />
          </FilterField>
        }
      />

      {/* Overall figures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Attendance"
          value={overall?.ratePct != null ? `${overall.ratePct}%` : "—"}
          sub={overall ? `${overall.attended}/${overall.eligible} sessions` : undefined}
        />
        <StatCard label="Present" value={overall ? String(overall.present) : "—"} />
        <StatCard label="Late" value={overall ? String(overall.late) : "—"} />
        <StatCard
          label="Excused"
          value={overall ? String(overall.excused) : "—"}
          sub="not counted against"
        />
      </div>

      {/* Per-squad rate chart */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink">Attendance rate by squad</h2>
        {data === undefined ? (
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        ) : chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            No attendance recorded in this season yet.
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="squadName"
                  tick={{ fill: CHART.tick, fontSize: 12 }}
                  stroke={CHART.axis}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: CHART.tick, fontSize: 12 }}
                  stroke={CHART.axis}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: CHART.cursor }} content={<RateTooltip />} />
                <Bar
                  dataKey="ratePct"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reduced}
                  animationDuration={CHART_ANIM_MS}
                >
                  {chartData.map((d) => (
                    <Cell key={d.squadName} fill={CHART.accent} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Worst attenders */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">Lowest attendance</h2>
        </div>
        {data === undefined ? (
          <div className="h-40 animate-pulse bg-white" />
        ) : data.worstAttenders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No eligible sessions recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-2xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-semibold">Swimmer</th>
                <th className="px-4 py-2 text-right font-semibold">Rate</th>
                <th className="px-4 py-2 text-right font-semibold">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {data.worstAttenders.map((s) => (
                <tr key={s.swimmerId} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-4 py-2.5 text-ink">{s.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink">
                    {s.ratePct}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {s.eligible}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
