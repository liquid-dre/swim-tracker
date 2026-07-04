"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Droplets } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { stashCoachInvite } from "@/lib/coachInvite";

// Sign in (Step 1.2), themed to the design system (DESIGN.md): a single card on
// the soft gray-50 canvas, the brand mark, Outfit type, and the shared Input /
// Button components so the auth screens match the app shell. If a `?invite=`
// coach token rode in (e.g. an existing account followed an invite link), it's
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <Droplets className="size-6" strokeWidth={2} />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Sign in
          </h1>
          <p className="text-sm text-gray-500">
            Welcome back. Enter your details to continue.
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm"
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

      <p className="text-center text-sm text-gray-500">
        No account?{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-500 hover:text-brand-600"
        >
          Sign up
        </Link>
      </p>
    </main>
  );
}
