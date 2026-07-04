import { internalAction } from "./_generated/server";
import { v } from "convex/values";

/*
  Transactional email via Resend (access-control Phase 7). Runs as a scheduled
  internal ACTION (mutations can't do network I/O) so granting viewer access can
  send a real invite instead of the coach telling a parent out-of-band to sign up.

  Secrets come from the Convex deployment env, never the repo:
    RESEND_API_KEY   your Resend key
    EMAIL_FROM       e.g. "Swim Tracker <admin@your-domain>"  (a verified sender)
    SITE_URL         the app URL, used for the sign-up / open link (already set)

  If RESEND_API_KEY / EMAIL_FROM are unset it's a no-op, so the app runs fine
  without email configured (dev, or before you add the key).
*/
export const sendViewerInvite = internalAction({
  args: {
    toEmail: v.string(),
    swimmerName: v.string(),
    // "pending" — no account yet, invite them to sign up.
    // "linked"  — account exists, tell them access was granted.
    kind: v.union(v.literal("pending"), v.literal("linked")),
  },
  returns: v.null(),
  handler: async (_ctx, { toEmail, swimmerName, kind }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.warn(
        "Resend not configured (RESEND_API_KEY / EMAIL_FROM unset); skipping invite email.",
      );
      return null;
    }

    const appUrl = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
    const link = kind === "linked" && appUrl ? `${appUrl}/me` : appUrl;
    const name = escapeHtml(swimmerName);

    const subject =
      kind === "pending"
        ? `You've been invited to follow ${swimmerName} on Swim Tracker`
        : `You now have access to ${swimmerName} on Swim Tracker`;

    const intro =
      kind === "pending"
        ? `A coach has given you read-only access to ${name}'s swimming times. Sign up with this email address to see them.`
        : `A coach has given you read-only access to ${name}'s swimming times.`;

    const button = link
      ? `<p style="margin:24px 0">
           <a href="${link}" style="display:inline-block;background:#465fff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
             ${kind === "pending" ? "Sign up" : "Open Swim Tracker"}
           </a>
         </p>
         <p style="color:#667085;font-size:13px;margin:0">Or paste this link into your browser: ${link}</p>`
      : "";

    const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#101828;font-size:15px;line-height:1.55">
        <p style="margin:0 0 4px">${intro}</p>
        ${button}
        <p style="color:#667085;font-size:13px;margin:20px 0 0">You'll only ever see the swimmer(s) you've been linked to. If you weren't expecting this, you can ignore this email.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: toEmail, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Don't throw — a failed email must never roll back a successful grant.
      console.error(`Resend send failed (${res.status}): ${detail}`);
    }
    return null;
  },
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}
