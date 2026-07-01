---
target: /season
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T19-42-04Z
slug: components-season-seasonscreen-tsx
---
# Critique — /season (Season improvement ranking)

Target: components/season/SeasonScreen.tsx
Assessment independence: degraded (spawn_agent not exercised; ran sequentially)
Deterministic scan: detect.mjs → 0 findings (clean)
Browser overlay: unavailable (no browser automation in this environment)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton, notify.promise on save, summary shows effective window + source |
| 2 | Match System / Real World | 4 | Plain domain copy; m:ss:hh times; "insufficient data" is honest |
| 3 | User Control and Freedom | 3 | Mode toggle, reset-to-rolling, editable date; no explicit cancel (auto-resyncs) |
| 4 | Consistency and Standards | 4 | Reuses PageHeader/Segmented/EventPicker/Button; bars match Road pattern |
| 5 | Error Prevention | 4 | date max=today + inline invalid + disabled Save + server validation |
| 6 | Recognition Rather Than Recall | 4 | Age now shown per row; best event carries course; all options visible |
| 7 | Flexibility and Efficiency | 3 | Read screen; no keyboard accelerators (consistent with app) |
| 8 | Aesthetic and Minimalist | 4 | One brand accent, no card-in-card, tabular figures, uncluttered |
| 9 | Error Recovery | 3 | notify surfaces server message; inline date error |
| 10 | Help and Documentation | 4 | Header + editor + insufficient-group copy teach the metric in context |
| **Total** | | **37/40** | **Good — ship** |

## Anti-Patterns Verdict
LLM: Not AI slop. Ranking is the anchor (ordered list + one accent), tabular
deltas, no hero-metric tile, no eyebrow-on-every-section, no card-in-card.
Deterministic scan: 0 findings.

## What's Working
- The ranking reads as a ranking: numbered rows, one brand bar, drop % + seconds.
- Insufficient-data swimmers are separated and explained (never shown as 0%).
- Season-start editor is a real control: constrained date, dirty-gated Save,
  revert-to-rolling, source label — the window is legible and reversible.

## Priority Issues (addressed this pass)
- [P2] Overall best-event label dropped course (SCM/LCM ambiguity, §4.2) — FIXED.
- [P3] Rows omitted swimmer age (recognition vs sibling screens) — FIXED.

## Minor Observations
- Bars hidden < sm; order + % still carry the ranking on mobile.
- "−x.x%" uses a minus to mean "time dropped"; summary caption disambiguates.

## Questions to Consider
- Should overall mode also expose total seconds dropped across events?
- Is a fixed-season default (vs rolling) wanted once a season is configured club-wide?
