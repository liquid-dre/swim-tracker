"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Clock, Search, UserPlus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { notify } from "@/lib/notify";

/*
  Self-service viewer access (access-control P2). A signed-in viewer searches the
  (public) roster for their own swimmer and asks the owning club's coach for
  read-only access. The coach approves from the swimmer's profile. Rows reflect
  live state — already linked, already requested, or requestable — from the
  viewer's OWN scoped reads, so it never leaks anyone else's links.
*/
export function FindSwimmerScreen() {
  const picker = useQuery(api.swimmers.listSwimmersForPicker, {});
  const mine = useQuery(api.swimmers.listForProfile, {});
  const myRequests = useQuery(api.swimmerAccess.listMyAccessRequests, {});
  const requestAccess = useMutation(api.swimmerAccess.requestSwimmerAccess);

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<Id<"swimmers"> | null>(null);

  const linkedIds = new Set((mine?.swimmers ?? []).map((s) => s._id));
  const requestedIds = new Set(myRequests ?? []);
  const needle = search.trim().toLowerCase();
  const results =
    needle === ""
      ? []
      : (picker ?? [])
          .filter((s) => s.name.toLowerCase().includes(needle))
          .slice(0, 25);

  async function request(id: Id<"swimmers">, name: string) {
    setBusyId(id);
    try {
      await notify.promise(requestAccess({ swimmerId: id }), {
        loading: "Sending request…",
        success: `Request sent for ${name}. Their coach will approve it.`,
      });
    } catch {
      /* notify surfaces the server message */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          aria-label="Search swimmers by name"
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink-muted outline-none transition-[border-color] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
        />
      </div>

      {needle === "" ? (
        <p className="px-1 py-6 text-center text-sm text-ink-muted">
          Type your swimmer&rsquo;s name to find them and request access.
        </p>
      ) : picker === undefined ? (
        <ul className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </ul>
      ) : results.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-ink-muted">
          No swimmer matches &ldquo;{search.trim()}&rdquo;. Check the spelling, or
          ask your coach to add them.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {results.map((s) => {
            const linked = linkedIds.has(s._id);
            const requested = requestedIds.has(s._id);
            return (
              <li
                key={s._id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-ink-muted">
                    {s.gender === "F" ? "Female" : "Male"} · age {s.age}
                  </p>
                </div>
                {linked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
                    <Check aria-hidden className="size-3.5 text-success-ink" /> Linked
                  </span>
                ) : requested ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
                    <Clock aria-hidden className="size-3.5" /> Requested
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === s._id}
                    onClick={() => request(s._id, s.name)}
                  >
                    <UserPlus className="size-4" /> Request access
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
