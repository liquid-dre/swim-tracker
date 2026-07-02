---
target: Mobile pass at ~375px, key screens (R13)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T12-12-06Z
slug: mobile-375px-key-screens
---
# Critique — Mobile pass at ~375px, key screens (STEP R13)

**Target:** the app at ~375px — shell, chart pages, and the hard cases (status matrix, wide tables, stroke wheel, qualifying/comparison/progression bars). Verified live in a 375px headless viewport.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | The mobile drawer trigger is now a clear 40px control; active nav, selected rows, and in-bar PBs all read at phone width. |
| 2 | Match System / Real World | 4 | Same vocabulary as desktop; nothing is a degraded "mobile-lite" variant. |
| 3 | User Control and Freedom | 4 | Every hover action has a tap path: the collapsed-rail flyout now opens on tap, drawer closes on scrim, wheel tooltip on focus/tap. |
| 4 | Consistency and Standards | 4 | One responsive system — column-hiding tables, a sticky-column matrix, `ResponsiveContainer` charts, flex-wrap toolbars — applied everywhere. |
| 5 | Error Prevention | 3 | Larger tap targets (drawer 40px, segments 32px, primary CTAs 44px) reduce mis-taps in dense toolbars. |
| 6 | Recognition Rather Than Recall | 4 | The status matrix freezes the swimmer column while events scroll, so a cell is never read out of context on a narrow screen. |
| 7 | Flexibility and Efficiency | 4 | Filters condense into the slim toolbar + Filters popover; charts stay the hero above the fold. |
| 8 | Aesthetic and Minimalist Design | 4 | No whole-page side-scroll (measured `scrollWidth == clientWidth == 375`); charts centred; bars full width with legible labels. |
| 9 | Error Recovery | 3 | n/a for layout; states/empties already handled per screen. |
| 10 | Help and Documentation | 3 | Legends and hints stay reachable below each chart at phone width. |
| **Total** | | **37/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop, and genuinely mobile-clean rather than merely "not broken". The one real defect surfaced by rendering at 375px — the R8 All-tier bars truncating the in-bar time ("1:0…") because a 30% fill is only ~35px on a phone — is fixed at the root: the inside/outside choice is now made in measured PIXELS, so wide fills keep the time inside and narrow fills drop it just past the fill in ink over the light zone. No truncation, on phone or desktop.

**Deterministic scan:** `detect.mjs --json` over the changed files returned `[]` (exit 0).

**Browser evidence (375px):**
- **No page-level horizontal overflow** — measured `document.scrollWidth === clientWidth === 375` on the harness rendering road bars, All-tier bars, the stroke wheel, the roster table and a status-matrix table together.
- **Status matrix**: swimmer column frozen (`sticky left-0`) while events scroll horizontally — the recommended treatment, not a crushed grid.
- **Roster table**: gender/squads columns hide below `sm`; swimmer / age / status / actions fit cleanly.
- **Stroke wheel**: fits at 300px with legible stroke arcs and ring labels (R9).
- **Qualifying bars**: single-tier times inside white fills; All-tier times inside the wide gold/blue fills and just-outside (ink) for the narrow ones — every one legible.

## Overall Impression

The app was already responsive in its bones (column-hiding, sticky columns, `overflow-x-auto`, `ResponsiveContainer`, the R9 wheel stacking). This pass closed the gaps that only show up at 375px: the in-bar time truncation, a too-small drawer trigger, hover-only rail flyouts, and cramped toggle tap-targets. The result reads as one design at phone width, not a shrunk desktop.

## What's Working

- **Pixel-accurate bar labels.** Measuring the real track width (not a percentage guess) is what keeps the R8 PB legible on a ~110px phone bar and a ~400px desktop bar alike.
- **Real hard-case treatments.** The status matrix and the standards/history tables scroll with a frozen or hidden-column strategy; the roster drops non-essential columns; none becomes an unreadable squash.
- **Touch parity.** The mobile nav trigger is 40px, segmented toggles 32px (aligned to the h-9 toolbar), and the collapsed-rail flyout opens on tap — no desktop-only interactions left.

## Priority Issues

- **[P3] Segmented toggles are 32px tall, under the 44px ideal.** A deliberate density trade-off for the coach's dense toolbars (they now align with the h-9 selects and are wide per segment, so the tap strip is comfortable), but not the full 44px HIG target.
  - *Fix:* If poolside mis-taps show up, bump to h-9 or add a mobile-only height.
  - *Suggested command:* `$impeccable adapt`

## Persona Red Flags

**Casey (Mobile):** One-handed use holds up — no side-scroll, the drawer trigger is thumb-sized, charts and bars are full width and legible, and every toggle is tappable. The status matrix scrolls horizontally with the name pinned, which is the expected phone gesture.

**Sam (Accessibility):** Larger targets help low-vision/motor users; the in-bar time stays `aria-hidden` with the PB mirrored in `sr-only` text, and tap equivalents mean nothing is hover-gated.

## Minor Observations

- Narrowing the bar side-columns to `w-20` on mobile (widening the track) plus the pixel-aware label is what makes the All-tier bars breathe at 375px; desktop keeps `sm:w-28`.
- `next build` prerenders all 22 routes without hydration errors, so the responsive changes don't destabilise SSR.

## Questions to Consider

- Should the status matrix offer an optional per-swimmer card view on very small phones, or is the sticky-column scroll enough? (It tested fine, but cards could suit one-handed skimming.)
