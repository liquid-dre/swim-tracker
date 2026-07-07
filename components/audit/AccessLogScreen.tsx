"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { trailForHref } from "@/lib/nav";
import type { Role } from "@/lib/nav";
import { formatDateTime } from "@/lib/format";
import {
  ACCESS_EVENT_META,
  AccessEventBadge,
  RoleChip,
  StatusPill,
  type AccessEventType,
  type LinkStatus,
} from "./shared";

/*
  Access log (§R17, Part A). A coach-only, read-only chronological record of every
  viewer-access event — invited, claimed, revoked, unlinked, expired (and the self-
  request approve/deny) — with who acted, when, and for whom. Newest first,
  filterable by swimmer / viewer / coach, with each link's current status. History
  is never edited away; this only reads it.
*/

type AccessRow = {
  _id: string;
  type: AccessEventType;
  at: number;
  swimmerId: string;
  swimmerName: string;
  viewerEmail: string;
  viewerName: string | null;
  actorName: string | null;
  actorRole: Role | null;
  approverName: string | null;
  status: LinkStatus;
};

// The account shown in the "By" column: the responsible coach on CLAIMED / EXPIRED
// (where the actor is the viewer / system), else whoever performed the event.
function byAccount(row: AccessRow): { name: string; role: Role } | null {
  if (row.type === "CLAIMED" || row.type === "EXPIRED") {
    return row.approverName ? { name: row.approverName, role: "COACH" } : null;
  }
  return row.actorName ? { name: row.actorName, role: row.actorRole ?? "COACH" } : null;
}

function viewerLabel(row: AccessRow): string {
  return row.viewerName && row.viewerName.trim() !== ""
    ? row.viewerName
    : row.viewerEmail;
}

export function AccessLogScreen() {
  const pathname = usePathname();
  // Cursor-paginated so the trail is complete; "Load more" walks further back.
  const {
    results: rows,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(api.audit.listAccessLog, {}, { initialNumItems: PAGE });

  const [swimmer, setSwimmer] = useState("ALL");
  const [viewer, setViewer] = useState("ALL");
  const [coach, setCoach] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | LinkStatus>("ALL");
  const [type, setType] = useState<"ALL" | AccessEventType>("ALL");

  // Distinct filter options, derived from the log itself.
  const swimmers = useMemo(
    () => distinct(rows.map((r) => r.swimmerName)),
    [rows],
  );
  const viewers = useMemo(() => distinct(rows.map(viewerLabel)), [rows]);
  const coaches = useMemo(
    () => distinct(rows.map((r) => byAccount(r)?.name ?? "")),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (swimmer === "ALL" || r.swimmerName === swimmer) &&
          (viewer === "ALL" || viewerLabel(r) === viewer) &&
          (coach === "ALL" || byAccount(r)?.name === coach) &&
          (status === "ALL" || r.status === status) &&
          (type === "ALL" || r.type === type),
      ),
    [rows, swimmer, viewer, coach, status, type],
  );

  const secondaryCount = (status !== "ALL" ? 1 : 0) + (type !== "ALL" ? 1 : 0);
  const loading = pageStatus === "LoadingFirstPage";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Access log"
        breadcrumb={trailForHref(pathname)}
        description="Who was given or removed viewer access, when, and by which coach. A read-only trail — every event stays on the record."
      />

      <FilterBar
        primary={
          <>
            <div className="w-48">
              <Select
                aria-label="Filter by swimmer"
                value={swimmer}
                onValueChange={setSwimmer}
                options={[
                  { value: "ALL", label: "All swimmers" },
                  ...swimmers.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                aria-label="Filter by viewer"
                value={viewer}
                onValueChange={setViewer}
                options={[
                  { value: "ALL", label: "All viewers" },
                  ...viewers.map((v) => ({ value: v, label: v })),
                ]}
              />
            </div>
            <div className="w-44">
              <Select
                aria-label="Filter by coach"
                value={coach}
                onValueChange={setCoach}
                options={[
                  { value: "ALL", label: "All coaches" },
                  ...coaches.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
          </>
        }
        filterCount={secondaryCount}
        onClear={() => {
          setStatus("ALL");
          setType("ALL");
        }}
        filters={
          <>
            <FilterField label="Current status">
              <Select
                aria-label="Filter by status"
                value={status}
                onValueChange={(v) => setStatus(v as "ALL" | LinkStatus)}
                options={[
                  { value: "ALL", label: "Any status" },
                  { value: "active", label: "Active" },
                  { value: "pending", label: "Pending" },
                  { value: "revoked", label: "Revoked" },
                  { value: "expired", label: "Expired" },
                ]}
              />
            </FilterField>
            <FilterField label="Event">
              <Select
                aria-label="Filter by event type"
                value={type}
                onValueChange={(v) => setType(v as "ALL" | AccessEventType)}
                options={[
                  { value: "ALL", label: "Any event" },
                  ...(
                    Object.keys(ACCESS_EVENT_META) as AccessEventType[]
                  ).map((t) => ({ value: t, label: ACCESS_EVENT_META[t].label })),
                ]}
              />
            </FilterField>
          </>
        }
      />

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No access events yet"
          body="When you invite a viewer, or someone claims or loses access, it will be recorded here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
          <div className="relative overflow-x-auto custom-scrollbar">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <Th className="sm:px-6">When</Th>
                  <Th>Event</Th>
                  <Th>Viewer</Th>
                  <Th>Swimmer</Th>
                  <Th>By</Th>
                  <Th className="sm:px-6">Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const by = byAccount(r);
                  return (
                    <tr
                      key={r._id}
                      className="border-t border-border align-top transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted sm:px-6">
                        {formatDateTime(r.at)}
                      </td>
                      <td className="px-4 py-3">
                        <AccessEventBadge type={r.type} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="block whitespace-nowrap font-medium text-ink">
                          {viewerLabel(r)}
                        </span>
                        {r.viewerName && (
                          <span className="block whitespace-nowrap text-xs text-ink-faint">
                            {r.viewerEmail}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink">
                        {r.swimmerName}
                      </td>
                      <td className="px-4 py-3">
                        {by ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-ink">{by.name}</span>
                            <RoleChip role={by.role} />
                            {r.type === "CLAIMED" && (
                              <span className="text-xs text-ink-faint">approver</span>
                            )}
                          </span>
                        ) : r.type === "EXPIRED" ? (
                          <span className="text-ink-faint">System</span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-ink">
                No events match these filters
              </p>
              <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-muted">
                Clear a filter to see more of the access history.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-ink-faint">
            {filtered.length} of {rows.length}{" "}
            {rows.length === 1 ? "event" : "events"}
            {pageStatus !== "Exhausted" && " loaded · newest first"}
          </p>
          {pageStatus !== "Exhausted" && (
            <Button
              variant="secondary"
              size="sm"
              loading={pageStatus === "LoadingMore"}
              onClick={() => loadMore(PAGE)}
            >
              Load older events
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Page size: generous enough that the filter dropdowns (derived from loaded
// rows) are useful on first paint, small enough to stay snappy.
const PAGE = 300;

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim() !== ""))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={"px-4 py-2.5 font-medium " + className}>
      {children}
    </th>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <ShieldCheck aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
      aria-busy
    />
  );
}
