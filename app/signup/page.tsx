"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, Mail } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { stashCoachInvite } from "@/lib/coachInvite";

// Sign up (Step 1.2), themed to the design system (DESIGN.md). A successful
// sign-up creates the auth user and, via the afterUserCreatedOrUpdated callback,
// a VIEWER profile. Shares the card / Input / Button vocabulary with /login.
//
// A `?invite=<token>` in the URL is a coach invite (access-control P0): we preview
// the club it grants, and after sign-up we redeem the token so the account becomes
// that club's coach — atomically, without the coach ever choosing a club.
export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read the invite token client-side (after mount) so the preview query runs,
  // and stash it for post-login redemption (survives the sign-in redirect and,
  // via sessionStorage, a hop to /login). A deliberate one-time read from an
  // external store (the URL): the server and first client render use null, then
  // we patch — avoiding the hydration mismatch a lazy initialiser reading
  // `window` would cause. Redemption itself happens in InviteRedeemer, once the
  // Convex session is live — never here where it could race that.
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

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <Droplets className="size-6" strokeWidth={2} />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Create account
          </h1>
          <p className="text-sm text-gray-500">
            Set up your Swim Tracker account to get started.
          </p>
        </div>
      </div>

      {token && invite && (
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-600">
          <Mail aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p>
            You&rsquo;ve been invited to coach{" "}
            <span className="font-semibold">{invite.clubName}</span>. Sign up to
            accept — we&rsquo;ll set the club for you.
          </p>
        </div>
      )}
      {token && invite === null && (
        <div className="rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600">
          This coach invite link is invalid or has already been used. You can
          still create a regular account below.
        </div>
      )}

      <form
        className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          const formData = new FormData(event.currentTarget);
          formData.set("flow", "signUp");
          try {
            await signIn("password", formData);
            router.push("/");
          } catch {
            setError(
              "Could not create the account. The email may already be in use.",
            );
            setSubmitting(false);
          }
        }}
      >
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
          placeholder="••••••••"
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

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-500 hover:text-brand-600"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
