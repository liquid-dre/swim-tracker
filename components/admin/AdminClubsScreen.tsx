"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, UserRound, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";

/*
  Clubs & coaches admin (/admin/clubs, access-control Phase 4c). Super-user only —
  the route is reserved server-side (every clubs mutation requires the super-user)
  and in the shell (RoleGuard + isRouteAllowed). Two jobs: create the clubs, and
  assign each coach to one. A coach then edits only their own club's swimmers
  (Phase 5), while times and rankings stay shared across every club.
*/

export function AdminClubsScreen() {
  const clubs = useQuery(api.clubs.listClubs, {});
  const coaches = useQuery(api.clubs.listCoaches, {});

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Clubs & coaches"
        breadcrumb={trailForHref("/admin/clubs")}
        description="Create clubs and assign each coach to one. A coach edits only their own club's swimmers; the times and rankings stay shared across every club."
      />

      <ClubsSection clubs={clubs} />
      <CoachesSection clubs={clubs} coaches={coaches} />
    </div>
  );
}

type ClubRow = { _id: Id<"clubs">; name: string; coachCount: number; swimmerCount: number };
type CoachRow = {
  profileId: Id<"profiles">;
  name: string;
  email: string;
  clubId: Id<"clubs"> | null;
  clubName: string | null;
};

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

function ClubsSection({ clubs }: { clubs: ClubRow[] | undefined }) {
  const createClub = useMutation(api.clubs.createClub);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === "" || saving) return;
    setSaving(true);
    try {
      await notify.promise(createClub({ name }), {
        loading: "Creating club…",
        success: "Club created",
      });
      setName("");
    } catch {
      /* notify surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        icon={<Building2 aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
        title="Clubs"
        hint="Each club owns its swimmers and is one coach's edit boundary."
      />

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1" style={{ minWidth: "16rem" }}>
          <Input
            label="New club name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Seals Swim Club"
          />
        </div>
        <Button type="submit" disabled={name.trim() === ""} loading={saving}>
          Create club
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {clubs === undefined ? (
          <RowsSkeleton />
        ) : clubs.length === 0 ? (
          <EmptyRow>No clubs yet. Create your first one above.</EmptyRow>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Club</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Coaches</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Swimmers</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c._id} className="border-t border-border">
                  <td className="px-4 py-2 sm:px-5">
                    <ClubNameCell club={c} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {c.coachCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted sm:px-5">
                    {c.swimmerCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Inline-editable club name: commits a rename on blur / Enter when it changed. */
function ClubNameCell({ club }: { club: ClubRow }) {
  const renameClub = useMutation(api.clubs.renameClub);
  const [value, setValue] = useState(club.name);

  async function commit() {
    const next = value.trim();
    if (next === "" || next === club.name) {
      setValue(club.name);
      return;
    }
    try {
      await notify.promise(renameClub({ clubId: club._id, name: next }), {
        loading: "Renaming…",
        success: "Club renamed",
      });
    } catch {
      setValue(club.name);
    }
  }

  return (
    <input
      type="text"
      value={value}
      aria-label={`Rename ${club.name}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(club.name);
          e.currentTarget.blur();
        }
      }}
      className="w-full max-w-[22rem] rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-ink outline-none transition-colors [transition-duration:var(--dur-1)] hover:border-gray-200 focus:border-brand-300 focus:bg-white focus:shadow-focus-ring"
    />
  );
}

// ---------------------------------------------------------------------------
// Coaches
// ---------------------------------------------------------------------------

function CoachesSection({
  clubs,
  coaches,
}: {
  clubs: ClubRow[] | undefined;
  coaches: CoachRow[] | undefined;
}) {
  const assignCoach = useMutation(api.clubs.assignCoachToClub);
  const [email, setEmail] = useState("");
  const [clubId, setClubId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const hasClubs = (clubs?.length ?? 0) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim() === "" || clubId === "" || saving) return;
    setSaving(true);
    try {
      await notify.promise(
        assignCoach({ email, clubId: clubId as Id<"clubs"> }),
        { loading: "Assigning coach…", success: (r) => `${r?.name ?? "Coach"} assigned` },
      );
      setEmail("");
    } catch {
      /* notify surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        icon={<UserRound aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
        title="Coaches"
        hint="Assign a signed-up account to a club to make them its coach. Assigning again moves a coach between clubs."
      />

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1" style={{ minWidth: "16rem" }}>
          <Input
            label="Coach email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5" style={{ minWidth: "12rem" }}>
          <span className="text-sm font-medium text-gray-700">Club</span>
          <Select
            aria-label="Club"
            placeholder={hasClubs ? "Choose a club" : "Create a club first"}
            value={clubId}
            onValueChange={setClubId}
            disabled={!hasClubs}
            options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
          />
        </div>
        <Button
          type="submit"
          disabled={email.trim() === "" || clubId === "" || !hasClubs}
          loading={saving}
        >
          Assign coach
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {coaches === undefined ? (
          <RowsSkeleton />
        ) : coaches.length === 0 ? (
          <EmptyRow>No coaches assigned yet.</EmptyRow>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Coach</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Club</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Remove</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => (
                <CoachRowView key={c.profileId} coach={c} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function CoachRowView({ coach }: { coach: CoachRow }) {
  const removeCoach = useMutation(api.clubs.removeCoach);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    await notify.promise(removeCoach({ profileId: coach.profileId }), {
      loading: "Removing…",
      success: `${coach.name} is no longer a coach`,
    });
  }

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3 sm:px-5">
        <div className="font-medium text-ink">{coach.name}</div>
        <div className="text-xs text-ink-faint">{coach.email}</div>
        <div className="mt-0.5 text-xs text-ink-muted sm:hidden">
          {coach.clubName ?? "No club"}
        </div>
      </td>
      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
        {coach.clubName ?? <span className="text-warning-600">No club</span>}
      </td>
      <td className="px-4 py-3 text-right sm:px-5">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${coach.name} as a coach`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2} />
          Remove
        </button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Remove this coach?"
          description={
            <>
              <span className="font-medium text-ink">{coach.name}</span> becomes a
              read-only viewer and loses access to
              {coach.clubName ? (
                <>
                  {" "}
                  <span className="font-medium text-ink">{coach.clubName}</span>
                </>
              ) : (
                " their club"
              )}
              . You can assign them again anytime.
            </>
          }
          confirmLabel="Remove coach"
          onConfirm={async () => {
            await remove();
            setConfirming(false);
          }}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
        {icon}
        {title}
      </h2>
      <p className="text-sm text-ink-muted">{hint}</p>
    </div>
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
