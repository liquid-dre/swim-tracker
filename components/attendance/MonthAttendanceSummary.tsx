"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { monthTitle } from "./attendance-format";

/*
  The month-in-view's attendance figure, directly above the coach's calendar
  grid. It moves with the ‹ › month buttons and the heatmap's month row, so a
  past month's numbers are one click back rather than a count off the grid.

  Same scope as the grid (club, squad or one swimmer) and the same fair rate as
  everywhere else: LATE is attended, EXCUSED is out of the denominator. The
  current month counts up to today only. Coach-only — the viewer calendar
  carries no rate summary (§R18).
*/

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function MonthAttendanceSummary({
  year,
  month,
  from,
  to,
  today,
  squadId,
  swimmerId,
  scopeLabel,
}: {
  year: number;
  month: number;
  from: string;
  to: string;
  today: string;
  squadId?: Id<"squads">;
  swimmerId?: Id<"swimmers">;
  /** Who the figure is about: "All swimmers", a squad name, a swimmer name. */
  scopeLabel: string;
}) {
  const future = from > today;
  const current = !future && to >= today;
  const data = useQuery(
    api.attendance.getAttendanceMonthSummary,
    future ? "skip" : { from, to, squadId, swimmerId },
  );

  const title = `${monthTitle(year, month)}${current ? " so far" : ""}`;
  const insightsHref = `/attendance/insights?month=${from.slice(0, 7)}`;

  return (
    <section
      aria-label={`${title} attendance`}
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-theme-sm"
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink-muted">{scopeLabel}</p>
      </div>

      {future ? (
        <p className="flex-1 text-sm text-ink-muted">This month hasn&apos;t started yet.</p>
      ) : data === undefined ? (
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
      ) : data.marked === 0 ? (
        <p className="flex-1 text-sm text-ink-muted">No attendance marked this month.</p>
      ) : (
        <dl className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="Attendance" value={data.ratePct != null ? `${data.ratePct}%` : "—"} />
          <Stat label="Attended" value={`${data.attended}/${data.eligible}`} />
          <Stat label="Late" value={String(data.late)} />
          <Stat label="Absent" value={String(data.absent)} />
          <Stat label="Excused" value={String(data.excused)} />
        </dl>
      )}

      {!swimmerId && !future && (
        <Link
          href={insightsHref}
          className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-600 outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Per swimmer
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}
