"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/*
  The per-swimmer attendance figure on the coach's swimmer profile (§R18):
  attended / eligible over the season, with the excused count, and a link into the
  swimmer's own attendance calendar. Coaches only — the profile gates this on
  edit access, so a viewer never sees a summary.
*/

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
