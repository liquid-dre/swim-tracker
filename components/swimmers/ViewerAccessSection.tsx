"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2, UserPlus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { notify } from "@/lib/notify";

/*
  Coach control for viewer↔swimmer linkage (Step 15, BRD §2, §5.9). Grant a
  viewer account read-only access to THIS swimmer by the email they signed up
  with, and revoke it. Coach-only — the screen lives on the coach profile and
  every mutation/query behind it rejects a non-coach server-side (authz.ts).

  A link needs an existing account: the viewer must have signed up at least once
  (the link references their profile row). The form surfaces the server's own
  message verbatim when it can't find one.
*/
export function ViewerAccessSection({
  swimmerId,
  swimmerName,
}: {
  swimmerId: Id<"swimmers">;
  swimmerName: string;
}) {
  const viewers = useQuery(api.swimmerAccess.listSwimmerViewers, { swimmerId });
  const linkViewer = useMutation(api.swimmerAccess.linkViewer);
  const unlinkViewer = useMutation(api.swimmerAccess.unlinkViewer);

  const [email, setEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<{
    profileId: Id<"profiles">;
    name: string;
  } | null>(null);

  async function onLink(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (value === "" || linking) return;
    setLinking(true);
    try {
      const res = await linkViewer({ viewerEmail: value, swimmerId });
      notify.success(
        res.alreadyLinked
          ? `${res.name} already had access`
          : `Linked ${res.name} to ${swimmerName}`,
      );
      setEmail("");
    } catch (err) {
      notify.error(err);
    } finally {
      setLinking(false);
    }
  }

  const list = viewers ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          Viewer access
        </h2>
        <p className="text-sm text-ink-muted">
          People who can see {swimmerName}&rsquo;s times, read-only. They see only
          the swimmer(s) you link them to — nothing else in the club.
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <form onSubmit={onLink} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Link a viewer by email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="parent@example.com"
              hint="They must have signed up first, using this email."
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
            <UserPlus className="size-4" /> Link viewer
          </Button>
        </form>

        <div className="border-t border-gray-100 pt-4">
          {viewers === undefined ? (
            <ul className="flex flex-col gap-2" aria-busy>
              {[0, 1].map((i) => (
                <li
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-surface-2"
                />
              ))}
            </ul>
          ) : list.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No viewers linked yet. Add one above to give a swimmer or parent
              read-only access.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {list.map((v) => (
                <li
                  key={v.profileId}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-500"
                  >
                    {initials(v.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {v.name}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{v.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRemoving({ profileId: v.profileId, name: v.name })
                    }
                    aria-label={`Remove ${v.name}'s access`}
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
        title="Remove viewer access?"
        description={
          removing
            ? `${removing.name} will no longer be able to see ${swimmerName}. You can re-link them any time.`
            : ""
        }
        confirmLabel="Remove access"
        onConfirm={async () => {
          if (!removing) return;
          await unlinkViewer({ profileId: removing.profileId, swimmerId });
          notify.success(`Removed ${removing.name}`);
        }}
      />
    </section>
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
