"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UsersRound, Waves } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { trailForHref } from "@/lib/nav";
import { notify } from "@/lib/notify";

/*
  Admin › Unassigned (/admin/unassigned). Every coach reads only their own club,
  so a swimmer or squad with no club is invisible to all of them until it has
  one. This is where the Admin gives it one.

  Squads whose members all share a club can be filled in with one click (the
  inference is unambiguous); swimmers and the remaining squads are ticked and
  assigned to a club by hand, because nothing records which club they came from.
*/
export function UnassignedScreen() {
  const data = useQuery(api.clubs.listUnassigned, {});
  const clubs = useQuery(api.clubs.listClubs, {});
  const infer = useMutation(api.clubs.inferSquadClubs);
  const assign = useMutation(api.clubs.bulkAssignClub);

  const [swimmerIds, setSwimmerIds] = useState<Set<Id<"swimmers">>>(new Set());
  const [squadIds, setSquadIds] = useState<Set<Id<"squads">>>(new Set());
  const [clubId, setClubId] = useState("");
  const [busy, setBusy] = useState(false);

  const inferable = data?.squads.filter((s) => s.suggestedClubId !== null).length ?? 0;
  const chosen = swimmerIds.size + squadIds.size;
  const empty = data !== undefined && data.swimmers.length === 0 && data.squads.length === 0;

  async function run(action: () => Promise<unknown>, loading: string, success: string) {
    setBusy(true);
    try {
      await notify.promise(action(), { loading, success });
      setSwimmerIds(new Set());
      setSquadIds(new Set());
    } catch {
      /* notify surfaces the server message */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Unassigned"
        breadcrumb={trailForHref("/admin/unassigned")}
        description="Swimmers and squads with no club. Coaches only see their own club, so nothing here is visible to any coach until it has one."
      />

      {empty ? (
        <p className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-ink-muted shadow-theme-sm">
          Every swimmer and squad belongs to a club.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5" style={{ minWidth: "14rem" }}>
              <label htmlFor="assign-club" className="text-sm font-medium text-gray-700">
                Assign the ticked rows to
              </label>
              <Select
                id="assign-club"
                value={clubId}
                onValueChange={setClubId}
                placeholder="Choose a club"
                options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
              />
            </div>
            <Button
              loading={busy}
              disabled={clubId === "" || chosen === 0}
              onClick={() =>
                run(
                  () =>
                    assign({
                      clubId: clubId as Id<"clubs">,
                      swimmerIds: [...swimmerIds],
                      squadIds: [...squadIds],
                    }),
                  "Assigning…",
                  `${chosen} assigned`,
                )
              }
            >
              Assign {chosen > 0 ? <span className="tabular-nums">{chosen}</span> : null}
            </Button>
            {inferable > 0 && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => infer({}), "Filling in…", "Squads filled in from their members")
                }
              >
                Fill in {inferable} {inferable === 1 ? "squad" : "squads"} from members
              </Button>
            )}
          </div>

          <Section
            icon={<Waves aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
            title="Swimmers"
            hint="Nothing records which club these came from — pick it by hand."
          >
            {data === undefined ? (
              <RowsSkeleton />
            ) : data.swimmers.length === 0 ? (
              <EmptyRow>Every swimmer has a club.</EmptyRow>
            ) : (
              <CheckTable
                rows={data.swimmers.map((s) => ({
                  id: s._id,
                  primary: s.name,
                  secondary: [
                    s.active ? null : "Inactive",
                    s.squadNames.length > 0 ? s.squadNames.join(", ") : "No squad",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                selected={swimmerIds}
                onChange={setSwimmerIds}
                noun="swimmer"
              />
            )}
          </Section>

          <Section
            icon={<UsersRound aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
            title="Squads"
            hint="A squad whose members all share a club can be filled in automatically. Empty and mixed squads need a person."
          >
            {data === undefined ? (
              <RowsSkeleton />
            ) : data.squads.length === 0 ? (
              <EmptyRow>Every squad has a club.</EmptyRow>
            ) : (
              <CheckTable
                rows={data.squads.map((s) => ({
                  id: s._id,
                  primary: s.name,
                  secondary: [
                    `${s.memberCount} ${s.memberCount === 1 ? "member" : "members"}`,
                    s.suggestedClubName
                      ? `all in ${s.suggestedClubName}`
                      : s.memberCount === 0
                        ? "empty"
                        : "members in more than one club",
                  ].join(" · "),
                }))}
                selected={squadIds}
                onChange={setSquadIds}
                noun="squad"
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function CheckTable<T extends string>({
  rows,
  selected,
  onChange,
  noun,
}: {
  rows: Array<{ id: T; primary: string; secondary: string }>;
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  noun: string;
}) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggle(id: T) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }
  return (
    <table className="w-full text-base">
      <thead>
        <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <th scope="col" className="w-12 px-4 py-2.5 sm:px-5">
            <input
              type="checkbox"
              aria-label={`Select every ${noun}`}
              className="size-4 accent-brand-500"
              checked={all}
              onChange={() => onChange(all ? new Set() : new Set(rows.map((r) => r.id)))}
            />
          </th>
          <th scope="col" className="px-4 py-2.5 font-medium sm:pr-5">
            {noun === "swimmer" ? "Swimmer" : "Squad"}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="px-4 py-3 sm:px-5">
              <input
                type="checkbox"
                aria-label={`Select ${r.primary}`}
                className="size-4 accent-brand-500"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
            </td>
            <td className="px-4 py-3 sm:pr-5">
              <div className="font-medium text-ink">{r.primary}</div>
              <div className="text-sm text-ink-muted">{r.secondary}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
          {icon}
          {title}
        </h2>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {children}
      </div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-ink-muted sm:px-5">{children}</div>;
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-surface-2" />
      ))}
    </div>
  );
}
