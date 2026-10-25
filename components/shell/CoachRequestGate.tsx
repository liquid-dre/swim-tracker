"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Clock, XCircle } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Button } from "@/components/ui/Button";
import { RequestCoachAccessSheet } from "@/components/permissions/RequestCoachAccessSheet";
import { hasStashedCoachRequest, takeCoachRequest } from "@/lib/coachRequest";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useCurrentProfile } from "@/lib/useCurrentProfile";

/*
  Holds the app behind "waiting for approval" while a coach request is open.

  1. Files the request a new coach chose at sign-up (stashed across the auth
     redirect, lib/coachRequest.ts) once the session is live.
  2. While that request is PENDING — or REJECTED and not yet dismissed — and
     the account has no linked swimmers, renders the waiting screen IN PLACE of
     the app: there is nothing behind it to show. A parent who asked later keeps
     their swimmers; their request lives in the account menu instead.
  3. A coach with no club (removed from one by the Admin mid-session) sees the
     same calm screen rather than a shell of empty pages.

  The server enforces all of it regardless; this is the UX of waiting.
*/
export function CoachRequestGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const profile = useCurrentProfile();
  const request = useMutation(api.coachPermissions.requestCoachAccess);
  const mine = useQuery(api.coachPermissions.myCoachRequest, isAuthenticated ? {} : "skip");

  // A stash means the request is about to be filed: show the waiting screen
  // straight away rather than flashing the viewer home first.
  const [filing, setFiling] = useState(false);
  const handled = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || handled.current) return;
    handled.current = true;
    if (!hasStashedCoachRequest()) return;
    const clubId = takeCoachRequest();
    if (!clubId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiling(true);
    request({ clubId: clubId as Id<"clubs"> })
      .catch((err) => notify.error(err))
      .finally(() => setFiling(false));
  }, [isAuthenticated, request]);

  const clublessCoach = profile != null && profile.role === "COACH" && !profile.clubId;

  if (filing) return <WaitingScreen status="FILING" />;
  if (mine?.blocking) return <WaitingScreen status={mine.status} request={mine} />;
  if (clublessCoach) return <WaitingScreen status="NO_CLUB" />;
  return <>{children}</>;
}

type OpenRequest = {
  clubName: string;
  createdAt: number;
  decidedAt: number | null;
  reason: string | null;
};

function WaitingScreen({
  status,
  request,
}: {
  status: "FILING" | "PENDING" | "REJECTED" | "NO_CLUB";
  request?: OpenRequest;
}) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const cancel = useMutation(api.coachPermissions.cancelMyCoachRequest);
  const dismiss = useMutation(api.coachPermissions.dismissCoachRejection);
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: Promise<unknown>, loading: string, success: string) {
    setBusy(true);
    try {
      await notify.promise(action, { loading, success });
    } catch {
      /* notify surfaces the server message */
    } finally {
      setBusy(false);
    }
  }

  const signOutLink = (
    <button
      type="button"
      className="rounded-sm font-medium text-brand-500 outline-none hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );

  if (status === "REJECTED" && request) {
    return (
      <AuthShell
        title="Request not approved"
        subtitle={`${request.clubName} didn't approve your coach request.`}
        footer={signOutLink}
      >
        <div className="flex flex-col gap-5">
          <Notice icon={<XCircle className="size-4" aria-hidden />} tone="error">
            {request.reason ? (
              <>
                <span className="font-medium">Their note:</span> {request.reason}
              </>
            ) : (
              "They didn't leave a note. If you think this is a mistake, speak to the club's head coach."
            )}
          </Notice>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => setAskOpen(true)} disabled={busy}>
              Ask another club
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() =>
                run(dismiss({}), "Opening your account…", "Continuing as a parent")
              }
            >
              Continue without coach access
            </Button>
          </div>
        </div>
        <RequestCoachAccessSheet open={askOpen} onOpenChange={setAskOpen} />
      </AuthShell>
    );
  }

  if (status === "NO_CLUB") {
    return (
      <AuthShell
        title="No club yet"
        subtitle="Your coach account isn't attached to a club, so there's nothing to show."
        footer={signOutLink}
      >
        <Notice icon={<Clock className="size-4" aria-hidden />} tone="neutral">
          Ask the Admin to add you to your club, or a club&rsquo;s super coach to
          approve you.
        </Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Waiting for approval"
      subtitle={
        request
          ? `${request.clubName}'s super coaches will approve you and choose your coaching role.`
          : "Sending your request to the club…"
      }
      footer={signOutLink}
    >
      <div className="flex flex-col gap-5">
        <Notice icon={<Clock className="size-4" aria-hidden />} tone="neutral">
          {request ? (
            <>
              Requested <span className="tabular-nums">{formatDateTime(request.createdAt)}</span>.
              You&rsquo;ll get access the moment it&rsquo;s approved; this page updates on
              its own.
            </>
          ) : (
            "One moment."
          )}
        </Notice>
        {request && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(cancel({}), "Cancelling…", "Request cancelled")}
          >
            Cancel request
          </Button>
        )}
      </div>
    </AuthShell>
  );
}

function Notice({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode;
  tone: "neutral" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm " +
        (tone === "error"
          ? "border-error-500/30 bg-error-50 text-error-600"
          : "border-gray-200 bg-gray-50 text-gray-700")
      }
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
