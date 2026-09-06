"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, MapPin, Pencil, Trash2, Upload, Waves } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatMeetDates } from "@/lib/meets";
import { notify } from "@/lib/notify";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { cn } from "@/lib/utils";
import { COURSE_LABEL, GalaTag, MeetProgrammeTable } from "./meetShared";
import { ImportMeetSheet } from "./ImportMeetSheet";
import { MeetForm } from "./MeetForm";

/*
  One meet and its programme (§R19). Shared by the coach route (/meets/[id]) and
  the viewer mirror (/me/meets/[id]) — the programme is identical for both, since
  a fixture list has nothing swimmer-scoped in it.

  The super-user's edit / import / delete controls render here rather than in a
  separate admin screen, so meets live in ONE place. Every one of those actions
  is gated server-side by `requireSuperUser` regardless of what renders.
*/

export function MeetDetailScreen({
  meetId,
  role,
  today,
}: {
  meetId: Id<"meets">;
  role: "coach" | "viewer";
  today: string;
}) {
  const router = useRouter();
  const isViewer = role === "viewer";
  const base = isViewer ? "/me/meets" : "/meets";

  const meet = useQuery(api.meets.getMeet, { meetId });
  const allMeets = useQuery(api.meets.listMeets, {});
  const deleteMeet = useMutation(api.meets.deleteMeet);
  const profile = useCurrentProfile();
  const canEdit = !isViewer && profile?.role === "SUPER_USER";

  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rootCrumb = isViewer
    ? { label: "My swimmers", href: "/me/swimmers" }
    : { label: "Dashboard", href: "/dashboard" };

  if (meet === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (meet === null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Meet not found"
          breadcrumb={[rootCrumb, { label: "Meets", href: base }, { label: "Not found" }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-theme-sm">
          <p className="text-sm text-ink-muted">
            That meet has been removed from the calendar.
          </p>
        </div>
      </div>
    );
  }

  async function onDelete() {
    if (meet === null) return;
    await notify.promise(deleteMeet({ meetId }), {
      loading: "Removing meet…",
      success: "Meet removed",
    });
    router.push(base);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={meet.name}
        breadcrumb={[rootCrumb, { label: "Meets", href: base }, { label: meet.name }]}
        description={formatMeetDates(meet)}
        actions={
          canEdit ? (
            <>
              {/* One primary, and it is the thing this page is for. Three
                  identical secondary buttons would give the page no centre and
                  make Delete look exactly like Edit. */}
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" aria-hidden />
                Import programme
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${meet.name}`}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      {/* The meet's facts, as a definition list — three short values that would
          each be a lonely card. "Not set" is stated rather than left blank: a
          missing course is a fact worth reading, not an empty cell. */}
      <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-theme-sm">
        <Fact
          icon={CalendarDays}
          label="Dates"
          value={formatMeetDates(meet)}
          numeric
        />
        <Fact
          icon={MapPin}
          label="Venue"
          value={meet.venue ?? "Not set"}
          muted={meet.venue === null}
        />
        <Fact
          icon={Waves}
          label="Course"
          value={meet.course ? COURSE_LABEL[meet.course] : "Not set"}
          muted={meet.course === null}
        />
        {meet.galaCode && (
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
              Gala
            </dt>
            <dd>
              <GalaTag code={meet.galaCode} />
            </dd>
          </div>
        )}
      </dl>

      <MeetProgrammeTable events={meet.events} />

      {canEdit && (
        <>
          <MeetForm
            key={editOpen ? `edit-${meet._id}` : "edit-closed"}
            open={editOpen}
            onOpenChange={setEditOpen}
            today={today}
            meet={{
              _id: meet._id,
              name: meet.name,
              startDate: meet.startDate,
              endDate: meet.endDate,
              venue: meet.venue,
              course: meet.course,
              galaCode: meet.galaCode,
              events: [...meet.events],
            }}
          />
          {/* Locked to THIS meet: the page header already says which meet you
              are on, so an import launched from here must never be able to
              land on a neighbouring fixture. */}
          <ImportMeetSheet
            open={importOpen}
            onOpenChange={setImportOpen}
            lockedMeetId={meet._id}
            meets={(allMeets ?? []).map((m) => ({
              _id: m._id,
              name: m.name,
              startDate: m.startDate,
              endDate: m.endDate,
              venue: m.venue,
              eventCount: m.events.length,
            }))}
          />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Remove this meet?"
            description={
              <>
                <span className="font-medium text-ink">{meet.name}</span> and its{" "}
                {meet.events.length === 0
                  ? "empty programme"
                  : `${meet.events.length}-event programme`}{" "}
                will be removed from the calendar. Times already logged keep the
                meet name they were saved with — no result is affected.
              </>
            }
            confirmLabel="Remove meet"
            onConfirm={onDelete}
          />
        </>
      )}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  muted = false,
  numeric = false,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  muted?: boolean;
  /** Lining figures, for a value that is a date or a number (app-wide rule). */
  numeric?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "flex items-center gap-1.5 text-sm",
          numeric && "tabular-nums",
          muted ? "text-ink-faint" : "text-ink",
        )}
      >
        <Icon aria-hidden className="size-3.5 text-ink-faint" />
        {value}
      </dd>
    </div>
  );
}
