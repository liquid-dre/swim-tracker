"use client";

import { useMemo } from "react";

import { parseIso } from "@/components/ui/DateField";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarDay, CalendarVariant } from "./types";
import { SessionChip } from "./AttendanceMonthGrid";
import { MONTH_LONG, WEEKDAY_SHORT } from "./attendance-format";

/*
  The mobile counterpart of the month grid (§R18): a vertical agenda of only the
  days that have sessions, so a 7-column grid never has to survive a phone. Same
  data, same SessionChip — only the layout differs.
*/

function dayHeading(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()].slice(0, 3)}`;
}

export function AttendanceAgenda({
  today,
  days,
  variant,
  onOpenSession,
}: {
  today: string;
  days: CalendarDay[];
  variant: CalendarVariant;
  onOpenSession?: (id: Id<"sessions">) => void;
}) {
  const withSessions = useMemo(
    () => days.filter((d) => d.sessions.length > 0),
    [days],
  );

  if (withSessions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-ink-muted shadow-theme-sm">
        No sessions this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {withSessions.map((day) => (
        <div
          key={day.date}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
            <span className="text-sm font-semibold text-ink">{dayHeading(day.date)}</span>
            {day.date === today && (
              <span className="rounded-full bg-brand-500 px-2 py-0.5 text-2xs font-semibold text-white">
                Today
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 p-2">
            {day.sessions.map((s) => (
              <SessionChip key={s.id} session={s} variant={variant} onOpen={onOpenSession} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
