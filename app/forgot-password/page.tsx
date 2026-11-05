"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthShell } from "@/components/marketing/AuthShell";

/*
  Forgot password — Convex Auth's built-in reset flow, in two steps on one
  page. Step 1 asks for the email and requests a code (`flow: "reset"`); step 2
  takes the emailed code plus a new password (`flow: "reset-verification"`),
  which signs the person in and signs every other session out.

  Step 1 ALWAYS lands on "if that email has an account, we've sent a code":
  the server throws for an unknown address, and showing that would let anyone
  list the registered parents and coaches by typing emails in. The one honest
  exception is a deployment with no email configured, which the page asks
  about up front — a code nobody can deliver must not be "sent".

  The email is normalised the way sign-up stores it (trimmed, lower-cased),
  because the verification step matches it character for character.
*/

type Step = "request" | "verify";

const signInFooter = (
  <>
    Remembered it?{" "}
    <Link href="/login" className="font-medium text-brand-500 hover:text-brand-600">
      Sign in
    </Link>
  </>
);

export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const available = useQuery(api.passwordReset.passwordResetAvailable, {});

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();
    if (normalised === "") return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", { email: normalised, flow: "reset" });
    } catch {
      // Deliberately the same outcome as success — see the note above.
    } finally {
      setEmail(normalised);
      setStep("verify");
      setSubmitting(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
    const newPassword = String(formData.get("newPassword") ?? "");
    try {
      await signIn("password", {
        email,
        code,
        newPassword,
        flow: "reset-verification",
      });
      router.push("/");
    } catch (err) {
      // A ConvexError is written for the user (the password rule); anything
      // else is a wrong or expired code, and production redacts its text.
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : "That code is wrong or has expired. Request a new one and try again.",
      );
      setSubmitting(false);
    }
  }

  if (available === false) {
    return (
      <AuthShell
        title="Reset password"
        subtitle="Password resets are not switched on for this site yet."
        footer={signInFooter}
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          Ask your club&rsquo;s coach or the site admin to reset your access.
          Once email is set up, you&rsquo;ll be able to reset it here yourself.
        </p>
      </AuthShell>
    );
  }

  if (step === "verify") {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Enter the code we sent and choose a new password."
        footer={signInFooter}
      >
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-600">
          <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p>
            If <span className="font-semibold">{email}</span> has an account,
            we&rsquo;ve sent it an 8-digit code. It expires in 15 minutes.
          </p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={verifyCode}>
          <Input
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            placeholder="12345678"
            className="tabular-nums tracking-wider"
          />
          <Input
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
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
            {submitting ? "Resetting…" : "Reset password"}
          </Button>
        </form>
        <p className="mt-5 text-sm text-ink-muted">
          Nothing arrived? Check spam, or if you signed up with a different
          email,{" "}
          <button
            type="button"
            onClick={() => {
              setStep("request");
              setError(null);
            }}
            className="font-medium text-brand-500 hover:text-brand-600"
          >
            try that one
          </button>
          . Your coach can tell you which address was invited.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email and we'll send you a code to set a new one."
      footer={signInFooter}
    >
      <form className="flex flex-col gap-4" onSubmit={requestCode}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@club.com"
        />
        <Button
          type="submit"
          className="w-full"
          loading={submitting}
          disabled={available === undefined}
        >
          {submitting ? "Sending…" : "Send code"}
        </Button>
      </form>
    </AuthShell>
  );
}
