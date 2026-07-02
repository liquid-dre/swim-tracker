---
target: Viewer home greeting header (R4)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T09-22-44Z
slug: components-me-viewerhomescreen-tsx
---
## Design Health Score — Viewer home greeting header (/me, R4)

Assessed against a live-rendered screenshot of the PageHeader in three states (morning + name, evening + name, neutral no-name). a swimmer or parent lands here after sign-in; the h1 is now a time-aware, personalised greeting at the DESIGN heading scale, with the breadcrumb still naming the location.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Resolves to name + local band once known; shows the neutral "Welcome back." while the profile/time load — never a flash of "undefined" |
| 2 | Match System / Real World | 4 | "Good morning, Alex." in the user's own local time reads exactly as a person would greet |
| 3 | User Control and Freedom | 3 | A heading, not an interactive control — nothing to escape from |
| 4 | Consistency and Standards | 4 | Same PageHeader title slot + one shared hook on both landing screens; breadcrumb keeps the location label |
| 5 | Error Prevention | 4 | Never renders "undefined"/blank (first-name → whole-name → neutral); band resolved post-mount so no hydration mismatch |
| 6 | Recognition Rather Than Recall | 4 | Personalised and located; the viewer's swimmer identity moved into the identity strip so nothing is lost |
| 7 | Flexibility and Efficiency | 3 | Refreshes on focus/visibility so a long-open tab isn't stale |
| 8 | Aesthetic and Minimalist Design | 4 | One clean line at the heading scale + a muted subtitle; no emoji, no gradient banner, no exclamation |
| 9 | Error Recovery | 3 | Graceful degradation is the whole story; nothing to recover from |
| 10 | Help and Documentation | 3 | The muted subtitle gives one line of orientation |
| **Total** | | **36/40** | **Good — a calm heading, ship it** |

## Anti-Patterns Verdict

**LLM assessment**: Reads as a well-kept logbook, not a marketing banner. It is a single sentence-cased line in the same ink + weight as every other page title; no hero tile, no gradient, no emoji, no "Welcome back!!" energy. Exactly the "quietly authoritative" register PRODUCT.md asks for.

**Deterministic scan**: `detect.mjs` over both landing screens → exit 0, **0 findings**.

**Visual overlays**: Rendered the greeting header in a headless Chromium harness and reviewed it — the three states (named morning, named evening, neutral) all read as calm headings.

## What's Working

1. **It's a heading, not a banner.** The greeting sits in the normal PageHeader title slot at the house heading scale, so it inherits the page's calm rhythm instead of shouting.
2. **Honest fallbacks.** First name → whole name → neutral "Welcome back." means it can never render "undefined" or a blank h1, and the band resolves after mount so SSR and hydration agree.
3. **Local time, correct at the edges.** The band is computed from the user's own clock (11:59 morning / 12:00 afternoon / 17:00 evening), unit-tested at every boundary.

## Priority Issues

- **[P3] Trailing period on a heading.** "Good morning, Ntando." ends in a period — deliberate (matches the spec and reads as a calm sentence), but headings often omit it. Worth a glance to confirm it's the intended voice. **Command**: `$impeccable clarify`.
- **[P3] One-frame neutral before the name resolves.** The h1 shows "Welcome back." until the profile query returns, then swaps to the named greeting. It's graceful, but a brief swap. **Command**: `$impeccable polish`.

## Persona Red Flags

**Jordan (First-Timer)**: Immediately sees their own name and a plain one-line orientation; no jargon in the heading.

**Sam (Accessibility)**: A single h1 with real text; the breadcrumb still labels the location for screen-reader context; no colour-only meaning.

## Questions to Consider

- Keep the trailing period, or drop it so the heading reads as a label rather than a sentence?
- Is a date or a one-number summary (e.g. swims logged today) worth adding to the subtitle, or does that start to feel like a dashboard demo?
