---
target: coach swimmer profile Times/Access tabs
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-05T18-45-18Z
slug: components-swimmers-swimmerprofilescreen-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Active tab (ink + brand underline), pending-request count pill, breadcrumbs, skeletons, notify feedback |
| 2 | Match System / Real World | 4 | "Times" / "Access" plain, domain-correct labels |
| 3 | User Control and Freedom | 3 | Tab state not URL-encoded; refresh/deep-link resets to Times |
| 4 | Consistency and Standards | 4 | Proper ARIA tablist; reuses tokens + brand accent; distinct from Segmented (radiogroup) by correct semantics |
| 5 | Error Prevention | 4 | ConfirmDialog on remove/delete, disabled submit when empty |
| 6 | Recognition Rather Than Recall | 4 | Labeled tabs, visible options, count badge |
| 7 | Flexibility and Efficiency | 3 | Arrow/Home/End keyboard nav, Log-a-time shortcut; no tab deep-link |
| 8 | Aesthetic and Minimalist Design | 4 | Split ends the long single-scroll; each tab one focus; unshowy underline |
| 9 | Error Recovery | 3 | notify.error surfaces server messages; little screen-specific error UI |
| 10 | Help and Documentation | 3 | Inline section hints; no contextual help beyond that |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict
LLM: No AI-slop tells. Underline tabs on brand-indigo, tabular-nums count pill, one accent. Fits the "well-kept logbook" personality; no card-in-card, no gradient, no decorative motion.
Deterministic scan: `detect.mjs` — 0 findings (clean) after reworking the active indicator from a `border-b-2` (which co-occurred with `rounded`, tripping `border-accent-on-rounded`) into a dedicated positioned underline element.
Browser overlays: unavailable — authenticated coach screen needs a live Convex backend + seeded data; detector-only, sequential fallback.

## What's Working
- Splitting swim data from access admin matches the two real jobs (read the numbers poolside vs. manage who can view) and kills the long scroll.
- Pending-request count pill keeps the moved-behind-a-tab requests discoverable from the Times tab — the one thing the tab split risked hiding.
- Full WAI-ARIA tablist: roving tabindex, arrow/Home/End, selection-follows-focus, inactive panels unmounted so their queries don't subscribe until opened.

## Priority Issues
- **[P2] Tab is not URL-addressable**: refresh or a shared link always lands on Times; a coach can't bookmark/deep-link Access. Fix: reflect tab in a `?tab=` search param. Command: `$impeccable harden`.
- **[P2] Badge counts requests only**: the Access panel also lists pending invites; the pill intentionally counts only actionable inbound requests. Acceptable, but document the scope. Command: `$impeccable clarify`.
- **[P3] Two-tab bar is sparse**: with only Times/Access, `gap-6` underline tabs read slightly thin. Fine now; revisit if a third section lands. Command: `$impeccable layout`.

## Persona Red Flags
**Alex (Power User)**: Arrow-key tab nav works; no deep-link to Access is the only friction. Low risk.
**Sam (Accessibility)**: tablist/tab/tabpanel wired with aria-selected, aria-controls, aria-labelledby; visible focus ring; active state not color-only (underline + ink weight + selected state). Passes.

## Minor Observations
- Tabpanel carries `tabIndex={0}`; standard, adds one tab stop — acceptable.
- Count pill uses brand (not semantic) — correct, it's an actionable nav accent, consistent with active-nav usage.

## Questions to Consider
- Should the tab live in the URL so a coach can send "look at the Access tab" as a link?
