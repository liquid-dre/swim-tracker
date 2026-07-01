"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Droplets } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Sign up (Step 1.2), themed to the design system (DESIGN.md). A successful
// sign-up creates the auth user and, via the afterUserCreatedOrUpdated callback,
// a VIEWER profile. Shares the card / Input / Button vocabulary with /login.
export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
