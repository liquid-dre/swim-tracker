"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search, UserPlus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import { RosterTable, type RosterRow } from "./RosterTable";
import { SwimmerForm } from "./SwimmerForm";

type Scope = "active" | "all";
type EditTarget = RosterRow | "new" | null;

// Server-side LIMIT in convex/swimmers.ts listSwimmers.
const ROSTER_CAP = 500;

export function SwimmersScreen({
  today,
  myClubOnly = false,
  title = "Roster",
  href = "/swimmers",
}: {
  today: string;
  // "My swimmers" mode: scope the list to the coach's own club (server-enforced).
  myClubOnly?: boolean;
  title?: string;
  href?: string;
}) {
  const [scope, setScope] = useState<Scope>("active");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditTarget>(null);

  const swimmers = useQuery(api.swimmers.listSwimmers, {
    activeOnly: scope === "active",
    search: search.trim() === "" ? undefined : search.trim(),
    ...(myClubOnly ? { myClubOnly: true } : {}),
  });
  const setActive = useMutation(api.swimmers.setSwimmerActive);

  async function toggleActive(id: Id<"swimmers">, next: boolean) {
    await notify.promise(setActive({ swimmerId: id, active: next }), {
      loading: next ? "Reactivating…" : "Deactivating…",
      success: next ? "Swimmer reactivated" : "Swimmer deactivated",
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={title}
        breadcrumb={trailForHref(href)}
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <UserPlus className="size-4" /> Add swimmer
          </Button>
        }
      />

      {/* Toolbar: search + active/all scope */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative grow sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search swimmers"
            aria-label="Search swimmers"
            className="h-11 lg:h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink-muted outline-none transition-[border-color] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
          />
        </div>
        <div className="ml-auto">
          <Segmented
            ariaLabel="Filter by status"
            value={scope}
            onChange={setScope}
            options={[
              { value: "active", label: "Active" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      <RosterTable
        rows={swimmers}
        scope={scope}
        search={search}
        onAdd={() => setEditing("new")}
        onEdit={(row) => setEditing(row)}
        onToggleActive={(row) => toggleActive(row._id, !row.active)}
      />

      {/* Mirrors the server's defensive read cap so hitting it is never silent. */}
      {swimmers !== undefined && swimmers.length === ROSTER_CAP && (
        <p className="rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-2.5 text-sm text-gray-700">
          Showing the first {ROSTER_CAP} swimmers — use search to find anyone
          not listed.
        </p>
      )}

      <SwimmerForm
        key={editing === null ? "closed" : editing === "new" ? "new" : editing._id}
        open={editing !== null}
        swimmer={
          editing === "new" || editing === null
            ? null
            : {
                _id: editing._id,
                name: editing.name,
                dob: editing.dob,
                gender: editing.gender,
                notes: editing.notes,
                clubId: editing.clubId,
                clubName: editing.clubName,
              }
        }
        today={today}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </div>
  );
}
