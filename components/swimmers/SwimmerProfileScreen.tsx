"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Timer } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { notify } from "@/lib/notify";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import { PbBoard } from "./PbBoard";
import { ImprovementSummary } from "./ImprovementSummary";
import { HistoryTable, type HistoryResult } from "./HistoryTable";
import { ResultEditSheet } from "./ResultEditSheet";
import { ViewerAccessSection } from "./ViewerAccessSection";

/*
  Swimmer profile (Step 6, BRD §5.4). One screen, four reads: identity, the PB
  board (derived headline meet PBs × course), the improvement summary, and the
  full history with edit/delete. All data comes from `getSwimmerProfile`; PBs are
  derived server-side (there is no PB table).
*/
export function SwimmerProfileScreen({
  swimmerId,
  today,
}: {
  swimmerId: Id<"swimmers">;
  today: string;
}) {
  const data = useQuery(api.personalBests.getSwimmerProfile, { swimmerId });
  const deleteResult = useMutation(api.results.deleteResult);

  const [editing, setEditing] = useState<HistoryResult | null>(null);
  const [deleting, setDeleting] = useState<HistoryResult | null>(null);

  if (data === undefined) return <ProfileSkeleton />;

  const { swimmer, personalBests, history, editable } = data;

  const breadcrumb = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Roster", href: "/swimmers" },
    { label: swimmer.name },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader
          title={swimmer.name}
          breadcrumb={breadcrumb}
          actions={
            editable ? (
              <Link
                href="/log"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-base font-medium text-white shadow-theme-xs outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Timer className="size-4" /> Log a time
              </Link>
            ) : undefined
          }
        />
        <IdentityStrip
          age={swimmer.age}
          gender={swimmer.gender}
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

      <Section
        title="Personal bests"
        hint="Fastest meet time per event and course. Trials and practice never set a PB."
      >
        <PbBoard pbs={personalBests} />
      </Section>

      <Section
        title="Improvement"
        hint="First logged swim to the current PB, per event."
      >
        <ImprovementSummary pbs={personalBests} />
      </Section>

      <Section title="History" hint="Every logged swim. Filter, sort, edit or delete.">
        <HistoryTable
          rows={history}
          onEdit={(row) => setEditing(row)}
          onDelete={(row) => setDeleting(row)}
        />
      </Section>

      <ViewerAccessSection
        swimmerId={swimmerId}
        swimmerName={swimmer.name}
        editable={editable}
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
  active,
  inSystemSince,
  resultCount,
}: {
  age: number;
  gender: "M" | "F";
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
