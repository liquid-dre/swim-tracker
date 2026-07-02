---
target: /log form — event selectors + time input
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T05-41-10Z
slug: components-log-logscreen-tsx
---
## Design Health Score — /log form (event selectors + time input)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live "Saves as m:ss:hh" echo, loading states, save toast, aria-live hint/echo — status is always visible |
| 2 | Match System / Real World | 4 | Domain language throughout (Meet/Trial/Practice, SCM·25m / LCM·50m, "last two are hundredths") |
| 3 | User Control and Freedom | 3 | Clear button, delete-recent, sticky non-destructive selections; no global undo |
| 4 | Consistency and Standards | 4 | Distance/Stroke/Course now share ONE identical chip component; tokens-only styling |
| 5 | Error Prevention | 4 | Whitelist-driven disabling + save gate make an invalid (d,s,c) combo unsubmittable; date capped at today; ss range validated |
| 6 | Recognition Rather Than Recall | 4 | All three controls visible at once; remembered meet/date/type defaults; recent list |
| 7 | Flexibility and Efficiency | 3 | Form stays put for rapid poolside logging, numeric keypad, remembered defaults; no arrow-key roving in the radiogroups |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, one anchor (the large time); three always-on chip rows add intended density |
| 9 | Error Recovery | 4 | Specific inline messages ("Seconds must be 00–59", conflict hint names the fix); form/work preserved |
| 10 | Help and Documentation | 3 | Contextual inline hints at each decision; no separate docs (not needed) |
| **Total** | | **36/40** | **Good — ship it after minor polish** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI-generated. It looks like the "well-kept logbook" the brand asks for: restrained, tabular, one indigo accent, no card-in-card, no gradient text, no eyebrow kickers, no hero-metric tile. The event trio reads as a purpose-built control, not a generic form.

**Deterministic scan**: `detect.mjs` over `LogScreen.tsx`, `EventSelectors.tsx`, `TimeField.tsx` → exit 0, **0 findings**. No banned patterns (no side-stripe borders, ghost-card border+shadow, over-rounding, gradient stripes).

**Visual overlays**: Not available — the screen requires the Convex backend + auth to render, so no localhost URL to inject into. Fallback: static source + detector review only.

## Overall Impression

The R1 rework lands its two goals cleanly. The three event selectors are now one identical chip control shown together, driven live off the whitelist (invalid options greyed, never hidden), and no invalid combo can be submitted. The time field is a true right-to-left accumulator: digits shift in from the right, backspace shifts exactly one out, and the large tabular display echoes the canonical stored value. Biggest remaining opportunity is keyboard roving inside the radiogroups for full a11y parity.

## What's Working

1. **Consistency win (the R1 ask).** Distance, Stroke and Course render through the same `ChipRow`, identical height/spacing/states. The old odd-one-out course control (Segmented + prose fallback) is gone. Consistency jumps because the three controls are now visibly one family.
2. **Error prevention is structural, not advisory.** Options that can't form a real event are disabled from the whitelist; the parent's `isValidEventTriple` gate blocks submit even for a stale selection left behind after a change. A coach cannot save "50 IM" or "100 IM LCM".
3. **The time accumulator is honest and legible.** One large tabular value, a live "Saves as" echo, and a caret-free right-to-left fill that behaves identically on desktop and a phone keypad. Backspace can no longer delete the wrong digit.

## Priority Issues

- **[P2] Radiogroups lack arrow-key roving.** Each chip row is `role="radiogroup"` with `role="radio"` children, but there's no ArrowLeft/Right handling, so a keyboard/screen-reader user Tabs through every chip instead of arrowing within the group. **Fix**: add roving tabindex + arrow-key handler (skip disabled options). **Command**: `$impeccable audit`.
- **[P3] Invalid-selected chip signals mainly via red.** A stale, now-invalid selection turns the chip red (`border-error-500`). The inline hint below carries the non-colour explanation, so it isn't strictly colour-only, but a small inline warning icon on the chip would make the conflict unmistakable in greyscale. **Fix**: add a tiny alert glyph to the invalid-selected chip. **Command**: `$impeccable polish`.
- **[P3] Course row is fully interactive before distance/stroke exist.** At first paint both SCM/LCM are enabled (correct — nothing constrains them yet), which can read as "course is independent." Acceptable per the spec's "always visible" rule; worth a glance to confirm it doesn't invite picking course first. **Command**: `$impeccable layout`.

## Persona Red Flags

**Sam (Accessibility-Dependent)**: Focus rings present, labels present, state changes announced via `aria-live`, disabled options use native `disabled` (removed from tab order). Red flag: no arrow-key roving inside the radiogroups (P2 above); otherwise keyboard-operable.

**Casey (Distracted Mobile)**: Primary Save is a bottom sticky bar in the thumb zone; numeric keypad via `inputMode="numeric"`; meet/date/type persist across entries so an interruption doesn't lose context. No red flags of note.

**Riley (Stress Tester)**: Pasting "5:48.28" regroups correctly; typing past 6 digits caps; ss=60 shows "Seconds must be 00–59" and blocks save; changing distance under a now-invalid stroke shows a hint and disables save rather than silently mangling. Holds up.

## Minor Observations

- The onChange fallback in `TimeField` is only reached on browsers without a cancelable `beforeinput`; it re-canonicalises so RTL order still holds. Good defensive touch.
- `normaliseDigits` strips leading zeros so the model can't accumulate phantom zeros — this is what keeps the "empty vs 0" distinction clean.

## Questions to Consider

- Should the radiogroups adopt arrow-key roving now, or is Tab-through acceptable for the coach's desktop-first flow?
- Is a warning icon on an invalid-selected chip worth the extra glyph, given the inline hint already names the fix?
