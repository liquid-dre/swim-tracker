"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clock, Trash2, UserPlus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { notify } from "@/lib/notify";

/*
  Coach control for viewer↔swimmer linkage (Step 15, BRD §2, §5.9; access-control
  Phase 6). Grant a swimmer/parent read-only access to THIS swimmer by email, and
  revoke it. Club-scoped: only the swimmer's own-club coach (or the super-user)
  manages access — `editable` reflects that, and the server enforces it too.

  A grant links an existing account immediately, or PRE-AUTHORISES the email so
  access binds automatically when they sign up. Pending invites are listed
  separately and can be withdrawn before they're claimed.
*/
type RemoveTarget =
  | { kind: "linked"; profileId: Id<"profiles">; label: string }
  | { kind: "pending"; email: string; label: string };

export function ViewerAccessSection({
  swimmerId,
  swimmerName,
  editable,
}: {
  swimmerId: Id<"swimmers">;
  swimmerName: string;
  editable: boolean;
}) {
  const viewers = useQuery(
    api.swimmerAccess.listSwimmerViewers,
    editable ? { swimmerId } : "skip",
  );
  const grantViewerAccess = useMutation(api.swimmerAccess.grantViewerAccess);
  const unlinkViewer = useMutation(api.swimmerAccess.unlinkViewer);
  const cancelPendingViewer = useMutation(api.swimmerAccess.cancelPendingViewer);

  const [email, setEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);

  async function onLink(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (value === "" || linking) return;
    setLinking(true);
    try {
      const res = await grantViewerAccess({ viewerEmail: value, swimmerId });
      notify.success(
        res.status === "linked"
          ? `Linked ${res.email} to ${swimmerName}`
          : `Invited ${res.email}. We've emailed them a sign-up link.`,
      );
      setEmail("");
    } catch (err) {
      notify.error(err);
    } finally {
      setLinking(false);
    }
  }

  // Non-managing staff (another club's coach) can view the swimmer but not its
  // viewer list — that's the parents' contact info, kept to the owning club.
  if (!editable) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeading swimmerName={swimmerName} />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-ink-muted shadow-theme-sm md:p-6">
          Viewer access is managed by {swimmerName}&rsquo;s own club.
        </div>
      </section>
    );
  }

  const list = viewers ?? [];

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading swimmerName={swimmerName} />

      <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <form onSubmit={onLink} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Give a viewer access by email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="parent@example.com"
              hint="We email them a link. Access binds when they sign up, or right away if they already have an account."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            loading={linking}
            disabled={email.trim() === ""}
            className="shrink-0"
          >
            <UserPlus className="size-4" /> Add viewer
          </Button>
        </form>

        <div className="border-t border-gray-100 pt-4">
          {viewers === undefined ? (
            <ul className="flex flex-col gap-2" aria-busy>
              {[0, 1].map((i) => (
                <li key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </ul>
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No viewers yet. Add a swimmer or parent above to give them read-only
              access.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {list.map((v) => (
                <li
                  key={(v.pending ? "p:" : "l:") + v.email}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className={
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold " +
                      (v.pending
                        ? "bg-surface-2 text-ink-muted"
                        : "bg-brand-50 text-brand-500")
                    }
                  >
                    {v.pending ? <Clock className="size-4" /> : initials(v.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {v.pending ? v.email : v.name}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {v.pending ? "Invited · access on sign-up" : v.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRemoving(
                        v.pending
                          ? { kind: "pending", email: v.email, label: v.email }
                          : {
                              kind: "linked",
                              profileId: v.profileId as Id<"profiles">,
                              label: v.name,
                            },
                      )
                    }
                    aria-label={
                      v.pending
                        ? `Cancel the invite for ${v.email}`
                        : `Remove ${v.name}'s access`
                    }
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-error-50 hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        title={removing?.kind === "pending" ? "Cancel this invite?" : "Remove viewer access?"}
        description={
          removing
            ? removing.kind === "pending"
              ? `${removing.label} won't get access to ${swimmerName} when they sign up. You can invite them again any time.`
              : `${removing.label} will no longer be able to see ${swimmerName}. You can re-add them any time.`
            : ""
        }
        confirmLabel={removing?.kind === "pending" ? "Cancel invite" : "Remove access"}
        onConfirm={async () => {
          if (!removing) return;
          if (removing.kind === "linked") {
            await unlinkViewer({ profileId: removing.profileId, swimmerId });
            notify.success(`Removed ${removing.label}`);
          } else {
            await cancelPendingViewer({ email: removing.email, swimmerId });
            notify.success(`Cancelled the invite for ${removing.label}`);
          }
        }}
      />
    </section>
  );
}

function SectionHeading({ swimmerName }: { swimmerName: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-ink">Viewer access</h2>
      <p className="text-sm text-ink-muted">
        People who can see {swimmerName}&rsquo;s times, read-only. They see only the
        swimmer(s) you link them to, nothing else in the club.
      </p>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
