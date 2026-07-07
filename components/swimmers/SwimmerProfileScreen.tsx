"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, PlusCircle, Timer } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs } from "@/components/ui/Tabs";
import { notify } from "@/lib/notify";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import { PbBoard } from "./PbBoard";
import { ImprovementSummary } from "./ImprovementSummary";
import { HistoryTable, type HistoryResult } from "./HistoryTable";
import { ResultEditSheet } from "./ResultEditSheet";
import { ViewerAccessSection } from "./ViewerAccessSection";
import { SchoolGalaSheet } from "@/components/me/SchoolGalaSheet";
import { TrainingNotesTimeline } from "@/components/training/TrainingNotesTimeline";

/*
  Swimmer profile (Step 6, BRD §5.4). Identity sits above the swim data. For a
  coach it splits into two tabs: **Times** (the PB board — derived headline meet
  PBs × course — plus the improvement summary and full history with edit/delete)
  and **Access** (coach control of who may view this swimmer), with a count pill
  surfacing pending requests. For a viewer (the /me/swimmers/[id] route) the
  Access tab is hidden entirely and the history is read-only — they see the same
  numbers, nothing that edits. All swim data comes from `getSwimmerProfile`; PBs
  are derived server-side (no PB table); access is enforced server-side too.
*/
export function SwimmerProfileScreen({
  swimmerId,
  today,
}: {
  swimmerId: Id<"swimmers">;
  today: string;
}) {
  const pathname = usePathname();
  // The viewer area (/me/*) is read-only and never shows the access admin. This
  // is deterministic from the route (a viewer can't reach /swimmers/[id], a
  // coach can't reach /me/*), so there's no role-loading flash.
  const viewerArea = pathname.startsWith("/me");

  const data = useQuery(api.personalBests.getSwimmerProfile, { swimmerId });
  const deleteResult = useMutation(api.results.deleteResult);

  const [editing, setEditing] = useState<HistoryResult | null>(null);
  const [deleting, setDeleting] = useState<HistoryResult | null>(null);
  const [tab, setTab] = useState("times");
  // Viewer (parent) school-gala entry (§R15): the one write a viewer gets, for a
  // swimmer they're already linked to (they reached this /me route via the
  // server-side access gate). `galaEditing` null = a new entry, else that row.
  const [galaOpen, setGalaOpen] = useState(false);
  const [galaEditing, setGalaEditing] = useState<HistoryResult | null>(null);

  // Pending-request count for the Access tab pill, so a coach on the Times tab
  // still sees when someone is waiting. Shares the query the Access panel uses
  // (Convex dedupes by args); only coaches who manage this swimmer may read it.
  const editable = data?.editable ?? false;
  const accessRequests = useQuery(
    api.swimmerAccess.listAccessRequestsForSwimmer,
    editable ? { swimmerId } : "skip",
  );

  if (data === undefined) return <ProfileSkeleton />;

  const { swimmer, personalBests, history } = data;

  const breadcrumb = viewerArea
    ? [{ label: "My swimmers", href: "/me/swimmers" }, { label: swimmer.name }]
    : [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Roster", href: "/swimmers" },
        { label: swimmer.name },
      ];

  // A viewer reaching a /me swimmer is, by the server-side access gate, linked to
  // them — so they may log/edit/delete that swimmer's school-gala times (§R15).
  const canLogGala = viewerArea;

  // History editing splits three ways: a managing coach edits every row; a viewer
  // edits ONLY the school-gala rows they added; anyone else is read-only.
  const historyOnEdit = editable
    ? (row: HistoryResult) => setEditing(row)
    : canLogGala
      ? (row: HistoryResult) => {
          setGalaEditing(row);
          setGalaOpen(true);
        }
      : undefined;
  const historyOnDelete =
    editable || canLogGala ? (row: HistoryResult) => setDeleting(row) : undefined;
  const historyCanEditRow = canLogGala
    ? (row: HistoryResult) => row.swimType === "SCHOOL_GALA"
    : undefined;

  // The Times sections — the read the profile always leads with. History is
  // editable only for a coach who manages this swimmer; a viewer edits just their
  // own school-gala rows; any other-club coach gets it read-only.
  const timesContent = (
    <div className="flex flex-col gap-8">
      <Section
        title="Personal bests"
        hint="Fastest meet time per event and course. Trials, practice and school galas never set a PB."
      >
        <PbBoard pbs={personalBests} />
      </Section>

      <Section
        title="Improvement"
        hint="First logged swim to the current PB, per event."
      >
        <ImprovementSummary pbs={personalBests} />
      </Section>

      <Section
        title="History"
        hint={
          editable
            ? "Every logged swim. Filter, sort, edit or delete."
            : canLogGala
              ? "Every logged swim. Filter and sort. You can edit or remove the school gala times you add."
              : "Every logged swim. Filter and sort."
        }
      >
        <HistoryTable
          rows={history}
          onEdit={historyOnEdit}
          onDelete={historyOnDelete}
          canEditRow={historyCanEditRow}
        />
      </Section>
    </div>
  );

  // Training notes (§R16): the dated audit trail of what's being worked on,
  // merging this swimmer's personal notes with their squads' notes. Shown to
  // coaches and to the swimmer's viewers alike; writes are coach-only server-side.
  const notesContent = (
    <TrainingNotesTimeline
      swimmerId={swimmerId}
      swimmerName={swimmer.name}
      today={today}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader
          title={swimmer.name}
          breadcrumb={breadcrumb}
          actions={
            editable ? (
              <Link
                href={`/log?swimmer=${swimmerId}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-base font-medium text-white shadow-theme-xs outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Timer className="size-4" /> Log a time
              </Link>
            ) : canLogGala ? (
              <button
                type="button"
                onClick={() => {
                  setGalaEditing(null);
                  setGalaOpen(true);
                }}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusCircle className="size-4 text-ink-faint" strokeWidth={1.75} />
                Log a school gala time
              </button>
            ) : undefined
          }
        />
        <IdentityStrip
          age={swimmer.age}
          gender={swimmer.gender}
          club={swimmer.club}
          active={swimmer.active}
          inSystemSince={swimmer.inSystemSince}
          resultCount={swimmer.resultCount}
        />
        {swimmer.notes && (
          <p className="max-w-[70ch] border-l-2 border-border pl-3 text-sm text-ink-muted">
            {swimmer.notes}
          </p>
        )}
      </div>

      {viewerArea ? (
        // Viewer: times then the (read-only) training-notes log, no tab bar and
        // no access admin.
        <div className="flex flex-col gap-8">
          {timesContent}
          {notesContent}
        </div>
      ) : (
        <Tabs
          ariaLabel={`${swimmer.name} sections`}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "times", label: "Times", content: timesContent },
            {
              value: "notes",
              label: "Training notes",
              content: notesContent,
            },
            {
              value: "access",
              label: "Access",
              badge: accessRequests?.length ?? 0,
              content: (
                <ViewerAccessSection
                  swimmerId={swimmerId}
                  swimmerName={swimmer.name}
                  editable={editable}
                />
              ),
            },
          ]}
        />
      )}

      {/* Edit — keyed per target so the form seeds from the row on open. */}
      <ResultEditSheet
        key={editing?._id ?? "closed"}
        open={editing !== null}
        result={editing}
        swimmerDob={swimmer.dob}
        today={today}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />

      {/* Viewer school-gala entry / edit (§R15). Keyed per target so the form
          re-seeds cleanly between "new" and editing a specific row. */}
      {canLogGala && (
        <SchoolGalaSheet
          key={galaEditing?._id ?? "new"}
          open={galaOpen}
          result={galaEditing}
          swimmerId={swimmerId}
          swimmerName={swimmer.name}
          swimmerDob={swimmer.dob}
          today={today}
          onOpenChange={(o) => {
            setGalaOpen(o);
            if (!o) setGalaEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Delete this result?"
        description={
          deleting ? (
            <>
              {deleting.label} · {deleting.course} ·{" "}
              <span className="time tnum">{formatTime(deleting.timeMs)}</span> on{" "}
              {formatShortDate(deleting.swimDate)}. This can&apos;t be undone.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Delete result"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteResult({ resultId: deleting._id });
          notify.success("Result deleted");
        }}
      />
    </div>
  );
}

function IdentityStrip({
  age,
  gender,
  club,
  active,
  inSystemSince,
  resultCount,
}: {
  age: number;
  gender: "M" | "F";
  club: string | null;
  active: boolean;
  inSystemSince: string;
  resultCount: number;
}) {
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <Stat label="Age" value={`${age}`} />
      <Divider />
      <Stat label="Gender" value={gender === "F" ? "Female" : "Male"} />
      <Divider />
      <Stat label="Club" value={club ?? "—"} />
      <Divider />
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Status</dt>
        <dd>
          {active ? (
            <span className="inline-flex items-center gap-1.5 text-success-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-success" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" /> Inactive
            </span>
          )}
        </dd>
      </div>
      <Divider />
      <div className="flex items-center gap-1.5 text-ink-muted">
        <CalendarClock aria-hidden className="size-4 text-ink-faint" />
        <dt className="sr-only">In system since</dt>
        <dd>
          In system since <span className="text-ink">{formatShortDate(inSystemSince)}</span>
        </dd>
      </div>
      <Divider />
      <Stat label="Results" value={`${resultCount}`} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-muted">
      <dt>{label}</dt>
      <dd className="tnum font-medium text-ink">{value}</dd>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-3.5 w-px bg-border" />;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-4">
        <div className="h-4 w-48 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-4 w-80 animate-pulse rounded-sm bg-surface-2" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      ))}
    </div>
  );
}
