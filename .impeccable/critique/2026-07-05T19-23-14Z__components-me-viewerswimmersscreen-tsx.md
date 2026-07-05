---
target: viewer My swimmers + read-only profile
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-05T19-23-14Z
slug: components-me-viewerswimmersscreen-tsx
---
## Design Health Score — viewer My swimmers + read-only profile

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Breadcrumb, read-only chip, active/inactive dots, skeleton, empty state |
| 2 | Match System / Real World | 4 | "My swimmers", "Find a swimmer", plain domain language |
| 3 | User Control and Freedom | 3 | Breadcrumb back + request-access flow; read-only, nothing destructive |
| 4 | Consistency and Standards | 4 | Same table markup/tokens as the coach roster; coach screens reused for analysis |
| 5 | Error Prevention | 4 | Read-only by construction; swimmer scope enforced server-side |
| 6 | Recognition Rather Than Recall | 4 | Nav mirrors the coach IA; the list is visible, each row links out |
| 7 | Flexibility and Efficiency | 3 | Coach-style in-toolbar pickers; no list search (viewers have few swimmers) |
| 8 | Aesthetic and Minimalist Design | 4 | Unshowy read-only table, one brand accent |
| 9 | Error Recovery | 3 | notify surfaces request-access errors |
| 10 | Help and Documentation | 3 | Section hints + an empty state that teaches the request-access flow |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict
LLM: No AI-slop tells. Read-only mirror of the coach roster on the same tokens; no card-in-card, no gradient, no decorative motion. Fits the "well-kept logbook" personality.
Deterministic scan: `detect.mjs` — 0 findings across ViewerSwimmersScreen, SwimmerProfileScreen, StatusMatrixScreen, CompareScreen, ProgressionScreen.

## What's Working
- Viewers get the exact coach screens (reused components), so the two experiences can't visually drift.
- The whole surface is scoped server-side (accessibleSwimmerIds / requireSwimmerAccess): a viewer physically cannot read a swimmer they aren't linked to — the imperative requirement.
- Removing the global "Viewing:" switcher in favour of each screen's own swimmer picker fixes the reported scroll-to-top confusion, and every chart now names its swimmer in its own toolbar.

## Priority Issues
- **[P2] Single-swimmer degeneracy**: Comparison / Status / Season for a one-child parent show a single row/bar. Intended (per product decision "always show, scoped"), but worth an eventual empty-ish hint. Command: `$impeccable clarify`.
- **[P3] Sparse "Swimmer" group**: a nav group with one item (My swimmers) reads thin; acceptable as it mirrors the requested IA and leaves room to grow. Command: `$impeccable layout`.

## Persona Red Flags
**Casey (mobile)**: Responsive table (gender hidden < sm); Find button and rows are tap-sized. Passes.
**Sam (accessibility)**: `scope` on table headers, focusable links with visible focus ring, status not colour-only (dot + label). Passes.

## Minor Observations
- Old /me, /me/progress, /me/history redirect into the new IA so bookmarks survive.
- Read-only chip + no edit affordances keep the read-only contract visible, not just enforced.
