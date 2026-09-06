"use client";

import { useMemo } from "react";

import { parseIso } from "@/components/ui/DateField";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarDay, CalendarVariant } from "./types";
import { SessionChip } from "./AttendanceMonthGrid";
import { MeetPinChip, type MeetPin } from "./CalendarMeets";
import { MONTH_LONG, WEEKDAY_SHORT } from "./attendance-format";

/*
  The mobile counterpart of the month grid (§R18): a vertical agenda of only the
  days that have something on, so a 7-column grid never has to survive a phone.
  Same data, same SessionChip and MeetPinChip — only the layout differs.
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
  meetsByDate,
  onOpenMeet,
}: {
  today: string;
  days: CalendarDay[];
  variant: CalendarVariant;
  onOpenSession?: (id: Id<"sessions">) => void;
  meetsByDate?: Map<string, MeetPin[]>;
  onOpenMeet?: (pin: MeetPin) => void;
}) {
  // A day with a gala but no training still belongs in the agenda — on a phone
  // this list IS the calendar, so a competition must not be invisible just
  // because nobody trains that day.
  const withSomething = useMemo(() => {
    const dates = new Set<string>();
    for (const d of days) if (d.sessions.length > 0) dates.add(d.date);
    for (const date of meetsByDate?.keys() ?? []) dates.add(date);
    const byDate = new Map(days.map((d) => [d.date, d]));
    return [...dates]
      .sort()
      .map((date) => byDate.get(date) ?? { date, sessions: [] });
  }, [days, meetsByDate]);

  if (withSomething.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-ink-muted shadow-theme-sm">
        Nothing on this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {withSomething.map((day) => (
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
            {(meetsByDate?.get(day.date) ?? []).map((pin) => (
              <MeetPinChip key={pin.key} pin={pin} onOpen={onOpenMeet ?? (() => {})} />
            ))}
            {day.sessions.map((s) => (
              <SessionChip key={s.id} session={s} variant={variant} onOpen={onOpenSession} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
