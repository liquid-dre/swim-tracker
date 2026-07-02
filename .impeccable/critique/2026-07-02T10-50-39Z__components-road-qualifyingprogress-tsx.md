---
target: Road Qualifying progress chart (R8)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T10-50-39Z
slug: components-road-qualifyingprogress-tsx
---
# Critique — Road "Qualifying progress" chart (STEP R8)

**Target:** `components/road/QualifyingProgress.tsx` (+ new `components/ui/badge.tsx`, rebuilt `components/ui/TierBadge.tsx`)
**Scope:** Two refinements — PB time drawn inside each coloured bar fill; tier pills replaced by shadcn Badge components on the tier tokens.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Every bar now states its own PB inside the fill; right-side status ("Top tier" / "Xs to L3" / "No time") retained. |
| 2 | Match System / Real World | 4 | Tabular m:ss:hh times; tier badges use the coach's own SANJ/L3/L2 vocabulary + medal on the top tier. |
| 3 | User Control and Freedom | 3 | n/a for a read-only chart; target toggle upstream governs the view. |
| 4 | Consistency and Standards | 4 | TierBadge now rides the shared shadcn Badge, so status matrix / standards / road read as one badge system. |
| 5 | Error Prevention | 3 | n/a — presentational; no destructive surface. |
| 6 | Recognition Rather Than Recall | 4 | PB is on the bar, not recalled from the legend; tier tint + label + medal are all self-describing. |
| 7 | Flexibility and Efficiency | 3 | Static read; density is appropriate, nothing to accelerate. |
| 8 | Aesthetic and Minimalist Design | 4 | The in-fill time and tinted badges add signal, not clutter; on-fill colour is contrast-tuned per fill. |
| 9 | Error Recovery | 3 | n/a — no error surface here. |
| 10 | Help and Documentation | 3 | Legends explain the fill/zones; badge titles ("SANJ standard met") give hover context. |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop. The tier badges are deliberately themed — subtle tinted surface + tier-coloured ink + a matching hairline border, with a medal only on the top tier and a dashed muted outline for "none". That reads as a designed tier scale, not a default grey pill. The in-bar time uses tabular figures and a per-fill contrast rule (white on the deep indigo/purple fills, near-black on the light gold and grey fills) rather than blanket white text, which is the detail that separates "intentional" from "generated".

**Deterministic scan:** `detect.mjs --json` over all five touched files returned `[]` (exit 0). No side-stripe borders, no ghost-card border+shadow, no over-rounding, no gradient text. The Badge base pairs a 1px border with a tint (not a border+wide-shadow), so it clears the codex ghost-card tell.

**Visual overlays:** Unavailable — project dependencies aren't installed and no dev server runs in this environment, so browser injection was skipped. Verdict rests on source review + the deterministic scan.

## Overall Impression

Both refinements raise signal density without adding noise. The PB time on the fill answers "what did they actually swim?" at a glance — previously, in All mode, that number lived only in the bar's *position*, never as text. The tier badges now look like a first-class part of the design system instead of hand-rolled pills.

## What's Working

- **Contrast-tuned on-fill text.** White would fail on the gold SANJ fill (~2.4:1); the code switches to near-black there (~6.7:1) and keeps white on the deep L3/L2 fills. The label is never a low-contrast smear.
- **Graceful short-fill handling.** At <24% fill the time moves just past the fill's end in ink and is clipped to the fill width otherwise, so it never bleeds onto the empty track. No-PB events keep an empty track + "No time".
- **Accessibility net gain.** The decorative bar stays `aria-hidden`, and All mode now carries an `sr-only` "PB m:ss:hh" — a number that was previously absent from the accessible row entirely.

## Priority Issues

- **[P2] White on the qualified-green / L2-sky fills is borderline for small text.** White on `--color-qualified` (#12b76a, ~2.6:1) and on L2 sky (#0086c9, ~4.0:1) sit under the 4.5:1 small-text bar. Mitigated: the label is decorative (`aria-hidden`) with the value duplicated in accessible text, the fills are large, and white-on-success matches the design system's `--success-fg` convention. Worth a follow-up if the label is ever promoted to primary.
  - *Fix:* If tightened, switch the qualified-green fill's label to near-black (~6:1) as the gold fill already does.
  - *Suggested command:* `$impeccable audit`
- **[P3] `--tier-l3` token reads purple, not indigo.** The task calls L3 "indigo"; the badge correctly consumes `--tier-l3`, but that token's value (#9333ea) is violet. A token-value question, not a badge issue.
  - *Suggested command:* `$impeccable colorize`

## Persona Red Flags

**Sam (Accessibility):** Tier meaning is never colour-only (label always present; medal is `aria-hidden`). The in-bar time is `aria-hidden` but mirrored in `sr-only` text, so screen-reader users get the PB. Only flag is the borderline decorative-label contrast noted above.

**Alex (Power User):** Can read PB, tier, and gap-to-next in one row without cross-referencing the legend — the density this persona wants.

## Minor Observations

- Badge base is a proper cva with a full variant set (default/secondary/outline/success + tier variants), so future badges inherit one vocabulary.
- The medal glyph is nudged `-ml-0.5` so it optically balances against the label rather than floating.

## Questions to Consider

- Should the qualified-green in-bar label go near-black for a uniform ≥6:1 across all fills, accepting a slight divergence from the white-on-success chip?
