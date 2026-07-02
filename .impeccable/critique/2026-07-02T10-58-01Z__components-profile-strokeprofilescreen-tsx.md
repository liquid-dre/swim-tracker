---
target: Stroke-profile compare view (R9), desktop + ~375px
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T10-58-01Z
slug: components-profile-strokeprofilescreen-tsx
---
# Critique — Stroke-profile compare view (STEP R9)

**Target:** `components/profile/StrokeProfileScreen.tsx` (+ `StrokeWheel`, unchanged calibration)
**Scope:** Up to four swimmers; count-driven layout (1 centred / 2 side-by-side / 3–4 as 2×2); mobile single-column stack; per-cell wheel sizing so nothing is squashed. Reviewed at desktop and ~375px.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Per-panel skeletons while each swimmer's read resolves; every wheel keeps its name + age. |
| 2 | Match System / Real World | 4 | Swimmer names, ages, stroke legend, "outward = faster" — the coach's own mental model. |
| 3 | User Control and Freedom | 4 | Add / remove swimmers freely; remove is disabled at the last one so you can't empty the view. |
| 4 | Consistency and Standards | 4 | Uniform cards; one shared calibrated ring scale + one legend across every wheel, so bars compare directly. |
| 5 | Error Prevention | 4 | Max four enforced in `addSwimmer` and the picker; selection self-heals if a swimmer disappears. |
| 6 | Recognition Rather Than Recall | 4 | Legend names the rings/strokes; each wheel is labelled; hover/focus reveals PB + every cut. |
| 7 | Flexibility and Efficiency | 3 | Quick chip add/remove + coverage toggle; no keyboard multi-select, which is fine at this scale. |
| 8 | Aesthetic and Minimalist Design | 4 | The squash is gone — 2×2 never crushes wheels into thirds, and each scales to its own cell. |
| 9 | Error Recovery | 3 | Per-panel "Swimmer unavailable" and "Nothing to plot yet" states; no destructive paths to recover from. |
| 10 | Help and Documentation | 3 | Legend + the "hover a bar" hint carry it; no separate docs, and none needed here. |
| **Total** | | **37/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop. The layout is count-aware rather than a single reflexive `auto-fit` grid: one wheel centres, two sit as a true 1×2 row, three or four fill a 2×2 (three leaving a clean empty cell). That intentionality — plus a genuinely shared calibrated scale so the wheels are comparable — is the opposite of the generic "N identical cards in a fluid grid" tell.

**Deterministic scan:** `detect.mjs --json` over the screen and the wheel returned `[]` (exit 0). No side-stripe borders, no ghost-card border+shadow, no over-rounding, no gradient text.

**Visual overlays:** Unavailable — dependencies aren't installed and no dev server runs in this environment, so browser injection was skipped. The responsive verdict below is read from the layout classes and the per-cell measurement logic rather than a live render.

## Overall Impression

The core problem — wheels squashed into a 3-up row — is solved at the layout level, not by shrinking type. `grid-cols-1 sm:grid-cols-2` gives exactly the three required shapes from one rule, and each wheel now measures its own 1fr cell (feedback-safe, unlike measuring a content-sized card) and fits the SVG to it. So a 2×2 cell on desktop and a full-width mobile row both get an un-squashed, legible wheel.

## What's Working

- **One rule, three correct shapes.** `sm:grid-cols-2` yields 1×2 for two swimmers and 2×2 for three or four; below `sm` it collapses to a single stacked column. No per-count branching to drift out of sync.
- **Per-cell sizing is feedback-safe.** Single wheel measures the stable full-width row; compare wheels measure their own grid cells (`min-w-0` so the cell stays 1fr). That sidesteps the wheel→card→wheel shrink loop the code comments explicitly warn about.
- **Comparability preserved.** All wheels share the ring-calibrated L2/L3/SANJ scale and, within a uniform grid, the same measured size — so distributions read against each other, which is the whole point of compare.

## Priority Issues

- **[P3] Brief first-paint overshoot on narrow cells.** Compare wheels initialise at a 320px fallback before the ResizeObserver clamps them to a ~303px mobile cell — a ~17px transient overflow for one frame. Matches the existing "render then clamp" pattern and self-corrects immediately; only worth tightening if it reads as a flicker on real devices.
  - *Fix:* Lower the `useContainerWidth` fallback for the compare panels, or gate the first paint on measurement.
  - *Suggested command:* `$impeccable adapt`

## Persona Red Flags

**Casey (Mobile):** At ~375px every layout stacks to one wheel per row, each sized to the full-width cell and still carrying its label; the picker chips + "Add a swimmer" select wrap within the toolbar and stay tappable; the legend sits below, reachable. No horizontal scroll, no squash.

**Alex (Power User):** Four-way compare on one shared scale is the density this persona wants; add/remove is a single interaction each. The only ceiling is no keyboard-driven multi-add, acceptable for a four-item cap.

## Minor Observations

- Viewer path is genuinely untouched: viewers never reach `isCompare`, so they still get one centred wheel with no compare affordance.
- The picker's max-state copy ("Comparing 4 (the maximum)") reads from `MAX_COMPARE`, so it tracked the 3→4 bump automatically.

## Questions to Consider

- On a wide desktop, should four wheels ever go 1×4 to exploit horizontal space, or is 2×2 the deliberate ceiling for wheel legibility? (Current answer — 2×2 — keeps each wheel large; worth confirming that's intended.)
