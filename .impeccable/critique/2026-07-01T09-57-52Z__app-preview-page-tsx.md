---
target: design-system preview (/preview)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T09-57-52Z
slug: app-preview-page-tsx
---
# Critique — Swim Tracker design-system preview (`/preview`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading button (aria-busy), skeleton row, active-row selection, chart tooltip, hover all present |
| 2 | Match System / Real World | 4 | Exact domain language: "fastest meet time", LCM, tier names, `m:ss:hh`, gap-to-next |
| 3 | User Control and Freedom | 3 | Cancel in form + deselectable segmented; no true undo/back (static preview) |
| 4 | Consistency and Standards | 4 | One component vocabulary, tokens enforced, detector clean |
| 5 | Error Prevention | 4 | Inline hint teaches the `ss:hh` rule; constrained segmented; destructive-confirm note; date error |
| 6 | Recognition Rather Than Recall | 4 | Labels everywhere, chart + tier legends, kbd hints, glyph+label badges, no icon-only nav |
| 7 | Flexibility and Efficiency | 3 | ⌘K search, N shortcut, sortable indicator, button sizes; no real bulk/customization |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained, one anchor, no clutter, no card-in-card |
| 9 | Error Recovery | 3 | Specific plain-language inline error, non-blocking, preserves input; single instance |
| 10 | Help and Documentation | 3 | Contextual hint + inline domain help note; not searchable docs |
| **Total** | | **36/40** | **Good — ship the system** |

## Anti-Patterns Verdict

**LLM assessment:** Does not read as AI-generated. Cool near-monochrome on soft off-white with a
single deep-teal accent, one type family with weight hierarchy, tabular mono times. No hero-metric
tiles, no identical card grid, no icon-tile-above-heading, no gradients or glassmorphism. The tier
scale is a genuine semantic system (colour + label + glyph), not decoration.

**Deterministic scan:** `detect.mjs --json app/preview/page.tsx components/ui` → `[]` (0 findings,
exit 0). Clean across the preview and every UI primitive.

**Contrast (computed from OKLCH tokens):** 15/15 token pairs meet WCAG AA. Body ink 15.8:1,
ink-muted 6.8:1, white-on-accent 6.5:1, all tier ink/bg pairs 6.8–6.9:1. Placeholder raised from
ink-faint (3.2:1) to ink-muted (6.8:1) during this pass.

## Overall Impression

The system is quiet, exact, and disciplined — it reads like a well-kept logbook, which is the
intent. One anchor per screen (the headline PB) is respected even on a dense showcase. Biggest
strength: colour carries meaning and nothing else. Biggest remaining opportunity: the flow
heuristics (control/freedom, efficiency, help) can only be *demonstrated* on a static preview;
they will be fully earned when real screens (swimmer profile, comparison, matrix) implement them.

## What's Working

1. **Tabular truth.** Every time is Geist Mono + `tabular-nums`; PB, gap, and axis columns align
   vertically so the eye compares without effort.
2. **The tier scale.** SANJ/L3/L2/none each pair a distinct accessible hue with a text label and a
   glyph (◆ ● ○ —). It survives greyscale and colour-blindness — colour is never the sole signal.
3. **Restraint that still has hierarchy.** One accent, borders-first elevation, an 8px rhythm, and a
   single 28px anchor number. Dense but never noisy; detector confirms no slop.

## Priority Issues

- **[P2] Flow heuristics are demonstrated, not exercised.** Control/freedom, efficiency, and help
  score 3 because a static preview has no real undo, bulk actions, or searchable docs. **Fix:** earn
  these in the real product steps (profile/comparison/matrix). Not a token defect. *Suggested: $impeccable harden.*
- **[P3] Sort affordance is non-functional.** The PB header shows a sort glyph with no behaviour yet.
  **Fix:** wire sorting when the table becomes real, or drop the glyph until then. *Suggested: $impeccable polish.*
- **[P3] Reduced-motion covers CSS only.** Recharts JS animation is gated via `matchMedia` on mount,
  but a mid-session preference change re-runs correctly; verify once real charts land. *Suggested: $impeccable audit.*

## Persona Red Flags

**Alex (Power User):** ⌘K search and N-to-log hints are present, table is scannable and sortable-looking.
No bulk-select yet — acceptable at system stage, flag for the squad screen.

**Sam (Accessibility):** Visible focus ring on every control, AA contrast throughout, tier meaning not
colour-dependent, form fields labelled with `aria-describedby` errors. Skeleton row is `aria-hidden`.
No red flags at the token/component level.

## Minor Observations

- Chart reference-line labels sit at `position: left`; verify they don't clip at the narrow YAxis width on mobile.
- Consider a `disabled` + `loading` combined state doc for buttons in later steps.

## Questions to Consider

- Should the course toggle (SCM/LCM) persist per coach, given standards are LCM-only?
- When a swimmer has no PB for an event, is the empty state a dash, or a "log first result" prompt?
