---
target: Road to qualify — Qualifying progress (R3)
total_score: 38
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T08-40-07Z
slug: components-road-roadscreen-tsx
---
## Design Health Score — Road to qualify · Qualifying progress (R3)

Assessed against live-rendered screenshots of both modes (single-tier L2/L3/SANJ and All). The "% of cut" chart is replaced by a "Qualifying progress" view; the target toggle is now L2 / L3 / SANJ / All.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Fill + exact gap ("2.0s to SANJ"), "Qualified"/"Top tier"/"No time" states, skeletons; the toggle re-renders the whole view |
| 2 | Match System / Real World | 4 | L2/L3/SANJ vocabulary, meet-only, "20.0s to L3" reads like a coach speaks |
| 3 | User Control and Freedom | 4 | Four-way toggle switches freely; the three real tiers persist across screens, All is a local overlay |
| 4 | Consistency and Standards | 4 | Tier colours match TierBadge + tokens; bars match the gap list / season-ranking house style |
| 5 | Error Prevention | 4 | Coverage respected — a marker is drawn only where a cut exists (50 shows only L2; 400 Free has no L2); shared calibration keeps bars comparable |
| 6 | Recognition Rather Than Recall | 4 | Fixed L2/L3/SANJ axis header, per-row tier badge, and a legend — nothing to memorise |
| 7 | Flexibility and Efficiency | 3 | Quick toggle; no keyboard accelerators beyond native tab/enter |
| 8 | Aesthetic and Minimalist Design | 4 | Faint zone tints under a single coloured fill; one meaning per colour; the bars are the anchor |
| 9 | Error Recovery | 3 | Clear empty/skeleton states; no destructive actions to recover from |
| 10 | Help and Documentation | 4 | Both legends explain the encoding ("fill runs to the PB on one shared scale"; "bar fills toward the cut") |
| **Total** | | **38/40** | **Excellent — ship it** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI-generated. Colour is strictly meaning (tier fill = highest tier met, green = qualified only), always paired with a text label/badge, so it reads in greyscale. No rainbow, no gradient text, no card-in-card. The All view's fixed-position zones are a genuine, considered visualisation, not a generic bar chart.

**Deterministic scan**: `detect.mjs` over RoadScreen + QualifyingProgress + RoadAllResults → exit 0, **0 findings**.

**Visual overlays**: Rendered both modes in a headless Chromium harness (mock data, no backend) and reviewed the screenshots directly — the calibration, coverage, sorting, colours and gap labels all match the spec.

## What's Working

1. **Single-tier progress is instantly legible.** Qualified events are full green bars with a check, sorted to the top; chasers are partial brand-accent bars with the exact "Xs to go". No percentage to decode.
2. **The All view is comparable across events.** L2/L3/SANJ sit at fixed positions on every bar (piecewise-linear calibration), so a swimmer's strengths and gaps read across the whole programme at a glance. Coverage is honoured — 50 Free shows only an L2 marker, 400 Free has no L2 — never a fabricated cut.
3. **Colour carries real meaning, safely.** Fill colour = highest tier met (SANJ gold / L3 indigo / L2 sky / grey none), and every row still carries a TierBadge, so the encoding is never colour-only.

## Priority Issues

- **[P3] Fixed axis labels show all three tiers even when no event has that tier.** The shared L2/L3/SANJ header is a scale reference; on a swimmer whose events never reach SANJ coverage the "SANJ" label still appears. It's a reference, not a claim, but could be conditionally hidden. **Command**: `$impeccable polish`.
- **[P3] Tier markers within a filled bar are subtle.** The thin dividing lines are quiet against a saturated fill; the legend + axis header compensate. **Command**: `$impeccable polish`.

## Persona Red Flags

**Sam (Accessibility)**: Every tier is a badge (label + glyph) plus the legend, not colour alone; bar tracks are aria-hidden with all numbers in row text. Fills use the reserved semantic greens/tier tokens. No red flags of note.

**Alex (Power User)**: One toggle reshapes the whole screen; the All view answers "where is this swimmer strong/weak across the programme" in a single glance.

## Questions to Consider

- Should the All-mode axis labels for a tier hide when no visible event has that coverage, or stay as a fixed reference scale?
- Is "Top tier" the clearest phrase for an event where the swimmer has met the hardest cut that event has (e.g. a 50's L2)?
