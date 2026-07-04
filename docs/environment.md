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
| `RESEND_API_KEY` | for email | Resend API key (`re_...`). Unset ⇒ invite emails are silently skipped. |
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

The app sends **transactional invite emails only** (access-control Phase 7): when
a coach grants a swimmer/parent viewer access, `convex/emails.ts` (a scheduled
internal action) sends them a sign-up / open link via Resend. There is no other
outbound mail — no verification or password-reset emails. With `RESEND_API_KEY` /
`EMAIL_FROM` unset the grant still works; it just doesn't email.

**Deliverability:** the `EMAIL_FROM` domain must be **verified in Resend** (SPF +
DKIM), or messages will bounce or land in spam.
