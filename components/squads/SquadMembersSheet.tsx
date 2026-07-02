"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserMinus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select } from "@/components/ui/Select";
import { notify } from "@/lib/notify";

// Manage a squad's membership (Step 4). Add active swimmers not already in the
// squad, and remove current members. A swimmer can belong to several squads, so
// adding here never removes them from another.
export function SquadMembersSheet({
  open,
  onOpenChange,
  squad,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squad: { _id: Id<"squads">; name: string } | null;
}) {
  const members = useQuery(
    api.swimmers.listSwimmers,
    squad ? { squadId: squad._id } : "skip",
  );
  const activeSwimmers = useQuery(
    api.swimmers.listSwimmers,
    open ? { activeOnly: true } : "skip",
  );
  const addToSquad = useMutation(api.squads.addToSquad);
  const removeFromSquad = useMutation(api.squads.removeFromSquad);

  const memberIds = useMemo(
    () => new Set((members ?? []).map((m) => m._id)),
    [members],
  );
  const addable = (activeSwimmers ?? []).filter((s) => !memberIds.has(s._id));

  async function add(swimmerId: Id<"swimmers">) {
    if (!squad) return;
    await notify.promise(addToSquad({ swimmerId, squadId: squad._id }), {
      loading: "Adding…",
      success: "Added to squad",
    });
  }

  async function remove(swimmerId: Id<"swimmers">) {
    if (!squad) return;
    await notify.promise(removeFromSquad({ swimmerId, squadId: squad._id }), {
      loading: "Removing…",
      success: "Removed from squad",
    });
  }

  const loading = members === undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Manage members</SheetTitle>
          <SheetDescription>
            {squad ? `${squad.name}. ` : ""}Add or remove swimmers. A swimmer can
            be in more than one squad.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4">
          {/* Add control: native select handles long rosters with type-ahead. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-swimmer" className="text-sm font-medium text-ink">
              Add a swimmer
            </label>
            <Select
              id="add-swimmer"
              placeholder={
                addable.length === 0
                  ? "All active swimmers are in this squad"
                  : "Select a swimmer to add…"
              }
              value=""
              disabled={addable.length === 0}
              onValueChange={(v) => {
                if (v) void add(v as Id<"swimmers">);
              }}
              options={addable.map((s) => ({
                value: s._id,
                label: `${s.name} · ${s.age}`,
              }))}
            />
          </div>

          {/* Current members */}
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Members {members ? `(${members.length})` : ""}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {loading ? (
                <ul className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i} className="px-3 py-2.5">
                      <div className="h-3.5 w-40 animate-pulse rounded-sm bg-surface-2" />
                    </li>
                  ))}
                </ul>
              ) : members.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-ink-muted">
                  No swimmers in this squad yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {members.map((m) => (
                    <li
                      key={m._id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-sm font-medium text-ink">{m.name}</span>
                        <span className="tnum ml-2 text-sm text-ink-muted">{m.age}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(m._id)}
                        aria-label={`Remove ${m.name} from squad`}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <UserMinus className="size-4" />
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
