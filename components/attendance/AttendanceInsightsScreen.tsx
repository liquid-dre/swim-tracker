"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip } from "@/components/charts/tooltip";
import {
  SWIM_TOOLTIP_PANEL,
  TooltipMeta,
  TooltipRows,
  TooltipTitle,
  ValueAxis,
} from "@/components/charts/swim";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { trailForHref } from "@/lib/nav";
import { formatShortDate } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CHART, CHART_ANIM_MS } from "@/components/analysis/chartTheme";
import { monthsInRange } from "@/convex/attendanceLib";
import { monthBounds, monthTitle } from "./attendance-format";

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

/** Renders children at rest (no enter animation) when motion is reduced. */
function MaybeStatic({
  reduced,
  children,
}: {
  reduced: boolean;
  children: React.ReactNode;
}) {
  return reduced ? (
    <StaticChartPreviewProvider>{children}</StaticChartPreviewProvider>
  ) : (
    <>{children}</>
  );
}

function RateTooltip({ row }: { row: SquareDatum }) {
  if (!row?.squadName) return null;
  return (
    <TooltipRows>
      <TooltipTitle>{row.squadName}</TooltipTitle>
      <TooltipMeta>
        <span className="tabular-nums">
          {row.ratePct}% · {row.attended}/{row.eligible} attended
        </span>
      </TooltipMeta>
    </TooltipRows>
  );
}

/** "2026-09" → "September 2026". */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthTitle(y, m - 1);
}

/** The ISO range a "YYYY-MM" period reads — capped at today for the month in progress. */
function periodRange(key: string, today: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const { from, to } = monthBounds(y, m - 1);
  return { from, to: to < today ? to : today };
}

export function AttendanceInsightsScreen({
  today,
  initialMonth = null,
}: {
  today: string;
  /** "YYYY-MM" from `?month=` — the calendar's month strip links here. */
  initialMonth?: string | null;
}) {
  const [squadId, setSquadId] = useState<string>("");
  // "" = the whole season; otherwise one calendar month, "YYYY-MM".
  const [period, setPeriod] = useState<string>(
    initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : "",
  );
  const reduced = usePrefersReducedMotion();

  const squads = useQuery(api.squads.listSquads, {});
  const range = period ? periodRange(period, today) : null;
  const data = useQuery(api.attendanceInsights.getAttendanceInsights, {
    squadId: squadId ? (squadId as Id<"squads">) : undefined,
    ...(range ?? {}),
  });

  // The season's months, remembered across refetches so the period picker does
  // not empty itself for a beat every time the period or squad changes.
  const [season, setSeason] = useState<{ from: string; to: string } | null>(null);
  if (data && (season?.from !== data.seasonFrom || season?.to !== data.seasonTo)) {
    setSeason({ from: data.seasonFrom, to: data.seasonTo });
  }
  const seasonMonths = season ? monthsInRange(season.from, season.to).reverse() : [];
  if (period && !seasonMonths.includes(period)) seasonMonths.unshift(period);

  const squadOptions = [
    { value: "", label: "All squads" },
    ...(squads ?? []).map((s) => ({ value: s._id, label: s.name })),
  ];
  const periodOptions = [
    { value: "", label: "Whole season" },
    ...seasonMonths.map((m) => ({ value: m, label: monthLabel(m) })),
  ];
  const periodName = period ? monthLabel(period) : "this season";

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
            ? `${period ? monthLabel(period) : "Season"} ${formatShortDate(data.from)} – ${formatShortDate(data.to)}.`
            : "Attendance across the season."
        }
      />

      <FilterBar
        primary={
          <FilterField label="Period">
            <Select
              aria-label="Period"
              value={period}
              onValueChange={setPeriod}
              options={periodOptions}
            />
          </FilterField>
        }
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
            No attendance recorded {periodName === "this season" ? "this season" : `in ${periodName}`} yet.
          </p>
        ) : (
          <div className="h-72 w-full">
            {/* The chart SVG is aria-hidden (bklit marks it so), and unlike the
                comparison and progression views this card has no table beneath
                it to fall back on — so the rates are stated here for assistive
                tech rather than existing only as bar heights. */}
            <ul className="sr-only">
              {chartData.map((d) => (
                <li key={d.squadName}>
                  {d.squadName}: {d.ratePct}% attendance, {d.attended} of{" "}
                  {d.eligible} sessions.
                </li>
              ))}
            </ul>
            <MaybeStatic reduced={reduced}>
              <BarChart
                animationDuration={CHART_ANIM_MS}
                // Fill the h-72 parent rather than bklit's default "2 / 1".
                aspectRatio=""
                className="h-full"
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 26, left: 44 }}
                // A rate is only readable against the full scale — 0-100, not
                // 0-to-whatever-the-best-squad-managed.
                valueDomain={[0, 100]}
                xDataKey="squadName"
              >
                <Grid horizontal stroke={CHART.grid} vertical={false} />
                <BarXAxis />
                <ValueAxis
                  format={(v) => `${Math.round(v)}%`}
                  label="Attendance rate"
                  width={44}
                />
                {/* Every bar is the accent — bklit's single `fill` is all this
                    chart needs, so it keeps bklit's own Bar. */}
                <Bar dataKey="ratePct" fill={CHART.accent} />
                <ChartTooltip
                  panelStyle={SWIM_TOOLTIP_PANEL}
                  showDots={false}
                  content={({ point }) => (
                    <RateTooltip row={point as unknown as SquareDatum} />
                  )}
                />
              </BarChart>
            </MaybeStatic>
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

      {/* Every swimmer, for the period — the table a coach counting a month's
          attendance actually needs, rather than only the bottom ten. */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">
            Every swimmer, {period ? monthLabel(period) : "whole season"}
          </h2>
        </div>
        {data === undefined ? (
          <div className="h-40 animate-pulse bg-white" />
        ) : data.perSwimmer.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No active swimmers in this squad.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-2xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-3 py-2 font-semibold sm:px-4">Swimmer</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">Rate</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">Attended</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">Late</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">Absent</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">Excused</th>
              </tr>
            </thead>
            <tbody>
              {data.perSwimmer.map((s) => (
                <tr key={s.swimmerId} className="border-b border-gray-50 last:border-b-0">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal text-ink sm:px-4">
                    {s.name}
                  </th>
                  {s.marked === 0 ? (
                    <td colSpan={5} className="px-3 py-2.5 text-right text-ink-faint sm:px-4">
                      Nothing marked
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink sm:px-4">
                        {s.ratePct != null ? `${s.ratePct}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink sm:px-4">
                        {s.attended}/{s.eligible}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted sm:px-4">{s.late}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted sm:px-4">{s.absent}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted sm:px-4">{s.excused}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
