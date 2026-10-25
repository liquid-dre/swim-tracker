"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthShell } from "@/components/marketing/AuthShell";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { stashCoachInvite } from "@/lib/coachInvite";
import { stashCoachRequest } from "@/lib/coachRequest";

// Sign up (Step 1.2), rehoused in the water AuthShell for the front-door overhaul.
// A successful sign-up creates the auth user and, via afterUserCreatedOrUpdated,
// a VIEWER profile. A `?invite=<token>` in the URL is a coach invite (P0): we
// preview the club it grants, stash the token, and redeem it after sign-up from
// the authenticated app shell (InviteRedeemer) — never here, where it could race
// the session becoming live.
//
// Without an invite, a person signing up as a COACH picks their club here. The
// choice is stashed the same way and filed as a coach request from the shell
// (CoachRequestGate); the account stays a viewer, waiting, until that club's
// super coaches approve it and choose a coaching role.
export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read the invite token client-side (after mount) so the preview query runs,
  // and stash it for post-login redemption.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(new URLSearchParams(window.location.search).get("invite"));
    stashCoachInvite();
  }, []);
  const invite = useQuery(
    api.clubs.previewCoachInvite,
    token ? { token } : "skip",
  );

  // "I'm a… Parent / swimmer · Coach". An invite already names the club and
  // the role, so the question is not asked alongside one.
  const [kind, setKind] = useState<"VIEWER" | "COACH">("VIEWER");
  const [clubId, setClubId] = useState("");
  const asksCoach = !token && kind === "COACH";
  const clubs = useQuery(api.coachPermissions.listClubsForSignup, asksCoach ? {} : "skip");

  return (
    <AuthShell
      title="Create account"
      subtitle="Set up your Swim Tracker account to get started."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-500 hover:text-brand-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      {token && invite && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-600">
          <Mail aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p>
            You&rsquo;ve been invited to coach{" "}
            <span className="font-semibold">{invite.clubName}</span>. Sign up to
            accept — we&rsquo;ll set the club for you.
          </p>
        </div>
      )}
      {token && invite === null && (
        <div className="mb-4 rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600">
          This coach invite link is invalid or has already been used. You can
          still create a regular account below.
        </div>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (asksCoach && clubId === "") {
            setError("Choose the club you coach at.");
            return;
          }
          setSubmitting(true);
          setError(null);
          const formData = new FormData(event.currentTarget);
          formData.set("flow", "signUp");
          try {
            // Stash before signing in: the request is filed from the shell.
            if (asksCoach) stashCoachRequest(clubId);
            await signIn("password", formData);
            router.push("/");
          } catch (err) {
            // A ConvexError carries a message written for the user (e.g. the
            // password requirements) — show it verbatim. Anything else is
            // redacted by production, so fall back to the likeliest cause.
            setError(
              err instanceof ConvexError && typeof err.data === "string"
                ? err.data
                : "Could not create the account. The email may already be in use.",
            );
            setSubmitting(false);
          }
        }}
      >
        {!token && (
          <div className="flex flex-col gap-1.5">
            <span id="signup-kind" className="text-sm font-medium text-gray-700">
              I&rsquo;m a…
            </span>
            <Segmented
              ariaLabel="I'm a"
              value={kind}
              onChange={setKind}
              options={[
                { value: "VIEWER", label: "Parent / swimmer" },
                { value: "COACH", label: "Coach" },
              ]}
            />
          </div>
        )}
        {asksCoach && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-club" className="text-sm font-medium text-gray-700">
              Your club
            </label>
            <Select
              id="signup-club"
              size="md"
              value={clubId}
              onValueChange={setClubId}
              placeholder={clubs === undefined ? "Loading clubs…" : "Choose your club"}
              disabled={clubs === undefined || clubs.length === 0}
              options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
            />
            <p className="text-sm text-ink-muted">
              {clubs !== undefined && clubs.length === 0
                ? "No clubs are set up yet. Sign up as a parent for now; the Admin can add you to your club later."
                : "The club's super coaches approve you and choose your coaching role."}
            </p>
          </div>
        )}
        <Input
          label="Name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Alex Coach"
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@club.com"
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          // Matches the server rule (convex/auth.ts) so most short passwords
          // never leave the browser.
          minLength={8}
          placeholder="••••••••"
          hint="At least 8 characters."
        />
        {error && (
          <p role="alert" className="text-sm text-error-600">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
