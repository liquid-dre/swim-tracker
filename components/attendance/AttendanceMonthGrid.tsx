"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { buildCalendar, toIso } from "@/components/ui/DateField";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarDay, CalendarSession, CalendarVariant } from "./types";
import { MeetPinChip, type MeetPin } from "./CalendarMeets";
import {
  STATUS_META,
  WEEKDAY_SHORT,
  formatChipTime,
} from "./attendance-format";

/*
  The month grid — presentational and identical for coach and viewer (§R18). The
  screen normalises whichever query it ran into `days`; this component just lays
  them out. `variant` decides a session chip's payload: "summary" shows an
  attendance count (coach, unfiltered), "swimmer" colours by per-swimmer status
  (coach single-swimmer + viewer). Tapping a chip fires `onOpenSession` when the
  caller is a coach; a viewer passes none, so chips read as static status.

  Competitions (§R19) ride on the same grid via `meetsByDate`. They are drawn
  ABOVE the session chips and in a different shape, because a gala is what a
  session gets cancelled or excused FOR — reading the two as the same kind of
  thing is exactly the mistake to prevent.
*/

const MAX_CHIPS = 4;
/** Competitions shown before a cell starts counting them instead (see below). */
const MAX_MEET_PINS = 2;

export function SessionChip({
  session,
  variant,
  onOpen,
}: {
  session: CalendarSession;
  variant: CalendarVariant;
  onOpen?: (id: Id<"sessions">) => void;
}) {
  const cancelled = session.status === "CANCELLED";
  const interactive = Boolean(onOpen) && !cancelled;

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1 truncate">
        <span className="shrink-0 font-medium tabular-nums text-ink">
          {formatChipTime(session.startMin)}
        </span>
        {session.title && (
          <span className="truncate text-ink-muted">{session.title}</span>
        )}
      </span>
      {cancelled ? (
        <span className="text-2xs font-medium uppercase tracking-wide text-ink-faint line-through">
          Cancelled
        </span>
      ) : variant === "summary" ? (
        session.counts && (
          <span className="shrink-0 tabular-nums text-ink-muted">
            {session.counts.attended}/{session.counts.total}
          </span>
        )
      ) : (
        <SwimmerStatuses session={session} />
      )}
    </>
  );

  const className = cn(
    "flex w-full items-center justify-between gap-1 rounded-md border px-1.5 py-1 text-2xs sm:text-xs",
    cancelled
      ? "border-dashed border-gray-200 bg-gray-50 opacity-70"
      : "border-gray-200 bg-white",
    interactive &&
      "cursor-pointer outline-none transition-colors [transition-duration:var(--dur-1)] hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring",
  );

  if (interactive) {
    return (
      <button type="button" onClick={() => onOpen!(session.id)} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/** The per-swimmer payload of a chip in "swimmer" variant. */
function SwimmerStatuses({ session }: { session: CalendarSession }) {
  if (session.perSwimmer.length === 0) return null;
  // One swimmer → a labelled status chip; several → coloured dots (parent of many).
  if (session.perSwimmer.length === 1) {
    const s = session.perSwimmer[0];
    if (!s.status) {
      return <span className="shrink-0 text-2xs text-ink-faint">—</span>;
    }
    const meta = STATUS_META[s.status];
    return (
      <span
        className={cn(
          "shrink-0 rounded px-1 text-2xs font-medium leading-none",
          meta.chip,
        )}
      >
        {meta.label}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {session.perSwimmer.map((s) => (
        <span
          key={s.swimmerId}
          title={`${s.name}: ${s.status ? STATUS_META[s.status].label : "Not recorded"}`}
          className={cn(
            "size-2 rounded-full",
            s.status ? STATUS_META[s.status].dot : "ring-1 ring-inset ring-gray-300",
          )}
        />
      ))}
    </span>
  );
}

/** One cell's overflow toggle. Local state, because it is a per-cell view choice. */
function DayCell({
  date,
  isToday,
  sessions,
  meets,
  variant,
  onOpenSession,
  onOpenMeet,
}: {
  date: Date;
  isToday: boolean;
  sessions: CalendarSession[];
  meets: MeetPin[];
  variant: CalendarVariant;
  onOpenSession?: (id: Id<"sessions">) => void;
  onOpenMeet?: (pin: MeetPin) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Competitions take chip budget first: on a day with both, the gala is the
  // thing a coach must not miss. Both lists are capped so a day carrying a
  // multi-day champs, a tour date and training cannot stretch its row out of
  // the grid — and the counter opens the rest rather than merely reporting it.
  const shownMeets = expanded ? meets : meets.slice(0, MAX_MEET_PINS);
  const sessionBudget = Math.max(1, MAX_CHIPS - shownMeets.length);
  const shownSessions = expanded ? sessions : sessions.slice(0, sessionBudget);
  const hidden =
    sessions.length - shownSessions.length + (meets.length - shownMeets.length);

  return (
    <div
      className={cn(
        "min-h-24 border-b border-r border-gray-100 p-1.5 last:border-r-0",
        isToday && "bg-brand-50/40",
      )}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            isToday ? "bg-brand-500 font-semibold text-white" : "text-ink-muted",
          )}
        >
          {date.getDate()}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {onOpenMeet &&
          shownMeets.map((pin) => (
            <MeetPinChip key={pin.key} pin={pin} onOpen={onOpenMeet} />
          ))}
        {shownSessions.map((s) => (
          <SessionChip key={s.id} session={s} variant={variant} onOpen={onOpenSession} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded px-1 text-left text-2xs text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{hidden} more
          </button>
        )}
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded px-1 text-left text-2xs text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

export function AttendanceMonthGrid({
  year,
  month,
  today,
  days,
  variant,
  onOpenSession,
  meetsByDate,
  onOpenMeet,
}: {
  year: number;
  month: number;
  today: string;
  days: CalendarDay[];
  variant: CalendarVariant;
  onOpenSession?: (id: Id<"sessions">) => void;
  /** Competitions keyed by ISO date; a multi-day meet appears on each of its days. */
  meetsByDate?: Map<string, MeetPin[]>;
  onOpenMeet?: (pin: MeetPin) => void;
}) {
  const weeks = useMemo(() => buildCalendar(year, month), [year, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const d of days) map.set(d.date, d.sessions);
    return map;
  }, [days]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAY_SHORT.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            <span className="hidden sm:inline">{w}</span>
            <span className="sm:hidden">{w[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((date, i) => {
          if (!date) {
            return <div key={`blank-${i}`} aria-hidden className="min-h-24 border-b border-r border-gray-100 bg-gray-50/40" />;
          }
          const iso = toIso(date);
          return (
            // Keyed by DATE, not by grid position: a cell holds its own
            // "expanded" state, and keying by index would hand that state to
            // whatever day landed in the same slot next month.
            <DayCell
              key={iso}
              date={date}
              isToday={iso === today}
              sessions={byDate.get(iso) ?? []}
              meets={meetsByDate?.get(iso) ?? []}
              variant={variant}
              onOpenSession={onOpenSession}
              onOpenMeet={onOpenMeet}
            />
          );
        })}
      </div>
    </div>
  );
}
