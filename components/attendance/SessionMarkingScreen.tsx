"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CheckCheck, MoreHorizontal } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseIso } from "@/components/ui/DateField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/PageHeader";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import type { AttendanceStatus } from "./types";
import { SessionForm } from "./SessionForm";
import { RosterRow, SessionRosterTable } from "./SessionRosterTable";
import {
  MONTH_LONG,
  WEEKDAY_LONG,
  formatTimeRange,
} from "./attendance-format";

function dateLabel(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
}

export function SessionMarkingScreen({
  sessionId,
}: {
  sessionId: Id<"sessions">;
  today: string;
}) {
  const router = useRouter();
  const data = useQuery(api.sessions.getSessionRoster, { sessionId });
  const squads = useQuery(api.squads.listSquads, {});

  const mark = useMutation(api.attendance.markAttendance);
  const markAll = useMutation(api.attendance.markAllRemainingPresent);
  const cancelSession = useMutation(api.sessions.cancelSession);
  const deleteSession = useMutation(api.sessions.deleteSession);

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rosterRows: RosterRow[] = (data?.roster ?? []).map((r) => ({
    swimmerId: r.swimmerId,
    name: r.name,
    status: r.status,
    note: r.note,
    noteVisibleToViewer: r.noteVisibleToViewer,
  }));

  const findRow = (id: Id<"swimmers">) => rosterRows.find((r) => r.swimmerId === id);

  async function persist(
    id: Id<"swimmers">,
    next: Partial<{ status: AttendanceStatus; note: string; noteVisibleToViewer: boolean }>,
  ) {
    const row = findRow(id);
    const status = next.status ?? row?.status;
    if (!status) return; // nothing to attach a note/toggle to yet
    try {
      await mark({
        sessionId,
        swimmerId: id,
        status,
        note: next.note ?? row?.note ?? undefined,
        noteVisibleToViewer: next.noteVisibleToViewer ?? row?.noteVisibleToViewer ?? false,
      });
    } catch (err) {
      notify.error(err);
    }
  }

  const cancelled = data?.session.status === "CANCELLED";
  const isFuture = data?.isFuture ?? false;
  const isOneOff = data?.session.patternId === null;
  const anyMarked = rosterRows.some((r) => r.status !== null);
  const canDelete = isOneOff && !anyMarked;

  const crumbBase = trailForHref("/attendance");
  const breadcrumb = [
    ...crumbBase.slice(0, -1),
    { label: "Calendar", href: "/attendance" },
    { label: data ? dateLabel(data.session.date) : "Session" },
  ];

  const title = data
    ? `${dateLabel(data.session.date)}`
    : "Session";
  const description = data
    ? [
        formatTimeRange(data.session.startMin, data.session.endMin),
        data.session.squadNames.join(", "),
        data.session.location,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  async function onMarkAll() {
    await notify.promise(markAll({ sessionId }), {
      loading: "Marking present…",
      success: (r) => (r.marked === 1 ? "1 swimmer marked present" : `${r.marked} swimmers marked present`),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={title}
        breadcrumb={breadcrumb}
        description={description}
        actions={
          data ? (
            <div className="flex items-center gap-2">
              {!cancelled && !isFuture && (
                <Button variant="secondary" size="sm" onClick={onMarkAll}>
                  <CheckCheck className="size-4" aria-hidden />
                  Mark all present
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" aria-label="Session actions">
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    Edit session
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      notify.promise(
                        cancelSession({ sessionId, cancelled: !cancelled }),
                        {
                          loading: cancelled ? "Reopening…" : "Cancelling…",
                          success: cancelled ? "Session reopened" : "Session cancelled",
                        },
                      )
                    }
                  >
                    {cancelled ? "Reopen session" : "Cancel session"}
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setConfirmDelete(true)}
                      >
                        Delete session
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : undefined
        }
      />

      {data && (cancelled || isFuture) && (
        <div className="flex flex-wrap items-center gap-2">
          {cancelled && <Badge variant="warning">Cancelled</Badge>}
          {isFuture && !cancelled && (
            <p className="text-sm text-ink-muted">
              This session is in the future — only <span className="font-medium">Excused</span> can
              be set until it takes place.
            </p>
          )}
        </div>
      )}

      {!data ? (
        <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      ) : (
        <SessionRosterTable
          roster={rosterRows}
          isFuture={isFuture}
          disabled={cancelled}
          onSetStatus={(id, status) => persist(id, { status })}
          onCommitNote={(id, note) => persist(id, { note })}
          onToggleVisible={(id, visible) => persist(id, { noteVisibleToViewer: visible })}
        />
      )}

      {data && (
        <SessionForm
          key={editOpen ? "edit-open" : "edit-closed"}
          open={editOpen}
          onOpenChange={setEditOpen}
          today={data.session.date}
          squads={squads ?? []}
          session={{
            _id: data.session._id,
            date: data.session.date,
            startMin: data.session.startMin,
            endMin: data.session.endMin,
            squadIds: data.session.squadIds,
            label: data.session.label,
            location: data.session.location,
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this session?"
        description="This one-off session has no attendance yet. It will be removed permanently."
        confirmLabel="Delete session"
        onConfirm={async () => {
          await deleteSession({ sessionId });
          notify.success("Session deleted");
          router.push("/attendance");
        }}
      />
    </div>
  );
}
