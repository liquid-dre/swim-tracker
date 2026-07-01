---
target: /log result-logging flow
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T12-52-00Z
slug: components-log-logscreen-tsx
---
# Critique: /log result-logging flow

Target: `components/log/LogScreen.tsx` + `components/log/TimeField.tsx`
Register: product (design serves the task). Mobile-first poolside data entry; the large time input is the single anchor.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading select, live "Saves as m:ss:hh" echo, save spinner, toast, session log all confirm state |
| 2 | Match System / Real World | 4 | Calculator time entry mirrors a scoreboard; "SCM · 25m"/"LCM · 50m" translate jargon |
| 3 | User Control and Freedom | 3 | Delete of a just-logged entry + Clear on the time; but the session log is memory-only (lost on reload) |
| 4 | Consistency and Standards | 4 | Reuses Button/Input/Segmented/PageHeader/tokens; ChipGroup mirrors Segmented radio semantics |
| 5 | Error Prevention | 4 | Only whitelist-valid distance/stroke/course selectable; 100 IM course auto-locked; date capped at today; save gated on a valid parse |
| 6 | Recognition Rather Than Recall | 4 | Remembered meet/date/type; progressive disclosure; age-at-swim shown; parsed echo |
| 7 | Flexibility and Efficiency | 3 | Form persists + autofocus for rapid entry, Enter submits; no visible shortcut hint |
| 8 | Aesthetic and Minimalist | 4 | One anchor, restrained palette, disclosure keeps the screen calm |
| 9 | Error Recovery | 3 | Inline date + time-range errors and server error block; server error is not field-mapped like SwimmerForm |
| 10 | Help and Documentation | 3 | Good inline hints ("last two are hundredths", "Only meet times count toward a PB") |
| **Total** | | **36/40** | **Strong — ships above the 35 gate** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI slop. No card-in-card, no hero-metric tile, no gradient, no icon-tile-above-heading. The screen commits to a single idea (type the time, everything else is quiet support) rather than a generic form grid. The calculator time field is a genuine, non-generic interaction choice fitted to the poolside job.

**Deterministic scan**: `detect.mjs --json` over both files returned `[]` (exit 0) — no detected patterns.

**Visual overlays**: Not available. `/log` requires a live Convex deployment + auth + seeded swimmers/events to render, which isn't provisioned in this environment. Fallback: source review + deterministic scan + production build (passes).

## What's Working

1. **The anchor is real.** The 44px+ tabular-mono field with calculator right-fill (type digits, colons fall in) is the correct one-thumb poolside pattern, and the live "Saves as 1:07:47" line proves the stored canonical value before commit.
2. **Invalid states are unreachable, not just rejected.** Strokes are derived from the chosen distance and courses from the chosen event, so "50 IM" or "100 IM LCM" can't be selected at all. Save stays disabled until the parse is valid.
3. **Built for repetition.** Meet/date/type persist across visits; after save the form keeps swimmer/event/meet, clears only the time + notes, and re-focuses the anchor. The session log gives an at-a-glance trail with per-row delete for mis-entries.

## Priority Issues

- **[P2] Session log is memory-only.** "Logged this session" lives in React state; a reload drops the confirmation trail and the delete affordance for earlier entries. Acceptable for Step 5 scope, but a later step should back it with a bounded `recentResults` query so the trail (and undo) survive reload. Suggested command: `$impeccable harden`.
- **[P3] Server error isn't field-mapped.** Unlike SwimmerForm (which routes name/dob errors to their inputs), a server validation failure here renders as one block above the save button. Most are prevented client-side, so impact is low. Suggested command: `$impeccable clarify`.
- **[P3] Bespoke native select.** The swimmer picker is a one-off styled `<select>` rather than a shared Select primitive; visually consistent, but the pattern isn't reusable yet. Suggested command: `$impeccable extract`.

## Persona Red Flags

**Coach (poolside power user)**: Primary action = log a time in seconds, one-handed. Passes: numeric keypad, big target, form persists, Enter-to-save, session undo. No red flags for the core loop. Watch: if a meet has swimmers across many squads, the flat swimmer `<select>` gets long (no grouping/search) — fine for a club roster, worth revisiting at scale.

**Parent/viewer (read-only)**: Not a target of this screen; nav hides it and mutations are coach-gated server-side. No red flag.

## Minor Observations

- Fixed two house-rule copy violations during this pass: em dashes in the time hint and the single-course line are now plain sentences.
- `parsedTime.text!` non-null assertions are guarded by `canSave`, but a typed narrowing would read cleaner.
- Consider a one-key hint (e.g. "Enter to save") near the anchor for the power-user loop.

## Questions to Consider

- Should the session log persist across reloads now, or is that deliberately deferred to the results/history step?
- Would coaches want to pin a swimmer and log several events for them before switching, or is swimmer-first-every-time the right default?
