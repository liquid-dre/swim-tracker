---
target: viewer Rankings screen
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-03T18-41-57Z
slug: components-me-viewerrankingsscreen-tsx
---
# Critique — Viewer Rankings screen (components/me/ViewerRankingsScreen.tsx)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton load, breadcrumb + active nav, filter-count badge, personal standing callout |
| 2 | Match System / Real World | 4 | Swim-native language (meet time, tiers, "off the lead") |
| 3 | User Control and Freedom | 3 | Clear-all on filters; no per-filter reset (fine for read-only) |
| 4 | Consistency and Standards | 4 | Reuses coach ComparisonBarChart + DESIGN.md tokens verbatim |
| 5 | Error Prevention | 4 | Course-required guard; stale age/gender filters self-heal |
| 6 | Recognition Rather Than Recall | 4 | Visible labeled filters, "You" badge, standing callout |
| 7 | Flexibility and Efficiency | 3 | No column sort (coach screen has it) or keyboard accelerators |
| 8 | Aesthetic and Minimalist Design | 4 | One hero chart + table; callout earns its place |
| 9 | Error Recovery | 3 | Empty states guide ("widen filters"); no error surface (read-only) |
| 10 | Help and Documentation | 3 | Inline hints ("Pick a gender to draw the cut lines"); no dedicated help |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict
- LLM assessment: not AI slop. It reuses proven, category-familiar patterns (Linear/Stripe-grade leaderboard), disappears into the task. No hero-metric template, no card-in-card, no eyebrows, semantic-only color.
- Deterministic scan: detect.mjs returned [] (clean) on the component.

## What's Working
1. The personal "where you stand" callout + "You" row highlight turn a generic leaderboard into a direct answer to the user's real question. Emotional peak in the right place.
2. Total consistency: it is the coach comparison, re-dressed in viewer chrome, so it inherits a screen already past the gate and adds zero new component vocabulary.
3. Honest privacy posture: public payload only (no DOB/notes), names are plain text since a viewer has no swimmer-profile route to link into.

## Priority Issues
- [P2] No way to open another swimmer's progression from a name. The browse-any-swimmer progression is the planned next slice; until then names are dead text. Fix: link names to a viewer progression once that route lands.
- [P3] StandingCallout connective words use text-ink-muted on bg-brand-50 (borderline ~4.5:1). Fix: bump to text-ink if a contrast check flags it.
- [P3] Fixed sort only. A viewer may want to sort by age/name like the coach screen. Fix: add the shared SortHeader if requested.

## Minor Observations
- Em dash in the description copy was removed (hard ban) during this pass.
- Age filter defaults to "All ages"; could default to the selected swimmer's age band for an instant peer view (deferred, debatable).

## Questions to Consider
- Should tapping a name jump to that swimmer's progression (once browse-any lands)?
- Is a fixed fastest-first order right for viewers, or do they want the coach's sortable columns?
