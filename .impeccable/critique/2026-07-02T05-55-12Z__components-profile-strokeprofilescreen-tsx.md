---
target: Stroke profile chart page (R2)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T05-55-12Z
slug: components-profile-strokeprofilescreen-tsx
---
## Design Health Score — Stroke profile (chart page, R2)

Anchor: **the radial stroke-profile wheel**. Filters collapsed into one slim toolbar (primary inline: swimmer(s) picker, inline) with secondary filters (coverage toggle (kept inline, trailing)) behind a compact Filters popover carrying an active-count badge. The tall filter card that used to push the chart down is gone.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons on load; the Filters button's count badge surfaces how many secondary filters are active without opening it |
| 2 | Match System / Real World | 4 | Domain language throughout (course, tier, meet-only) |
| 3 | User Control and Freedom | 3 | Popover is Esc-dismissable; "Clear all" resets secondary filters where present |
| 4 | Consistency and Standards | 4 | Shared FilterBar + Select + Popover make every chart page's toolbar identical — the R2 win |
| 5 | Error Prevention | 4 | Event picker narrows to the whitelist; course required; nothing off-whitelist reachable |
| 6 | Recognition Rather Than Recall | 4 | Primary selectors inline and visible; active secondary filters are counted on the button, not hidden |
| 7 | Flexibility and Efficiency | 3 | Fast toolbar; no keyboard accelerators beyond native tab/enter |
| 8 | Aesthetic and Minimalist Design | 4 | Chart is the unambiguous, centred anchor above the fold; the toolbar is one slim row |
| 9 | Error Recovery | 3 | Clear empty/skeleton states; server errors surface inline |
| 10 | Help and Documentation | 3 | Contextual chart captions + legends; no separate docs (not needed) |
| **Total** | | **36/40** | **Good — chart-first, ship it** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI-generated. The page now leads with its chart in one clean card; the controls read as a professional data-tool toolbar, not a form wall. No card-in-card, no gradient text, no eyebrow kickers, no hero-metric tile.

**Deterministic scan**: `detect.mjs` over this screen + the shared FilterBar/Select/Popover/EventFilter → exit 0, **0 findings**.

**Visual overlays**: Browser inspection unavailable — the page needs the Convex backend + auth to render, so no localhost URL to inject into. Fallback: static source + detector review.

## What's Working

1. **The chart is the hero.** Removing the tall filter card and collapsing controls into one slim toolbar puts the radial stroke-profile wheel at the top of the page, centred and dominant above the fold.
2. **Cross-page consistency.** Every chart page now shares one FilterBar (primary inline + Filters popover + count badge) and one Select, so the whole analysis section reads as a single, coherent tool.
3. **Hidden filters stay discoverable.** Secondary filters live in the popover but their active count shows on the button, so nothing silently narrows the data.

## Priority Issues

- **[P2] Popover filters are one tap away.** Moving secondary filters behind the Filters button trades a tap for a calmer page. The count badge mitigates discoverability, but a first-timer may not realise age/gender/squad live there. **Fix**: the badge + label already signal it; monitor and revisit only if users miss it. **Command**: `$impeccable audit`.
- **[P3] Toolbar height mixes h-9 selects with the segmented toggle (~h-8).** Centred alignment handles it, but the 4px delta is visible on close inspection. **Command**: `$impeccable polish`.

## Persona Red Flags

**Alex (Power User)**: Inline primary selectors mean the core selection is one glance, no drilling. Native selects are keyboard-operable; the popover opens on Enter/Space.

**Sam (Accessibility)**: Filters button carries an aria-label with the active count; popover traps focus and restores it on close; every control keeps its label. No red flags of note.

**Casey (Mobile)**: The toolbar wraps to multiple rows on narrow screens and the chart still leads underneath; touch targets are ≥ h-9.

## Questions to Consider

- Should the most-used secondary filter (often gender) stay inline on wide screens and only collapse into the popover on mobile?
- Is a one-tap popover the right home for the season window, or should it read as a distinct "settings" affordance?
