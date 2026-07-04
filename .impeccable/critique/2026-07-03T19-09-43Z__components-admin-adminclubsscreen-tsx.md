---
target: clubs & coaches admin
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-03T19-09-43Z
slug: components-admin-adminclubsscreen-tsx
---
# Critique — Clubs & coaches admin (components/admin/AdminClubsScreen.tsx)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons, toasts, breadcrumb, live coach/swimmer counts, each coach's current club |
| 2 | Match System / Real World | 4 | Plain domain nouns: Clubs, Coaches, Assign coach |
| 3 | User Control and Freedom | 3 | Rename reverts on blur/Escape; remove is reversible via re-assign; no undo toast |
| 4 | Consistency and Standards | 4 | Shared Input / Select / Button / PageHeader + tokens throughout |
| 5 | Error Prevention | 4 | Disabled submits, "create a club first", server guards (account must exist, no self-demote, end≥start) |
| 6 | Recognition Rather Than Recall | 4 | Visible labels, current assignments, "No club" flag |
| 7 | Flexibility and Efficiency | 3 | Inline rename accelerator; no bulk assign / keyboard shortcuts |
| 8 | Aesthetic and Minimalist Design | 4 | Two clean form+table sections, no clutter |
| 9 | Error Recovery | 3 | Server messages surface via notify (e.g. "ask them to sign up first") |
| 10 | Help and Documentation | 3 | Section hints explain the club/coach model inline |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict
- LLM assessment: not AI slop. Standard admin CRUD in the project's own vocabulary; no hero-metric tiles, no card-in-card, semantic-only color, no eyebrows.
- Deterministic scan: detect.mjs returned [] (clean).

## What's Working
1. The two-section shape (create club → assign coach) mirrors the actual setup order, and each coach row shows its club so mis-assignment is visible at a glance.
2. Error prevention is layered: the client disables impossible actions ("create a club first" when none exist) and the server returns human guidance ("ask them to sign up first").
3. Inline club rename (commit on blur, Escape to cancel) is a quiet accelerator that avoids a modal.

## Priority Issues
- [P2] Removing a coach has no confirm step. It's reversible (re-assign), but a stray click silently demotes someone. Fix: a ConfirmDialog, or an undo affordance in the toast.
- [P3] No bulk assignment — onboarding five clubs is five separate submits. Fine for the stated scale.
- [P3] Rename has no explicit save affordance; a user unsure of blur-to-save might hesitate. The hint could say "Enter to save".

## Minor Observations
- Coach list shows email under the name; on mobile the club also collapses under it — good density degradation.
- No em dashes; semicolons used in the shared-across-clubs copy.

## Questions to Consider
- Should removing a coach confirm, given it changes an account's role?
- Is a super-user ever assigned to a club, or always cross-club (current: rejected on assign)?
