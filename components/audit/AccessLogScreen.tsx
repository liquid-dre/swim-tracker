"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

  const [swimmer, setSwimmer] = useState<"ALL" | Id<"swimmers">>("ALL");
  const [viewer, setViewer] = useState("ALL"); // "ALL" | viewerEmail
  const [coach, setCoach] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | LinkStatus>("ALL");
  const [type, setType] = useState<"ALL" | AccessEventType>("ALL");

  // Swimmer / viewer / event-type filter SERVER-SIDE (full-history search);
  // changing one restarts pagination from the newest match. Status and the
  // responsible-coach column are computed per-row, so those two still filter
  // client-side over the loaded window — the footer says so when they're on.
  const {
    results: rows,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.audit.listAccessLog,
    {
      swimmerId: swimmer === "ALL" ? undefined : swimmer,
      viewerEmail: viewer === "ALL" ? undefined : viewer,
      type: type === "ALL" ? undefined : type,
    },
    { initialNumItems: PAGE },
  );

  // Swimmers get a full option list; viewers are free-text emails, so their
  // options accumulate from every row seen this session (matching still runs
  // server-side). Accumulating — never re-derived from the current page —
  // means picking viewer A can't collapse the list to just A, and narrowing
  // another filter can't strand the selection as a blank trigger.
  const swimmerOptions = useQuery(api.swimmers.listSwimmers, {});
  const [seenViewers, setSeenViewers] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [seenCoaches, setSeenCoaches] = useState<Set<string>>(() => new Set());
  // Merge new rows in with guarded setState DURING render — React's sanctioned
  // "derive state from props" pattern (same as the matrix snapshot), no effect.
  {
    let changed = false;
    const next = new Map(seenViewers);
    for (const r of rows) {
      if (!next.has(r.viewerEmail)) {
        next.set(r.viewerEmail, viewerLabel(r));
        changed = true;
      }
    }
    if (changed) setSeenViewers(next);
  }
  {
    let changed = false;
    const next = new Set(seenCoaches);
    for (const r of rows) {
      const name = byAccount(r)?.name;
      if (name && !next.has(name)) {
        next.add(name);
        changed = true;
      }
    }
    if (changed) setSeenCoaches(next);
  }
  const viewers = useMemo(
    () =>
      [...seenViewers.entries()]
        .map(([email, label]) => ({ email, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [seenViewers],
  );
  const coaches = useMemo(
    () => [...seenCoaches].sort((a, b) => a.localeCompare(b)),
    [seenCoaches],
  );

  // The two client-side-only filters.
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (coach === "ALL" || byAccount(r)?.name === coach) &&
          (status === "ALL" || r.status === status),
      ),
    [rows, coach, status],
  );

  const secondaryCount = (status !== "ALL" ? 1 : 0) + (type !== "ALL" ? 1 : 0);
  const filtering =
    swimmer !== "ALL" || viewer !== "ALL" || coach !== "ALL" || secondaryCount > 0;
  // Only these two can under-report while older pages remain un-loaded.
  const clientFiltering = coach !== "ALL" || status !== "ALL";
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
                onValueChange={(v) => setSwimmer(v as "ALL" | Id<"swimmers">)}
                options={[
                  { value: "ALL", label: "All swimmers" },
                  ...(swimmerOptions ?? []).map((s) => ({
                    value: s._id,
                    label: s.name,
                  })),
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
                  ...viewers.map((v) => ({ value: v.email, label: v.label })),
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
        pageStatus !== "Exhausted" ? (
          // A page can come back empty while older history remains — never
          // claim the search is done while Load-older can still find matches.
          <EmptyState
            title="No matches in the newest events yet"
            body="Older history hasn't been searched — use “Load older events” below to keep looking."
          />
        ) : filtering ? (
          <EmptyState
            title="No events match these filters"
            body="The whole history was searched. Clear a filter to see more of the access record."
          />
        ) : (
          <EmptyState
            title="No access events yet"
            body="When you invite a viewer, or someone claims or loses access, it will be recorded here."
          />
        )
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
                Clear a filter to see more of the access record.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && (rows.length > 0 || pageStatus !== "Exhausted") && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-ink-faint">
            {/* Status / coach filter client-side over the loaded window — say
                so (naming only the active one) while older rows remain, or a
                filtered read looks complete when it isn't. The other filters
                search the full history. */}
            {clientFiltering && pageStatus !== "Exhausted"
              ? `${filtered.length} matching — the ${[
                  status !== "ALL" && "status",
                  coach !== "ALL" && "coach",
                ]
                  .filter(Boolean)
                  .join(" and ")} filter only searched the ${rows.length} loaded events`
              : `${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ""} ${
                  filtering ? "matching " : ""
                }${rows.length === 1 ? "event" : "events"}${pageStatus !== "Exhausted" ? " loaded" : ""}`}
            {" · newest first"}
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

// Page size: a meaningful first window of history, small enough to stay snappy.
const PAGE = 300;

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
