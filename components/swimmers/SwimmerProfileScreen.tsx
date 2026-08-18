"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, PlusCircle, Timer } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { notify } from "@/lib/notify";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import { PbBoard } from "./PbBoard";
import { ImprovementSummary } from "./ImprovementSummary";
import { AttendanceFigure } from "@/components/attendance/AttendanceFigure";
import { HistoryTable, type HistoryResult } from "./HistoryTable";
import { ResultEditSheet } from "./ResultEditSheet";
import { ViewerAccessSection } from "./ViewerAccessSection";
import { SchoolGalaSheet } from "@/components/me/SchoolGalaSheet";
import { TrainingNotesTimeline } from "@/components/training/TrainingNotesTimeline";

/*
  Swimmer profile (Step 6, BRD §5.4). Identity sits above the swim data, and
  every section below it is ONE tab — personal bests, improvement, history,
  training notes, attendance, access — rather than a single column a coach has
  to scroll through to reach the history table at the bottom. Each panel answers
  a different question, so each is one click, and `Tabs` leaves the closed ones
  unmounted: attendance and the notes timeline don't subscribe until opened.

  The tab set is derived from who is looking, and it is the ONLY gate: a viewer
  on /me/swimmers/[id] has no Attendance or Access tab, and `?tab=access` in
  their URL falls back to the default rather than rendering a panel they can't
  have. That is convenience, not security — access is enforced server-side, and
  every write below goes through the same authorization it always did.

  The active tab lives in the URL (`?tab=history`) so it survives a refresh and
  can be linked; `replace` rather than `push`, so tab clicks don't fill the back
  button. All swim data comes from `getSwimmerProfile`; PBs are derived
  server-side (there is no PB table).
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

  const router = useRouter();
  const searchParams = useSearchParams();

  const data = useQuery(api.personalBests.getSwimmerProfile, { swimmerId });
  const deleteResult = useMutation(api.results.deleteResult);

  const [editing, setEditing] = useState<HistoryResult | null>(null);
  const [deleting, setDeleting] = useState<HistoryResult | null>(null);
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

  const { swimmer, personalBests, history, bestPoints } = data;

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

  // One tab per section. Built as a list rather than inline JSX because the URL
  // validator below has to check against THIS role's tabs — that is what keeps
  // `?tab=access` on /me from rendering the access panel.
  const tabs: TabItem[] = [
    {
      value: "bests",
      label: "Personal bests",
      content: (
        <Panel hint="Fastest meet time per event and course. Trials, practice and school galas never set a PB.">
          {bestPoints && (
            <BestPointsLine
              best={bestPoints}
              href={viewerArea ? "/me/points" : "/points"}
            />
          )}
          <PbBoard pbs={personalBests} />
        </Panel>
      ),
    },
    {
      value: "improvement",
      label: "Improvement",
      content: (
        <Panel hint="First logged swim to the current PB, per event.">
          <ImprovementSummary pbs={personalBests} />
        </Panel>
      ),
    },
    {
      value: "history",
      label: "History",
      content: (
        // Editable only for a coach who manages this swimmer; a viewer edits
        // just their own school-gala rows; any other-club coach gets it
        // read-only. The gating props above decide all three.
        <Panel
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
        </Panel>
      ),
    },
    {
      // §R16 — the dated log of what is being worked on, merging this swimmer's
      // notes with their squads'. Coaches and the swimmer's viewers both read
      // it; writes are coach-only server-side.
      value: "notes",
      label: "Training notes",
      content: (
        <TrainingNotesTimeline
          swimmerId={swimmerId}
          swimmerName={swimmer.name}
          today={today}
        />
      ),
    },
  ];

  if (editable) {
    tabs.push({
      value: "attendance",
      label: "Attendance",
      content: (
        <Panel hint="Training attendance this season. Excused absences don't count against the rate.">
          <AttendanceFigure swimmerId={swimmerId} />
        </Panel>
      ),
    });
  }

  if (!viewerArea) {
    tabs.push({
      value: "access",
      label: "Access",
      // The count rides the tab so a coach reading the PB board still sees
      // someone is waiting on them.
      badge: accessRequests?.length ?? 0,
      content: (
        <ViewerAccessSection
          swimmerId={swimmerId}
          swimmerName={swimmer.name}
          editable={editable}
        />
      ),
    });
  }

  // The PB board is the read this profile is built around, so it opens. An
  // unknown or not-permitted `?tab=` falls back to it rather than erroring —
  // a stale link should land somewhere sensible, not on a dead screen.
  const requested = searchParams.get("tab");
  const tab = tabs.some((t) => t.value === requested) ? requested! : tabs[0].value;

  function selectTab(value: string) {
    // Merge rather than overwrite: the tab is one param among whatever else
    // the URL is carrying, and clobbering the query string here would quietly
    // drop anything a future link adds.
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    // replace, not push: six tabs would otherwise bury the page a coach
    // actually came from under a stack of tab clicks.
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

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

      {/* Same tab bar on both routes — a parent reads this on a phone, where a
          four-section stack ending in the full history table is the worst
          version of the scroll this replaces. */}
      <Tabs
        ariaLabel={`${swimmer.name} sections`}
        value={tab}
        onValueChange={selectTab}
        items={tabs}
      />

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
        note={{
          label: "Reason (optional)",
          placeholder: "e.g. logged against the wrong swimmer",
        }}
        onConfirm={async (reason) => {
          if (!deleting) return;
          await deleteResult({ resultId: deleting._id, reason });
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

/**
 * One tab's contents, led by its hint.
 *
 * No heading: the tab is the heading, and the panel is already
 * `aria-labelledby` it — repeating the label inside would be the same word
 * twice on a screen whose whole problem was clutter. The hint stays, because
 * it carries a domain rule the reader needs at the point of reading (why a
 * trial isn't a PB; why an excused absence doesn't count).
 */
function Panel({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">{hint}</p>
      {children}
    </section>
  );
}

/**
 * The swimmer's World Aquatics points, in one line above the PB board.
 *
 * One line, not a metric tile: the number is the loud thing, and a card of its
 * own would make it compete with the PB board it is derived from. It says which
 * swim earned it, because a points figure with no swim behind it is a score
 * rather than a fact.
 */
function BestPointsLine({
  best,
  href,
}: {
  best: {
    points: number;
    label: string;
    timeMs: number;
    swimDate: string;
    meetName: string | null;
    baseYear: number;
  };
  href: string;
}) {
  return (
    <p className="text-sm text-ink-muted">
      <Link
        className="font-medium text-brand-500 underline-offset-2 hover:underline"
        href={href}
      >
        <span className="tabular-nums">{best.points}</span> World Aquatics points
      </Link>{" "}
      — {best.label} in{" "}
      <span className="tabular-nums text-ink">{formatTime(best.timeMs)}</span>,{" "}
      {formatShortDate(best.swimDate)}
      {best.meetName ? ` · ${best.meetName}` : ""}. Long course, {best.baseYear}{" "}
      base times.
    </p>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-4">
        <div className="h-4 w-48 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-4 w-80 animate-pulse rounded-sm bg-surface-2" />
      </div>
      {/* Stand in for the tab rail as well as the panel: without it the whole
          page jumps down by a rail's height the moment the data lands. */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-6 border-b border-border pb-3">
          {[28, 22, 16, 26].map((w, i) => (
            <div
              key={i}
              style={{ width: `${w * 4}px` }}
              className="h-4 animate-pulse rounded-sm bg-surface-2"
            />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-4 w-96 max-w-full animate-pulse rounded-sm bg-surface-2" />
          <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      </div>
    </div>
  );
}
