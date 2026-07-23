"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseIso } from "@/components/ui/DateField";
import { Button } from "@/components/ui/Button";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { trailForHref } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AttendanceMonthGrid } from "./AttendanceMonthGrid";
import { AttendanceAgenda } from "./AttendanceAgenda";
import { SessionForm } from "./SessionForm";
import type { CalendarDay, CalendarSession } from "./types";
import {
  STATUS_META,
  STATUS_ORDER,
  monthBounds,
  monthTitle,
  shiftMonth,
} from "./attendance-format";

/*
  The attendance calendar — one component for both the coach surface (/attendance)
  and the viewer surface (/me/attendance). It is the only role-aware layer: it
  chooses the query and normalises the result into the shared calendar shape, then
  hands off to the presentational grid/agenda. A coach can filter by squad and by
  swimmer; filtering to one swimmer recolours the cells by that swimmer's status —
  the same per-swimmer view a viewer sees (§R18).
*/

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={cn("size-2.5 rounded-full", STATUS_META[s].dot)} />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-theme-sm">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="min-h-24 animate-pulse bg-white" />
      ))}
    </div>
  );
}

export function AttendanceCalendarScreen({
  role,
  today,
  initialSquadId = null,
  initialSwimmerId = null,
}: {
  role: "coach" | "viewer";
  today: string;
  initialSquadId?: string | null;
  initialSwimmerId?: string | null;
}) {
  const router = useRouter();
  const isCoach = role === "coach";
  const href = isCoach ? "/attendance" : "/me/attendance";

  const todayDate = parseIso(today) ?? new Date();
  const [view, setView] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  });
  const [squadId, setSquadId] = useState<string>(initialSquadId ?? "");
  const [swimmerId, setSwimmerId] = useState<string>(initialSwimmerId ?? "");
  const [newOpen, setNewOpen] = useState(false);

  const { from, to } = useMemo(() => monthBounds(view.year, view.month), [view]);

  // Coach filter option sources.
  const squads = useQuery(api.squads.listSquads, isCoach ? {} : "skip");
  const pickerSwimmers = useQuery(
    api.swimmers.listSwimmersForPicker,
    isCoach ? {} : "skip",
  );

  const coachData = useQuery(
    api.sessions.listSessionsInRange,
    isCoach
      ? {
          from,
          to,
          squadId: squadId ? (squadId as Id<"squads">) : undefined,
          swimmerId: swimmerId ? (swimmerId as Id<"swimmers">) : undefined,
        }
      : "skip",
  );
  const viewerData = useQuery(
    api.attendance.getViewerCalendar,
    isCoach ? "skip" : { from, to },
  );

  const swimmerName = useMemo(() => {
    if (!swimmerId || !pickerSwimmers) return "";
    return pickerSwimmers.find((s) => s._id === swimmerId)?.name ?? "";
  }, [swimmerId, pickerSwimmers]);

  const variant = !isCoach || swimmerId ? "swimmer" : "summary";

  // Normalise whichever query ran into the shared calendar shape.
  const days: CalendarDay[] | undefined = useMemo(() => {
    if (isCoach) {
      if (!coachData) return undefined;
      const byDate = new Map<string, CalendarSession[]>();
      for (const s of coachData) {
        const session: CalendarSession = {
          id: s._id,
          startMin: s.startMin,
          endMin: s.endMin,
          label: s.label,
          location: s.location,
          status: s.status,
          counts: {
            attended: s.present + s.late,
            total: s.total,
            marked: s.marked,
          },
          perSwimmer: swimmerId
            ? [
                {
                  swimmerId: swimmerId as Id<"swimmers">,
                  name: swimmerName,
                  status: s.swimmerStatus,
                },
              ]
            : [],
        };
        const list = byDate.get(s.date) ?? [];
        list.push(session);
        byDate.set(s.date, list);
      }
      return [...byDate.entries()].map(([date, sessions]) => ({ date, sessions }));
    }
    if (!viewerData) return undefined;
    const byDate = new Map<string, CalendarSession[]>();
    for (const s of viewerData.sessions) {
      const session: CalendarSession = {
        id: s._id,
        startMin: s.startMin,
        endMin: s.endMin,
        label: s.label,
        location: s.location,
        status: s.status,
        perSwimmer: s.perSwimmer.map((p) => ({
          swimmerId: p.swimmerId,
          name: p.name,
          status: p.status,
          note: p.note,
        })),
      };
      const list = byDate.get(s.date) ?? [];
      list.push(session);
      byDate.set(s.date, list);
    }
    return [...byDate.entries()].map(([date, sessions]) => ({ date, sessions }));
  }, [isCoach, coachData, viewerData, swimmerId, swimmerName]);

  const loading = days === undefined;
  const viewerSwimmers = viewerData?.swimmers ?? [];

  function onOpenSession(id: Id<"sessions">) {
    router.push(`/attendance/session/${id}`);
  }

  const squadOptions = [
    { value: "", label: "All squads" },
    ...(squads ?? []).map((s) => ({ value: s._id, label: s.name })),
  ];
  const swimmerOptions = [
    { value: "", label: "All swimmers" },
    ...(pickerSwimmers ?? [])
      .filter((s) => s.active)
      .map((s) => ({ value: s._id, label: s.name })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Attendance"
        breadcrumb={trailForHref(href)}
        description={
          isCoach
            ? "Training sessions and who attended."
            : "Your training sessions and attendance."
        }
        actions={
          isCoach ? (
            <Button variant="secondary" size="sm" onClick={() => setNewOpen(true)}>
              <CalendarPlus className="size-4" aria-hidden />
              New session
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        primary={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Previous month"
                onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <span className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">
                {monthTitle(view.year, view.month)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Next month"
                onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setView({ year: todayDate.getFullYear(), month: todayDate.getMonth() })
              }
            >
              Today
            </Button>
          </div>
        }
        trailing={
          isCoach ? (
            <>
              <FilterField label="Squad">
                <Select
                  aria-label="Filter by squad"
                  value={squadId}
                  onValueChange={setSquadId}
                  options={squadOptions}
                />
              </FilterField>
              <FilterField label="Swimmer">
                <Select
                  aria-label="Filter by swimmer"
                  value={swimmerId}
                  onValueChange={setSwimmerId}
                  options={swimmerOptions}
                />
              </FilterField>
            </>
          ) : undefined
        }
      />

      {/* Viewer legend of which dot is which child, when several are shown. */}
      {!isCoach && viewerSwimmers.length > 1 && (
        <p className="text-xs text-ink-muted">
          Showing {viewerSwimmers.map((s) => s.name).join(", ")}. Each dot is one
          swimmer.
        </p>
      )}

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <>
          <div className="hidden lg:block">
            <AttendanceMonthGrid
              year={view.year}
              month={view.month}
              today={today}
              days={days!}
              variant={variant}
              onOpenSession={isCoach ? onOpenSession : undefined}
            />
          </div>
          <div className="lg:hidden">
            <AttendanceAgenda
              today={today}
              days={days!}
              variant={variant}
              onOpenSession={isCoach ? onOpenSession : undefined}
            />
          </div>
        </>
      )}

      <StatusLegend />

      {isCoach && (
        <SessionForm
          key={newOpen ? "open" : "closed"}
          open={newOpen}
          onOpenChange={setNewOpen}
          today={today}
          squads={squads ?? []}
        />
      )}
    </div>
  );
}
