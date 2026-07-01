---
target: Step 7 analysis charts (compare + progression)
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T15-25-25Z
slug: components-analysis-step7-charts
---
# Critique — Step 7 analysis charts (Comparison + Progression)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons, empty states, live filter counts, hover tooltips all present |
| 2 | Match System / Real World | 4 | Plain domain copy ("Best time", "Shorter bar = faster", "Higher = faster") |
| 3 | User Control and Freedom | 3 | Filters + group "Clear" present; no single "reset event" affordance |
| 4 | Consistency and Standards | 4 | Reuses Segmented, chips, table + card conventions, DESIGN.md tokens |
| 5 | Error Prevention | 4 | Course mandatory (read held until complete); whitelist-derived pickers; selection cap |
| 6 | Recognition Rather Than Recall | 4 | Legends decode dot styles; bars labelled; no hidden state |
| 7 | Flexibility and Efficiency | 3 | Sortable columns + squad quick-add + multi-select, but no keyboard shortcuts |
| 8 | Aesthetic and Minimalist | 3 | Clean, single accent, neutral grid; group picker is dense; bar 0-baseline flattens small gaps |
| 9 | Error Recovery | 3 | Empty states guide next action; read-only so few hard error paths |
| 10 | Help and Documentation | 3 | Inline hints + captions + legends; no searchable docs |
| **Total** | | **35/40** | **Good** |

## Anti-Patterns Verdict

**LLM assessment:** Does not read as AI slop. No hero-metric tiles, no identical card grids, no gradient text, no eyebrow scaffolding. One deep-teal/indigo accent over neutral gridlines; tabular figures on every time. Charts are subordinate to the data (leaderboard + series), matching the "well-kept logbook" brand.

**Deterministic scan:** `detect.mjs --json components/compare components/progression components/analysis` → `[]` (exit 0, clean). No side-stripes, over-rounding, ghost-card border+shadow pairs, or stripe backgrounds.

**Visual overlays:** Not available. The app requires an authenticated Convex backend with seeded results to render these screens; no dev-server visualization was possible in this environment. Fallback signal: source-level review + CLI detector only.

## Overall Impression

Two restrained, on-system analytical views. The strongest moves: course is a hard gate (the read is skipped until distance+stroke+course are all set, so an invalid SCM-vs-LCM comparison can't be built), and the inverted progression y-axis is explicitly labelled ("Higher = faster") rather than left to trip up a first-time reader. Biggest remaining opportunity: the comparison bar chart adds limited discrimination over its own leaderboard because of the honest 0-baseline.

## What's Working

1. **Correct-by-construction event picking.** `EventPicker` derives distances → strokes → courses from the whitelist and auto-selects a forced course (100 IM ⇒ SCM). The consuming screens hold their Convex read on `"skip"` until the selection is complete — error prevention baked into data flow, not just UI.
2. **The charts stay subordinate.** Single brand accent + neutral 3px-dashed grid, tabular time ticks, load-only animation that respects `prefers-reduced-motion` via a `useSyncExternalStore` hook. No decorative motion.
3. **Meet/PB legibility.** Progression distinguishes meet (filled), trial/practice (hollow), and PB (ringed) dots, with a legend that names each — meaning is never colour-only.

## Priority Issues

- **[P2] Bar chart 0-baseline flattens small gaps.** With a 0 origin, a 28.4s bar and a 31.0s bar look nearly identical, which is the exact comparison the chart exists to make. *Why it matters:* the visual under-sells real differences. *Fix (chosen):* keep the honest 0-baseline but carry precision in the leaderboard "Gap" column (+x.xxs vs the leader) and per-bar time labels, plus a "Shorter bar = faster" caption. Truncating the axis would mislead more than it helps.
- **[P2] Group picker density.** Search + squad filter + "Add squad" + capped checkbox list is a lot at once. *Why it matters:* first-timers may not see they can both filter and add a whole squad. *Fix:* inline hints and a live "N of 12 selected · limit reached" line already scaffold it; kept as-is since the complexity is intrinsic to building an ad-hoc group.
- **[P3] Chart accessibility.** Pure SVG is invisible to screen readers. *Fix (applied):* comparison chart is `aria-hidden` (the leaderboard table is the canonical data); progression chart is `role="img"` with a generated per-swimmer summary (swims, meets, PB).
- **[P3] Duplicate swimmer names** would collide on the bar chart's category axis. Edge case at club scale; left for later.

## Persona Red Flags

**Alex (power user, data-heavy):** No keyboard shortcuts for sort/filter; must mouse to sortable headers. Squad quick-add and multi-select mitigate the bulk case.

**Sam (accessibility):** Charts were SVG-only (fixed: table fallback + `role="img"` summary). Tier/status meaning is never colour-only. Focus rings on all controls via tokens.

**Jordan (first-timer):** Inverted y-axis is the one conceptual hurdle; the "Higher = faster" caption + legend address it. Empty states teach the next action ("Log a meet swim, or widen the filters").

## Minor Observations

- Rank number shows only under time-ascending sort (otherwise "·"), which is correct but subtle.
- Consider a y-axis title on progression for redundancy with the caption.

## Questions to Consider

- Should the comparison bar chart colour bars by "highest tier met" now, or wait for the Step 10 standards overlay (current choice: wait — no tiers before standards exist)?
- For very large squads, is 12 the right legibility cap, or should it scale with a small-multiples fallback?
