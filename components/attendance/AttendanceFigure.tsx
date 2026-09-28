"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/*
  The per-swimmer attendance figure on the coach's swimmer profile (§R18):
  attended / eligible over the season, with the excused count, and a link into the
  swimmer's own attendance calendar. Coaches only — the profile gates this on
  edit access, so a viewer never sees a summary.

  Below the season total, the same marks MONTH BY MONTH, newest first. Coaches
  report attendance per month, and the calendar only ever shows one month at a
  time — so this is the table they would otherwise count off it by hand. A month
  with no training is listed as such rather than skipped.
*/

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-09" → "Sep 2026" — short, so six columns fit a phone. */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export function AttendanceFigure({ swimmerId }: { swimmerId: Id<"swimmers"> }) {
  const fig = useQuery(api.attendance.getSwimmerAttendanceFigure, { swimmerId });

  if (fig === undefined) {
    return <div className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <SeasonTotal fig={fig} swimmerId={swimmerId} />
      {fig.marked > 0 && <MonthlyTable months={fig.months} />}
    </div>
  );
}

type Figure = FunctionReturnType<typeof api.attendance.getSwimmerAttendanceFigure>;

function SeasonTotal({ fig, swimmerId }: { fig: Figure; swimmerId: Id<"swimmers"> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm">
      {fig.marked === 0 ? (
        <p className="text-sm text-ink-muted">No attendance recorded this season yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-8">
          <Stat label="Attendance" value={fig.ratePct != null ? `${fig.ratePct}%` : "—"} />
          <Stat label="Attended" value={`${fig.attended}/${fig.eligible}`} />
          <Stat label="Excused" value={String(fig.excused)} />
        </div>
      )}
      <Link
        href={`/attendance?swimmer=${swimmerId}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 outline-none hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        Calendar
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function MonthlyTable({ months }: { months: Figure["months"] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <table className="w-full text-sm">
        <caption className="border-b border-gray-100 px-4 py-2.5 text-left text-sm font-semibold text-ink">
          By month
        </caption>
        <thead>
          <tr className="border-b border-gray-100 text-left text-2xs uppercase tracking-wide text-ink-faint">
            <th scope="col" className="px-3 py-2 font-semibold">Month</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Rate</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Attended</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Late</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Absent</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Excused</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-b border-gray-50 last:border-b-0">
              <th scope="row" className="px-3 py-2.5 text-left font-medium whitespace-nowrap text-ink">
                {monthLabel(m.month)}
              </th>
              {m.marked === 0 ? (
                <td colSpan={5} className="px-3 py-2.5 text-right text-ink-faint">
                  No sessions marked
                </td>
              ) : (
                <>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {m.ratePct != null ? `${m.ratePct}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {m.attended}/{m.eligible}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{m.late}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{m.absent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{m.excused}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
