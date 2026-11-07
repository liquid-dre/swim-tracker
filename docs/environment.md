# Environment variables

Where each variable lives and what it does. **Secrets are never committed** —
they're set on the Convex deployment (dashboard → Settings → Environment
Variables, or `npx convex env set NAME value`) or on the frontend host (Vercel).
The values below are placeholders.

## Convex deployment

| Variable | Required | Purpose |
|---|---|---|
| `JWT_PRIVATE_KEY` | yes | Auth token signing key. Set by `npx @convex-dev/auth`; **don't regenerate** (invalidates logins). |
| `JWKS` | yes | Auth public keys, set alongside `JWT_PRIVATE_KEY`. |
| `SITE_URL` | yes | App URL, e.g. `https://swim-tracker-three.vercel.app`. Used for auth redirects and email links. |
| `CONVEX_SITE_URL` | auto | Provided by Convex; used in `auth.config.ts`. No action. |
| `SUPER_USER_EMAILS` | yes (this app) | Comma-separated admin emails promoted to super-user on sign-in. e.g. `you@example.com`. |
| `RESEND_API_KEY` | for email | Resend API key (`re_...`). Unset ⇒ invite emails are silently skipped and password reset is unavailable. |
| `EMAIL_FROM` | for email | Verified sender, e.g. `Swim Tracker <admin@your-domain>`. |

Set the email ones with:

```bash
npx convex env set RESEND_API_KEY "re_xxx"
npx convex env set EMAIL_FROM "Swim Tracker <admin@your-domain>"
npx convex env set SITE_URL "https://your-app-url"
npx convex env set SUPER_USER_EMAILS "you@example.com"
```

> The Resend key is a secret. If it was ever shared in plaintext (chat, ticket),
> rotate it in the Resend dashboard and set the new value here.

## Frontend (Vercel + local `.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | yes | Points the browser at the Convex deployment. |
| `CONVEX_DEPLOYMENT` | dev only | For `npx convex dev`; the Convex CLI writes it into `.env.local`. |

## Email (Resend)

The app sends **transactional email only**: invites (when a coach grants a
swimmer/parent viewer access, or the Admin invites a coach, `convex/emails.ts`
sends a sign-up / open link) and **password-reset codes**
(`convex/passwordReset.ts`, Convex Auth's built-in reset flow: an 8-digit code
that expires in 15 minutes, entered with the new password on `/forgot-password`).
There is no sign-up verification mail. With `RESEND_API_KEY` / `EMAIL_FROM` unset
an invite still works, it just doesn't email — but a password reset **cannot**:
the forgot-password page checks `passwordResetAvailable` and tells the person to
ask their coach or the admin instead of pretending a code was sent.

**Deliverability:** the `EMAIL_FROM` domain must be **verified in Resend** (SPF +
DKIM), or messages will bounce or land in spam.
