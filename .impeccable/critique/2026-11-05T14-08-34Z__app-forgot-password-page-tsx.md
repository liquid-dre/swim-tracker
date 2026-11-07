---
target: Forgot password page
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-11-05T14-08-34Z
slug: app-forgot-password-page-tsx
---
# Critique — Forgot password (`app/forgot-password/page.tsx`)

Assessment A scored the first cut **31/40**; Assessment B (detector) found **0** issues. Post-fix:

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Notice is `role="status"`; "a new 8-digit code" after a resend; "Password updated" toast on success. |
| 2 | Match system / real world | 4 | "whoever runs Swim Tracker for your club"; "check which email is on your account". |
| 3 | User control and freedom | 4 | "Send a new code" button; standalone "Use that one" for a different email. |
| 4 | Consistency and standards | 4 | Same primitives and notice box as sign-in / sign-up; footer "Back to sign in". |
| 5 | Error prevention | 4 | Email normalised as stored; code whitespace stripped; placeholder matches the email's "1234 5678". |
| 6 | Recognition rather than recall | 3 | Error names the button that exists ("Send a new code"). |
| 7 | Flexibility and efficiency | 3 | autoFocus, one-time-code autofill, Enter submits. |
| 8 | Aesthetic and minimalist design | 4 | One notice, two fields, two buttons, one help line. |
| 9 | Error recovery | 4 | Wrong/expired code → resend is one tap away; form preserved. |
| 10 | Help and documentation | 3 | Contextual hints; unavailable state explains itself. |
| **Total** | | **37/40** | Passes the gate |

## Fixed from Assessment A
- [P1] No resend action; error pointed at one → "Send a new code" secondary button, copy aligned.
- [P2] Silent step change → `role="status"` notice.
- [P2] Mid-sentence "try that one" → standalone "Use that one" with a 24px+ target and focus ring.
- [P3] Placeholder, loading-not-disabled first paint, footer wording, success toast.

## Still open (P3)
- Auth-page links use the browser's default focus ring (pre-existing on sign-in / sign-up too).
