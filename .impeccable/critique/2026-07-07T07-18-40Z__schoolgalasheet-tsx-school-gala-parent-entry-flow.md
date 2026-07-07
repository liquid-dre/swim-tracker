---
target: School gala parent-entry flow (§R15)
total_score: 39
p0_count: 0
p1_count: 0
timestamp: 2026-07-07T07-18-40Z
slug: schoolgalasheet-tsx-school-gala-parent-entry-flow
---
# Critique — School gala parent-entry flow (§R15)

Target: the viewer "Log a school gala time" sheet (`components/me/SchoolGalaSheet.tsx`), the loud "School gala · unofficial" badge in the history table (`components/ui/SchoolGalaBadge.tsx` in `HistoryTable`), and the distinct hollow-diamond chart marker + legend + tooltip in `ProgressionChart`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading/success/error via toast+inline; fixed-type badge shows the mode; age-at-date hint. |
| 2 | Match System / Real World | 4 | Plain language: "School gala", "unofficial", "Gala name". No jargon. |
| 3 | User Control and Freedom | 4 | Cancel + dismissable sheet; viewer can edit/delete their own gala rows; delete confirm dialog. |
| 4 | Consistency and Standards | 4 | Reuses Sheet, EventSelectors, TimeField, DateField, Badge system, notify voice. |
| 5 | Error Prevention | 4 | Swim type FIXED to SCHOOL_GALA; event whitelist disables invalid; date DOB/future guards; server re-enforces. |
| 6 | Recognition Rather Than Recall | 4 | Badge + hover title + legend + inline copy explain the concept everywhere it appears. |
| 7 | Flexibility and Efficiency | 3 | Form auto-scopes to the swimmer; fast RTL time entry. No keyboard shortcut to open the sheet (consistent with app). |
| 8 | Aesthetic and Minimalist Design | 4 | One calm warning callout, no clutter; the loud badge is the only raised element and it earns it. |
| 9 | Error Recovery | 4 | Server message surfaced verbatim via inline `role="alert"`; validation blocks save until valid. |
| 10 | Help and Documentation | 4 | The limit copy, badge title, and chart legend serve as inline help; no external docs needed. |
| **Total** | | **39/40** | **Exceptional** |

## Anti-Patterns Verdict

**LLM assessment:** Does not read as AI slop. No card-in-card, no gradient text, no side-stripe borders, no ghost-card (border+wide-shadow), no over-rounding, no eyebrow/number scaffolding. The gala treatment is a committed, single semantic (warning tone + hollow-diamond/ring glyph) reused verbatim across three surfaces, which reads as a deliberate system rather than decoration. Copy is specific and free of buzzwords and em dashes.

**Deterministic scan:** `detect.mjs --json` over the six changed component files returned `[]` (exit 0) — no anti-pattern hits.

**Visual overlays:** Not available. The target surfaces are Convex-backed and auth-gated (viewer role + a linked swimmer); no Convex deployment or `NEXT_PUBLIC_CONVEX_URL` is configured in this environment, so the app cannot be booted to inject the overlay. Responsive behaviour was reviewed from source instead (see below).

## Overall Impression

The flow lands the brief's hardest requirement — "loud, never a faint grey pill" — cleanly. A parent gets exactly one write, it announces itself as unofficial at every touchpoint (form callout, fixed badge, history badge, chart diamond, tooltip, legend), and it is impossible to mislog as a meet because the type is fixed client-side and re-enforced server-side. The biggest win is restraint: the unofficial signal is *one* semantic reused everywhere, so it never competes with the tier scale or the meet/PB marks.

## What's Working

- **One coherent "unofficial" semantic.** Warning-amber + a hollow (ring/diamond) glyph is used identically on the badge and the chart marker, and it is deliberately distinct from the tier colours, the meet filled-dot, the PB ring, and the trial/practice hollow *circle*. Shape *and* colour differ, so it survives greyscale and colour-blindness.
- **Education at the decision point.** The sheet leads with the exact limit copy in a warning callout before the first field, and pins the fixed `School gala` badge in the Type slot, so the parent understands what they're logging (and what it will not do) before they touch it.
- **Reuse over reinvention.** The sheet is the established slide-over with the same EventSelectors/TimeField/DateField the coach forms use, so it inherits the whitelist-disabling, RTL time entry, and DOB/future date guards for free.

## Priority Issues

- **[P3] Chart marker relies on a mid-chroma amber at small size.** The hollow diamond stroke is `--color-warning-500` (#f79009) at ~4.5px. It reads clearly on the off-white grid, but on a busy multi-swimmer chart a small amber outline can sit quietly against warm series colours. It's labelled in the legend and tooltip, so meaning never depends on the mark alone. Fix (optional): nudge the stroke toward `--warning-ink` for a touch more weight. Suggested command: `$impeccable colorize`.
- **[P3] History Type column widens for gala rows.** The loud badge is wider than the dot+word used by official types, so a gala row's Type cell is visibly heavier. This is intentional emphasis and the table already scrolls horizontally on narrow screens, so nothing squashes — but it's the one place the emphasis is slightly asymmetric. Leave as-is unless the column reads unbalanced in practice. Suggested command: `$impeccable layout`.

## Persona Red Flags

**Jordan (First-time parent, on a phone):** Reaches the swimmer via "My swimmers", taps "Log a school gala time", and gets a full-width sheet that opens with a plain-English explanation of what a school gala time is and isn't. Type is fixed, so there's no "which of these four do I pick?" moment. No red flags for the primary action; the ~375px sheet is `w-full` and the body scrolls.

**Sam (Coach):** Sees the same fourth "School gala" type in the log + edit forms with a warning note, and gala times never pollute the PB board, status matrix, road-to-qualify, stroke wheel, projections, or season ranking (excluded in `computePersonalBests` + all surfaces are MEET-gated). No red flag: the coach's official numbers are untouched.

## Minor Observations

- The chart's `aria-label` now names the unofficial gala count per swimmer, so assistive tech hears the same caveat sighted users see.
- The sheet's inline `role="alert"` error is the single error surface (aligned to `LogScreen`), so there's no double toast+inline error.
- The gala badge carries a hover `title` with the full limit sentence — good for the tight history cell where only "School gala · unofficial" shows.

## Questions to Consider

- Should a parent be able to log a gala for *any* of their linked swimmers from one entry point, or is the per-swimmer-profile scoping (current) the right amount of friction?
- On the chart, is the diamond enough on its own for a parent glancing quickly, or would a one-line "◇ unofficial" caption under the chart help the least chart-literate viewer?
