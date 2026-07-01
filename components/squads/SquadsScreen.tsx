"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Plus, UsersRound } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
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
import { SquadForm, type EditableSquad } from "./SquadForm";
import { SquadMembersSheet } from "./SquadMembersSheet";

type FormTarget = EditableSquad | "new" | null;
type MembersTarget = { _id: Id<"squads">; name: string } | null;

export function SquadsScreen() {
  const squads = useQuery(api.squads.listSquads, {});
  const deleteSquad = useMutation(api.squads.deleteSquad);

  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [membersTarget, setMembersTarget] = useState<MembersTarget>(null);

  const loading = squads === undefined;
  const isEmpty = !loading && squads.length === 0;

  async function onDelete(id: Id<"squads">) {
    await notify.promise(deleteSquad({ squadId: id }), {
      loading: "Deleting…",
      success: "Squad deleted",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Squads"
        breadcrumb={trailForHref("/squads")}
        actions={
          <Button variant="primary" onClick={() => setFormTarget("new")}>
            <Plus className="size-4" /> New squad
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">Squad</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Description</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Members</th>
              <th scope="col" className="px-4 py-2.5 sm:px-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-border" aria-hidden>
                  <td className="px-4 py-3 sm:px-6"><Skeleton className="w-36" /></td>
                  <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="w-56" /></td>
                  <td className="px-4 py-3"><Skeleton className="w-10" /></td>
                  <td className="px-4 py-3 sm:px-6"><Skeleton className="ml-auto w-8" /></td>
                </tr>
              ))}

            {!loading &&
              squads.map((sq) => (
                <tr
                  key={sq._id}
                  className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-medium text-ink sm:px-6">{sq.name}</td>
                  <td className="hidden max-w-md px-4 py-3 text-ink-muted md:table-cell">
                    {sq.description ? (
                      <span className="line-clamp-1">{sq.description}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setMembersTarget({ _id: sq._id, name: sq.name })}
                      className="tnum inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <UsersRound className="size-3.5" />
                      {sq.memberCount}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right sm:px-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Squad actions"
                        className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => setMembersTarget({ _id: sq._id, name: sq.name })}
                        >
                          Manage members
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setFormTarget({
                              _id: sq._id,
                              name: sq.name,
                              description: sq.description,
                            })
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(sq._id)}
                        >
                          Delete squad
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {isEmpty && (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <UsersRound aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">No squads yet</p>
              <p className="mx-auto max-w-[42ch] text-sm text-ink-muted">
                Create a squad to group swimmers for comparison and tracking.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setFormTarget("new")}>
              <Plus className="size-4" /> New squad
            </Button>
          </div>
        )}
      </div>

      <SquadForm
        key={formTarget === null ? "closed" : formTarget === "new" ? "new" : formTarget._id}
        open={formTarget !== null}
        squad={formTarget === "new" ? null : formTarget}
        onOpenChange={(o) => {
          if (!o) setFormTarget(null);
        }}
      />

      <SquadMembersSheet
        key={membersTarget?._id ?? "closed"}
        open={membersTarget !== null}
        squad={membersTarget}
        onOpenChange={(o) => {
          if (!o) setMembersTarget(null);
        }}
      />
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}
