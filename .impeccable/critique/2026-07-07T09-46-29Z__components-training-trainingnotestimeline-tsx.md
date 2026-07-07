---
target: Training notes timeline + composer (R16)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-07T09-46-29Z
slug: components-training-trainingnotestimeline-tsx
---
# Critique — Training notes timeline + composer (§R16)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons, notify success/error, "edited" marker, active toggle state — every action confirms. |
| 2 | Match System / Real World | 4 | "Training notes", "Personal", "Squad: <name>", "Applies from" — plain coaching/logbook language. |
| 3 | User Control and Freedom | 3 | Cancel + Esc + confirm-before-delete present; no undo after a delete. |
| 4 | Consistency and Standards | 4 | Reuses Sheet/Button/Badge/DropdownMenu/Segmented/DateField/ConfirmDialog exactly like Squad screens. |
| 5 | Error Prevention | 4 | Required body gates save; scope select required; date validated; destructive delete confirmed; server re-auth. |
| 6 | Recognition Rather Than Recall | 4 | Scope summary states who will see the note; badges + icons labelled; composer shows full context. |
| 7 | Flexibility and Efficiency | 3 | Two entry points (profile + squad mgmt) and a toggle; no keyboard shortcuts (consistent with app). |
| 8 | Aesthetic and Minimalist Design | 4 | Clean timeline rail, one accent, restrained; no card-in-card, no decoration. |
| 9 | Error Recovery | 3 | Composer surfaces the server message verbatim inline (role="alert"); generic fallback only if none. |
| 10 | Help and Documentation | 3 | Inline hints on focus/date, scope summary, teaching empty states; no separate docs (not needed). |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI slop. The timeline is a genuine vertical log (node rail + dated cards), not an identical card grid; the composer is a standard slide-over reusing the app's own form vocabulary. No hero-metric tile, no gradient, no eyebrow, no side-stripe border, no glassmorphism. Colour is meaning: Personal takes the brand tint, squad notes stay neutral, both carry an icon AND a text label (never colour-only). Fits the "well-kept logbook" brand personality.

**Deterministic scan**: `detect.mjs --json` over `components/training` + `ProgressionChart.tsx` returned `[]` (clean). No pattern findings.

**Visual overlays**: Not available — the app needs a live Convex deployment to render data, which isn't provisioned in this environment. Assessment B is the deterministic detector only; browser overlay skipped (fallback signal: no deployment).

## Overall Impression

The feature lands as a quiet, trustworthy log. The single anchor per screen holds: on the profile the timeline is one clear thread; in the composer the scope summary is the one thing that orients you. Biggest opportunity was readability of the note body — fixed during the pass (see below).

## What's Working

1. **The scope summary line.** A plain, always-visible sentence ("Shown to every swimmer in Senior Squad and their viewers") removes the guesswork about a squad note's blast radius — the highest-stakes ambiguity in the whole feature, handled before the user commits.
2. **Merged timeline with honest labels.** Personal and squad notes interleave newest-first, each badged, so a reader sees the real phase order and can line it against the times. The rail node adds a second, non-colour cue reinforcing the badge.
3. **Consistency with the existing app.** Nothing is reinvented: the composer is the SquadForm sheet pattern, delete uses the shared ConfirmDialog, feedback goes through `notify`. A coach who has used the rest of the tool already knows this.

## Priority Issues

- **[P2] Note body was rendered in muted grey** — *Fixed in this pass.* `text-ink-muted` (#667085, ~4.7:1) technically passes AA, but for cards with no optional focus title the body was the only content and read as disabled/greyed. Bumped body to `text-ink` (gray-800) in both the timeline and the squad sheet so the content reads as content regardless of whether a focus title is set.
- **[P3] No undo after delete.** Deletion is confirm-gated and de-emphasised (in a menu, under a separator), matching the "de-emphasise deletion" brief, but a mis-delete is unrecoverable. Acceptable for a coach-only log; a soft-delete/restore could be a later refinement.
- **[P3] Different-club coach empty-state copy.** The non-editable empty state ("When your coach records…") assumes a viewer; a staff member from another club would see the same line. Rare path; copy could be made role-neutral later.

## Persona Red Flags

**Jordan (First-Timer coach)**: First action is obvious — "Add training note" button in the empty state teaches the interface. Scope toggle is labelled words ("This swimmer" / "A squad"), not jargon. The scope summary tells them exactly what a squad note does before they post it. No red flags.

**Casey (Distracted Mobile viewer, ~375px)**: Read-only path — no composer, no controls to fat-finger. Timeline cards are single-column, full-width; the date/badge row wraps; the squad badge truncates rather than overflowing. Body text preserved on return (server-backed, reactive). Touch targets follow the app's h-9/size-8 standard. No red flags for the read path.

**Sam (Accessibility)**: Scope and personal/squad distinction carry text + icon, never colour alone; the chart markers expose focus via an SVG `<title>` and keep the note list as the accessible source. Composer fields are real labelled inputs; delete is confirm-gated; error uses `role="alert"`. Focus rings inherited from shared components. One watch item: the note-marker flags are hover/title only, but the same information is fully available in the timeline list, so no information is locked behind hover.

## Minor Observations

- The marker legend line ("Training-note markers — hover a flag for the focus") only appears when markers are on and present — good restraint.
- `whitespace-pre-wrap break-words` on the body correctly handles pasted multi-line notes and long unbroken strings (Riley/stress-tester safe).
- Notes sort by `noteDate` then `createdAt` so two notes on the same day keep a stable, sensible order.

## Questions to Consider

- Should a squad note that a swimmer's viewer sees be visually distinguished as "not about you specifically" beyond the badge, or is the "Squad: <name>" label enough? (Current answer: label is enough, and it matches the coach's mental model.)
- Is a future soft-delete worth the complexity for an audit-trail log, or does confirm-gating suffice?
