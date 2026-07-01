---
target: /me
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T20-30-00Z
slug: components-me-viewerhomescreen-tsx
---
# Critique — /me (Viewer home)

Target: components/me/ViewerHomeScreen.tsx
Assessment independence: degraded (spawn_agent not exercised; ran sequentially)
Deterministic scan: detect.mjs → 0 findings (clean)
Browser overlay: unavailable (no browser automation / no Convex data in this environment)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons per section, "Read-only" chip, "Higher = faster", reactive live data |
| 2 | Match System / Real World | 4 | Plain viewer copy ("Your personal bests", "cut"), m:ss:hh tabular times |
| 3 | User Control and Freedom | 3 | Swimmer switch + tier toggle + event picker; read-only by design (correct) |
| 4 | Consistency and Standards | 4 | Reuses PbBoard / ImprovementSummary / RoadResults / ProgressionChart + tokens |
| 5 | Error Prevention | 4 | No write surface for a viewer; server-scoped reads; graceful empties |
| 6 | Recognition Rather Than Recall | 4 | Everything visible; switch names + age; event narrows from the whitelist |
| 7 | Flexibility and Efficiency | 3 | Tier persists across visits; no accelerators (consistent with the app) |
| 8 | Aesthetic and Minimalist | 4 | Calm, one accent, no coach chrome, no card-in-card, generous rhythm |
| 9 | Error Recovery | 3 | Empty states explain the fix ("ask your coach to link"); server msgs surface |
| 10 | Help and Documentation | 3 | Section hints teach each view; read-only chip sets the mode |
| **Total** | | **36/40** | **Good — ship (≥ 35 gate met)** |

## Anti-Patterns Verdict
LLM: Not AI slop. The swimmer's name is the page hero (no generic title competing
above it), sections are flat with hairline dividers, times are tabular, and there
is exactly one brand accent. No hero-metric tiles, no eyebrow-on-every-section, no
icon-tile-above-heading, no gradient, no glassmorphism, no card-in-card.
Deterministic scan: 0 findings.

## What's Working
- Read-only is stated, not implied: a quiet "Read-only" chip in the header and no
  edit/delete/log affordances anywhere — no coach chrome bleeds through.
- The order tells the viewer's story: identity → PBs → progression (with their own
  qualifying lines) → road-to-qualify → history. "Where am I, how close am I?"
- Every section is its own authorised read with its own skeleton and empty state,
  so a slow or empty slice never blocks the rest of the page.
- Self-healing selection: if a coach revokes a link mid-session, the switch falls
  back to the first remaining swimmer instead of erroring.

## Issues Fixed This Pass
- P1 Hierarchy inversion — the swimmer-name h2 (text-2xl) was larger than the page
  h1 (text-xl). Resolved by promoting the swimmer's name to the PageHeader title
  (single-swimmer) and dropping the duplicate heading.
- P1 Orphaned affordance — the progression "Project time to qualify" box described
  a control that lived in a different section. Removed for the viewer; progression
  now shows times + their own cut lines, focused and honest.
- P2 Incomplete ARIA — the swimmer switch used role="tab" without tabpanels;
  changed to an aria-pressed button group labelled "Choose a swimmer".

## Notes / Backlog
- Multi-swimmer switch is pill buttons; fine for a parent with 2–3 children. If a
  viewer is ever linked to many swimmers, revisit as a select.
- Projection overlay is intentionally coach-only; viewers get cut lines, not the
  caveated forecast — keeps the read calm and avoids over-promising.
