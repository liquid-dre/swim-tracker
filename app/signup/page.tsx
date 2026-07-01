"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// Minimal, deliberately unstyled sign-up (Step 1.2). A successful sign-up
// creates the auth user and, via the afterUserCreatedOrUpdated callback, a
// VIEWER profile.
export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-xl font-semibold">Create account</h1>

      <form
        className="flex flex-col gap-3"
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
            setError("Could not create the account. The email may already be in use.");
            setSubmitting(false);
          }
        }}
      >
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Name"
          className="rounded border border-zinc-300 px-3 py-2"
        />
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="Email"
          className="rounded border border-zinc-300 px-3 py-2"
        />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Password"
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
