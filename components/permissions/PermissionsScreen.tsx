"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { History, Inbox, Users } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import {
  COACH_LEVELS,
  coachLevelLabel,
  coachLevelSummary,
  JUNIOR_MAX_AGE_MAX,
  JUNIOR_MAX_AGE_MIN,
  type CoachLevel,
} from "@/lib/coachLevel";
import { formatDateTime } from "@/lib/format";
import { trailForHref } from "@/lib/nav";
import { notify } from "@/lib/notify";
import { useCurrentProfile } from "@/lib/useCurrentProfile";

/*
  Permissions (/permissions). A club's Super Coaches (and the Admin, for any
  club) decide who coaches there and at what level:

    • Requests — people who asked to join. Approve WITH a level (there is no
      default: the choice is the decision) or reject, optionally saying why.
    • Coaches — change a coach's level, or remove them back to a viewer. The
      server refuses to leave the club without a super coach.
    • Age split — juniors are this age and under; it decides which swimmers a
      Junior and a Senior coach may write training notes for.
    • History — every decision, newest first.

  Every rule is enforced server-side (convex/coachPermissions.ts).
*/

type Permissions = NonNullable<
  ReturnType<typeof useQuery<typeof api.coachPermissions.getClubPermissions>>
>;

export function PermissionsScreen() {
  const profile = useCurrentProfile();
  const isAdmin = profile?.role === "SUPER_USER";

  // The Admin has no club of their own: they pick which club to manage.
  const clubs = useQuery(api.clubs.listClubs, isAdmin ? {} : "skip");
  const [adminClubId, setAdminClubId] = useState("");
  const clubId = isAdmin ? adminClubId : undefined;

  const data = useQuery(
    api.coachPermissions.getClubPermissions,
    profile === undefined || (isAdmin && adminClubId === "")
      ? "skip"
      : { clubId: clubId as Id<"clubs"> | undefined },
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Permissions"
        breadcrumb={trailForHref("/permissions")}
        description={
          data
            ? `Who coaches at ${data.club.name}, and what each coach may change.`
            : "Who coaches at your club, and what each coach may change."
        }
        actions={
          isAdmin ? (
            <div className="w-56">
              <Select
                aria-label="Club"
                value={adminClubId}
                onValueChange={setAdminClubId}
                placeholder="Choose a club"
                options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
              />
            </div>
          ) : undefined
        }
      />

      {isAdmin && adminClubId === "" ? (
        <p className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-ink-muted shadow-theme-sm">
          Choose a club to see its coach requests and coaches.
        </p>
      ) : (
        <>
          <RequestsSection data={data} />
          <CoachesSection data={data} clubId={clubId} />
          <HistorySection data={data} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function RequestsSection({ data }: { data: Permissions | undefined }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="requests-heading">
      <SectionHeader
        id="requests-heading"
        icon={<Inbox aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
        title={
          data && data.pending.length > 0
            ? `Requests to join (${data.pending.length})`
            : "Requests to join"
        }
        hint="People who signed up as a coach and chose this club. Pick a role to approve them."
      />
      <Card>
        {data === undefined ? (
          <RowsSkeleton />
        ) : data.pending.length === 0 ? (
          <EmptyRow>No one is waiting.</EmptyRow>
        ) : (
          <table className="w-full text-base">
            <thead>
              <HeadRow cells={["Name", "Requested", "Role", ""]} />
            </thead>
            <tbody>
              {data.pending.map((r) => (
                <RequestRow
                  key={r.requestId}
                  request={r}
                  juniorMaxAge={data.club.juniorMaxAge}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function RequestRow({
  request,
  juniorMaxAge,
}: {
  request: Permissions["pending"][number];
  juniorMaxAge: number;
}) {
  const approve = useMutation(api.coachPermissions.approveCoachRequest);
  const reject = useMutation(api.coachPermissions.rejectCoachRequest);
  const [level, setLevel] = useState<CoachLevel | "">("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  async function onApprove() {
    if (level === "" || busy) return;
    setBusy(true);
    try {
      await notify.promise(approve({ requestId: request.requestId, level }), {
        loading: "Approving…",
        success: `${request.name} approved as ${coachLevelLabel(level).toLowerCase()}`,
      });
    } catch {
      /* notify surfaces the server message */
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 sm:px-5">
        <PersonCell name={request.name} email={request.email} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-ink-muted">
        {formatDateTime(request.createdAt)}
      </td>
      <td className="px-4 py-2.5">
        <LevelSelect
          value={level}
          onChange={setLevel}
          placeholder="Choose a role"
          label={`Role for ${request.name}`}
          juniorMaxAge={juniorMaxAge}
        />
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            Reject
          </Button>
          <Button size="sm" loading={busy} disabled={level === ""} onClick={onApprove}>
            Approve
          </Button>
        </div>
        <ConfirmDialog
          open={rejecting}
          onOpenChange={setRejecting}
          title={`Reject ${request.name}?`}
          description="They stay a parent account and can ask another club. Any note you add is shown to them."
          confirmLabel="Reject"
          note={{ label: "Note to them (optional)", maxLength: 300 }}
          onConfirm={async (note) => {
            await reject({ requestId: request.requestId, reason: note });
            notify.success(`${request.name}'s request rejected`);
          }}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Coaches + the age split
// ---------------------------------------------------------------------------

function CoachesSection({
  data,
  clubId,
}: {
  data: Permissions | undefined;
  clubId: string | undefined;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="coaches-heading">
      <SectionHeader
        id="coaches-heading"
        icon={<Users aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
        title="Coaches"
        hint="Super coaches change everything. Senior and junior coaches read the whole club and write training notes for their age group only."
      />
      {data && <AgeSplit juniorMaxAge={data.club.juniorMaxAge} clubId={clubId} />}
      <Card>
        {data === undefined ? (
          <RowsSkeleton />
        ) : data.coaches.length === 0 ? (
          <EmptyRow>No coaches yet.</EmptyRow>
        ) : (
          <table className="w-full text-base">
            <thead>
              <HeadRow cells={["Name", "Role", ""]} />
            </thead>
            <tbody>
              {data.coaches.map((c) => (
                <CoachRow key={c.profileId} coach={c} juniorMaxAge={data.club.juniorMaxAge} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function CoachRow({
  coach,
  juniorMaxAge,
}: {
  coach: Permissions["coaches"][number];
  juniorMaxAge: number;
}) {
  const setLevel = useMutation(api.coachPermissions.setCoachLevel);
  const remove = useMutation(api.coachPermissions.removeClubCoach);
  const [removing, setRemoving] = useState(false);

  function onChange(level: CoachLevel | "") {
    if (level === "" || level === coach.level) return;
    void notify
      .promise(setLevel({ profileId: coach.profileId, level }), {
        loading: "Changing role…",
        success: `${coach.name} is now a ${coachLevelLabel(level).toLowerCase()}`,
      })
      .catch(() => {});
  }

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3 sm:px-5">
        <PersonCell name={coach.name} email={coach.email} self={coach.isSelf} />
      </td>
      <td className="px-4 py-2.5">
        <LevelSelect
          value={coach.level}
          onChange={onChange}
          label={`Role for ${coach.name}`}
          juniorMaxAge={juniorMaxAge}
        />
      </td>
      <td className="px-4 py-2.5 text-right sm:px-5">
        <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
          Remove
        </Button>
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={coach.isSelf ? "Remove yourself from the club?" : `Remove ${coach.name}?`}
          description={
            coach.isSelf
              ? "You lose coach access to the club straight away. Your account stays as a parent account."
              : "They lose coach access straight away. Their account stays as a parent account, and the notes they wrote stay."
          }
          confirmLabel="Remove"
          onConfirm={async () => {
            await remove({ profileId: coach.profileId });
            notify.success(`${coach.name} removed`);
          }}
        />
      </td>
    </tr>
  );
}

function AgeSplit({
  juniorMaxAge,
  clubId,
}: {
  juniorMaxAge: number;
  clubId: string | undefined;
}) {
  const save = useMutation(api.coachPermissions.setJuniorMaxAge);
  const ages: number[] = [];
  for (let a = JUNIOR_MAX_AGE_MIN; a <= JUNIOR_MAX_AGE_MAX; a++) ages.push(a);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
      <label htmlFor="junior-max-age" className="font-medium text-gray-700">
        Juniors are
      </label>
      <div className="w-36">
        <Select
          id="junior-max-age"
          value={String(juniorMaxAge)}
          onValueChange={(v) =>
            void notify
              .promise(
                save({
                  clubId: clubId as Id<"clubs"> | undefined,
                  juniorMaxAge: Number(v),
                }),
                { loading: "Saving…", success: "Age split saved" },
              )
              .catch(() => {})
          }
          options={ages.map((a) => ({ value: String(a), label: `${a} and under` }))}
        />
      </div>
      <span>
        · seniors are <span className="tabular-nums">{juniorMaxAge + 1}</span> and over,
        by age today.
      </span>
    </div>
  );
}

function LevelSelect({
  value,
  onChange,
  label,
  placeholder,
  juniorMaxAge,
}: {
  value: CoachLevel | "";
  onChange: (level: CoachLevel | "") => void;
  label: string;
  placeholder?: string;
  juniorMaxAge: number;
}) {
  return (
    <div className="flex min-w-44 flex-col gap-1">
      <Select
        aria-label={label}
        value={value}
        onValueChange={(v) => onChange(v as CoachLevel | "")}
        placeholder={placeholder}
        options={COACH_LEVELS.map((l) => ({ value: l, label: coachLevelLabel(l) }))}
      />
      {value !== "" && (
        <span className="text-xs text-ink-muted">
          {coachLevelSummary(value, juniorMaxAge)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistorySection({ data }: { data: Permissions | undefined }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="history-heading">
      <SectionHeader
        id="history-heading"
        icon={<History aria-hidden className="size-4 text-ink-faint" strokeWidth={1.75} />}
        title="History"
        hint="Every request, approval and role change at this club, newest first."
      />
      <Card>
        {data === undefined ? (
          <RowsSkeleton />
        ) : data.history.length === 0 ? (
          <EmptyRow>Nothing has happened here yet.</EmptyRow>
        ) : (
          <ol className="divide-y divide-border">
            {data.history.map((e) => (
              <li
                key={e._id}
                className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5"
              >
                <p className="text-sm text-ink">{describeEvent(e)}</p>
                <time className="shrink-0 text-xs tabular-nums text-ink-muted">
                  {formatDateTime(e.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}

function describeEvent(e: Permissions["history"][number]): string {
  const to = e.toLevel ? coachLevelLabel(e.toLevel).toLowerCase() : "";
  const from = e.fromLevel ? coachLevelLabel(e.fromLevel).toLowerCase() : "";
  switch (e.type) {
    case "REQUESTED":
      return `${e.subjectName} asked to join as a coach.`;
    case "CANCELLED":
      return `${e.subjectName} withdrew their request.`;
    case "APPROVED":
      return `${e.actorName} approved ${e.subjectName} as ${to}.`;
    case "REJECTED":
      return e.reason
        ? `${e.actorName} rejected ${e.subjectName}: “${e.reason}”`
        : `${e.actorName} rejected ${e.subjectName}.`;
    case "LEVEL_CHANGED":
      return `${e.actorName} changed ${e.subjectName} from ${from} to ${to}.`;
    case "REMOVED":
      return `${e.actorName} removed ${e.subjectName} as a coach.`;
    case "JOINED_BY_INVITE":
      return `${e.subjectName} joined as ${to} from an Admin invite.`;
    case "ASSIGNED_BY_ADMIN":
      return `${e.actorName} added ${e.subjectName} as ${to}.`;
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function PersonCell({ name, email, self }: { name: string; email: string; self?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-ink">
        {name}
        {self && <span className="ml-1.5 text-sm font-normal text-ink-muted">(you)</span>}
      </p>
      <p className="truncate text-sm text-ink-muted">{email}</p>
    </div>
  );
}

function HeadRow({ cells }: { cells: string[] }) {
  return (
    <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
      {cells.map((c, i) => (
        <th
          key={i}
          scope="col"
          className={
            "px-4 py-2.5 font-medium " +
            (i === 0 ? "sm:px-5 " : "") +
            (i === cells.length - 1 ? "sm:px-5" : "")
          }
        >
          {c === "" ? <span className="sr-only">Actions</span> : c}
        </th>
      ))}
    </tr>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      {children}
    </div>
  );
}

function SectionHeader({
  id,
  icon,
  title,
  hint,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
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
