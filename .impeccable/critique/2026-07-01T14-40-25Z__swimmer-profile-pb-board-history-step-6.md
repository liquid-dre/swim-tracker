---
target: /swimmers/[id] swimmer profile — PB board + improvement + history
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T14-40-25Z
slug: swimmer-profile-pb-board-history-step-6
---
# Critique: /swimmers/[id] swimmer profile (Step 6)

Target: `components/swimmers/SwimmerProfileScreen.tsx` + `PbBoard.tsx` + `ImprovementSummary.tsx` + `HistoryTable.tsx` + `ResultEditSheet.tsx` + `components/ui/ConfirmDialog.tsx`
Register: product (design serves the read). Dense but scannable; the swimmer's numbers are the only thing that gets to be loud.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Full-screen skeleton; sort arrows; "N of M results"; toasts on save/delete; live time echo in the edit sheet |
| 2 | Match System / Real World | 4 | "Fastest meet time", "No meet time yet", "faster in practice", "In system since"; LCM/SCM never merged |
| 3 | User Control and Freedom | 3 | Edit sheet Cancel + delete behind a confirm dialog; no post-delete undo (toast only) |
| 4 | Consistency and Standards | 4 | Reuses PageHeader/Segmented/Button/Sheet/dropdown/tokens; tables mirror RosterTable + the /preview reference exactly |
| 5 | Error Prevention | 4 | Event edit constrained to the whitelist; single-course events auto-lock; date capped at today + DOB guard; delete confirmed |
| 6 | Recognition Rather Than Recall | 4 | Board carries date + meet inline; filters are selects not recall; the edit sheet pre-seeds every field |
| 7 | Flexibility and Efficiency | 4 | Filter (event/type/course) + sort (date/time) + per-row edit/delete; roster names deep-link to the profile |
| 8 | Aesthetic and Minimalist | 4 | One accent, no nested cards, faint secondary (overall best); improvement deltas stay neutral so green isn't overloaded |
| 9 | Error Recovery | 3 | Edit sheet + confirm dialog surface server errors inline and stay open; no undo on delete |
| 10 | Help and Documentation | 4 | Each section has a one-line rule ("Trials and practice never set a PB"); empty states teach, distinguishing no-data from filtered-empty |
| **Total** | | **37/40** | **Strong — ships above the 35 gate** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI slop. No card-in-card, no hero-metric tile, no gradient, no icon-tile-above-heading, no colour-only meaning. The PB board commits to the events × course grid the domain actually needs rather than a generic KPI row, and the "No meet time yet" cell is a deliberate, honest state rather than a blank or a misleading practice number.

**Deterministic scan**: `detect.mjs --json` over all six markup files returned `[]` (exit 0) — no detected patterns.

**Visual overlays**: Not available. `/swimmers/[id]` needs a live Convex deployment + auth + seeded swimmer/results to render, which isn't provisioned here. Fallback: source review + deterministic scan + `next build` (passes) + `tsc --noEmit` (clean) + 33 unit tests green.

## What's Working

1. **The PB rule is legible in the UI, not just the query.** Each cell shows the fastest *meet* time with its date + meet; where only trials/practice exist, it says "No meet time yet" and shows the non-meet best as faint secondary — so the derived rule (headline = meet-only, overallBest = secondary) is visible, not hidden.
2. **Invalid edits are unreachable.** The edit sheet derives strokes from the distance and courses from the event, so an edit can't move a result off the whitelist (100 IM stays SCM-only); the server re-validates regardless.
3. **Honest, calm improvement.** First-swim → current-PB delta reads via a direction arrow + signed seconds + %, with the earliest swim's type shown — including when the baseline was a practice. Signed and neutral, so a regression against an old fast practice reads truthfully instead of being hidden.

## Priority Issues

- **[P2] No undo after delete.** Deleting a result is confirmed but irreversible; a reload-safe undo would soften the one true destructive action. Acceptable for Step 6. Suggested command: `$impeccable harden`.
- **[P3] "Log a time" doesn't preselect the swimmer.** The header shortcut jumps to /log but the coach re-picks the swimmer there (the /log form remembers meet/date/type, not swimmer). Minor. Suggested command: `$impeccable adapt`.
- **[P3] Bespoke native selects.** The history filters and the edit sheet's distance/stroke use one-off styled `<select>`s rather than a shared Select primitive — visually consistent, not yet reusable. Suggested command: `$impeccable extract`.

## Persona Red Flags

**Coach (scanning many swimmers × events)**: Primary job = read a swimmer's bests + trajectory at a glance. Passes: dense grid, right-aligned tabular times, date+meet inline, filter/sort on history, quick edit/delete. No red flags for the core read.

**Parent/viewer (read-only)**: Not yet a target — the queries are coach-gated server-side (viewer scoping is Step 15). No red flag; noted so it isn't forgotten.

## Minor Observations

- Improvement deltas were deliberately de-greened this pass: green stays reserved for qualifying/status so it isn't diluted on a screen that will later carry tier colour.
- `parsed.text!` / `improvement!` non-null assertions are guarded by `canSave` / the `.filter` above them; typed narrowing would read cleaner.
- History empty state now distinguishes "no swims logged yet" from "no results match these filters".
