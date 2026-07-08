---
target: branch UI changes (checklist, empty states, boundaries, 44px, pagination)
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-07-07T20-21-14Z
slug: components-dashboard-squadoverview-tsx
---
# Critique — branch UI changes (first-run checklist, guided empty states, error boundaries, 44px sweep, pagination footers)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | n/a — skeletons, aria-busy dimming, pending spinners, count footers |
| 2 | Match System / Real World | 4 | n/a — domain-true, unshowy copy throughout |
| 3 | User Control and Freedom | 3 | confirm-only pattern; no undo for the just-typed /log entry |
| 4 | Consistency and Standards | 3 | StandardsMissing CTA hand-rolls the primary button; done checklist rows keep link affordance |
| 5 | Error Prevention | 4 | n/a — named-swim confirm, honest caps, setup-gap state |
| 6 | Recognition Rather Than Recall | 4 | n/a — setup order made visible; icon+text everywhere |
| 7 | Flexibility and Efficiency | 3 | audit logs: Load-older only, no server-side date filter |
| 8 | Aesthetic and Minimalist Design | 4 | n/a — calm cards, dashed quiet states, logbook voice holds |
| 9 | Error Recovery | 3 | global-error button lacks hover/focus-visible states |
| 10 | Help and Documentation | 3 | guided states are the help; viewer StandardsMissing copy stops short of a next step |
| **Total** | | **35/40** | **Good (top of band)** |

## Anti-Patterns Verdict
LLM assessment: no slop tells — token discipline airtight, copy specific and unshowy, no gradient/glass/hero-metric reflexes.
Deterministic scan: detect.mjs over all 21 changed files returned zero findings (exit 0). No false positives to reconcile; scan and review agree.
Browser overlays: not available — the app needs a Convex deployment to run, so no dev server; fallback signal = source-level review + CLI detector only.

## Priority Issues
1. [P2] Done checklist rows stay fully tappable links (squadOverview.tsx FirstRunChecklist) — most likely mis-tap on a phone navigates the coach away from remaining steps. Fix: render done rows as plain rows (no link/hover).
2. [P2] StandardsMissing CTA re-implements the primary button as a Link className (StandardsMissing.tsx) — drift risk vs Button (already missing active:scale). Fix: shared link-button classes.
3. [P2] global-error.tsx button has no hover/focus-visible state — keyboard users at the worst moment get the weakest affordance. Fix: small <style> block with hover bg + focus ring.
4. [P3] /log delete confirm vs undo toast — confirm is consistent, but this is the one delete where data was typed seconds ago; an undo toast would be faster and as safe. Considered alternative, not a defect.
5. [P3] Audit footer reads "300 of 300 entries loaded" when unfiltered mid-pagination — the twin numbers look like a bug. Collapse to "300 entries loaded" when no filters are active.

## Persona Red Flags
Casey (mobile viewer): 44px sweep makes toggles one-hand tappable ✓; StandardsMissing explains instead of dead CTA ✓; chart name truncation ("Emma-Louis…") has the full name only in the table a scroll away; viewer StandardsMissing copy lacks an "ask your coach" action.
Alex (power coach): lg+ density fully preserved ✓; /log delete now costs a confirm round-trip in a bulk-fix flow; audit filtering beyond 300 rows means repeated Load-older clicks (server-side date filter is the eventual fix).

## Minor Observations
- loading.tsx block heights could match the dashboard's real anatomy to reduce skeleton jump.
- StandardsMissing (ListChecks) vs matrix EmptyState (Grid3x3): two icons for adjacent empty states; harmless.
- 639px chart seam + 1024px control seam gives touch tablets desktop charts with 44px controls — right combination.
- "Your data is safe" is actually guaranteed by Convex mutation atomicity — copy is fine.

## Questions to Consider
1. Could a collapsed "setup complete" affordance carry the coach to the next unconfigured thing (squads, viewer invites) instead of the checklist vanishing forever?
2. What does a viewer see the day their swimmer ages up and every cut shifts — is there a moment where the numbers change silently and nobody names why?
