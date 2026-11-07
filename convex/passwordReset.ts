import { v } from "convex/values";
import { Email } from "@convex-dev/auth/providers/Email";

import { query } from "./_generated/server";

/*
  Password reset (the "forgot my password" flow). Convex Auth's Password
  provider verifies a reset with an EMAIL provider: `flow: "reset"` asks this
  provider to mail a one-time code to the account's address, and
  `flow: "reset-verification"` exchanges that code plus a new password for a
  signed-in session (and invalidates every other session). This file is that
  email provider, sending through the same Resend account the invite emails use
  (convex/emails.ts) — same two secrets, RESEND_API_KEY and EMAIL_FROM.

  The code is eight digits, which is why Convex Auth also demands the matching
  `email` in the verification call (a short token is never enough on its own).
  Fifteen minutes is long enough to find the email and short enough that a code
  read over someone's shoulder is worth little.

  When Resend is not configured the request THROWS rather than silently doing
  nothing: a person told "we've sent a code" when nothing was sent would wait at
  an empty inbox. The page asks `passwordResetAvailable` first and explains
  instead.
*/

export const RESET_CODE_LENGTH = 8;
export const RESET_CODE_MAX_AGE_SECONDS = 15 * 60;

function resendConfigured(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** Eight random decimal digits from Web Crypto — never Math.random. */
export function generateResetCode(): string {
  const bytes = new Uint32Array(RESET_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => String(n % 10)).join("");
}

export const ResendPasswordReset = Email({
  id: "resend-password-reset",
  maxAge: RESET_CODE_MAX_AGE_SECONDS,
  async generateVerificationToken() {
    return generateResetCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const resend = resendConfigured();
    if (!resend) {
      // Surfaces in the deployment log; the client never shows this text.
      throw new Error(
        "Password reset email not sent: RESEND_API_KEY / EMAIL_FROM are unset.",
      );
    }
    const minutes = Math.round(RESET_CODE_MAX_AGE_SECONDS / 60);
    // Spaced in two groups so it reads as a code, not a phone number.
    const shown = `${token.slice(0, 4)} ${token.slice(4)}`;
    const subject = "Your Swim Tracker password reset code";
    const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#101828;font-size:15px;line-height:1.55">
        <p style="margin:0 0 4px">Use this code to reset your Swim Tracker password. It expires in ${minutes} minutes.</p>
        <p style="margin:24px 0;font-size:28px;font-weight:600;letter-spacing:0.12em;font-variant-numeric:tabular-nums">${shown}</p>
        <p style="color:#667085;font-size:13px;margin:0">Enter it on the reset page along with your new password. If you didn't ask to reset your password, you can ignore this email — your password stays as it is.</p>
      </div>`;
    const text = `Use this code to reset your Swim Tracker password: ${token}\n\nIt expires in ${minutes} minutes. If you didn't ask for a reset, ignore this email.`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: resend.from, to: email, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }
  },
});

/**
 * Whether a reset code can actually be delivered in this deployment. Public
 * (the forgot-password page is signed-out) and reveals only that email is
 * configured — nothing about any account.
 */
export const passwordResetAvailable = query({
  args: {},
  returns: v.boolean(),
  handler: async () => resendConfigured() !== null,
});
