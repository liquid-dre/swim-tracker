"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthShell } from "@/components/marketing/AuthShell";
import { stashCoachInvite } from "@/lib/coachInvite";

// Sign in (Step 1.2), rehoused in the water AuthShell for the front-door overhaul.
// A `?invite=` coach token (e.g. an existing account followed an invite link) is
// stashed and redeemed once the session is live in the app shell (P0).
export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    stashCoachInvite();
  }, []);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Enter your details to continue."
      footer={
        <>
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-brand-500 hover:text-brand-600"
          >
            Create one
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          const formData = new FormData(event.currentTarget);
          formData.set("flow", "signIn");
          try {
            await signIn("password", formData);
            router.push("/");
          } catch {
            setError("Invalid email or password.");
            setSubmitting(false);
          }
        }}
      >
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
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
        {error && (
          <p role="alert" className="text-sm text-error-600">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
