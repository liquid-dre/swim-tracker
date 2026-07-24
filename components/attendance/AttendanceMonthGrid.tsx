"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { buildCalendar, toIso } from "@/components/ui/DateField";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarDay, CalendarSession, CalendarVariant } from "./types";
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
*/

const MAX_CHIPS = 4;

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
      <span className="flex items-center gap-1 truncate">
        <span className="font-medium tabular-nums text-ink">{formatChipTime(session.startMin)}</span>
        {session.label && (
          <span className="truncate text-ink-muted">{session.label}</span>
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

export function AttendanceMonthGrid({
  year,
  month,
  today,
  days,
  variant,
  onOpenSession,
}: {
  year: number;
  month: number;
  today: string;
  days: CalendarDay[];
  variant: CalendarVariant;
  onOpenSession?: (id: Id<"sessions">) => void;
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
            return <div key={i} aria-hidden className="min-h-24 border-b border-r border-gray-100 bg-gray-50/40" />;
          }
          const iso = toIso(date);
          const sessions = byDate.get(iso) ?? [];
          const isToday = iso === today;
          const shown = sessions.slice(0, MAX_CHIPS);
          const overflow = sessions.length - shown.length;

          return (
            <div
              key={i}
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
                {shown.map((s) => (
                  <SessionChip key={s.id} session={s} variant={variant} onOpen={onOpenSession} />
                ))}
                {overflow > 0 && (
                  <span className="px-1 text-2xs text-ink-faint">+{overflow} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
