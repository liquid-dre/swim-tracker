---
target: Coach dashboard after removing Target-tier card (R12)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T11-54-30Z
slug: coach-dashboard
---
# Critique — Coach dashboard after removing the Target-tier card (STEP R12)

**Target:** `components/dashboard/CoachDashboardScreen.tsx` (+ removal of the global `useTargetTier` store and its references).
**Scope:** Delete the redundant Target-tier card and the persisted global-default-tier state; reclaim the space cleanly. Verified live in a browser.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Breadcrumb + time-aware greeting orient the coach; the hero states exactly what "Log a time" does. |
| 2 | Match System / Real World | 4 | Plain, task-first language; the removed control's job now lives where the task is (the qualifying views). |
| 3 | User Control and Freedom | 4 | Nothing lost — the per-view tier toggles give more local control than the old set-once global did. |
| 4 | Consistency and Standards | 4 | One card vocabulary (rounded-2xl, gray-200, soft shadow); the grid tiles all share one shape. |
| 5 | Error Prevention | 3 | A settings-shaped control that framed distant screens is gone, so there's no stale global to misread. |
| 6 | Recognition Rather Than Recall | 4 | Every surface is a labelled tile with a one-line description; nothing to remember from another page. |
| 7 | Flexibility and Efficiency | 3 | Hero action + six jump-offs cover the poolside flow; deliberately not a metrics wall. |
| 8 | Aesthetic and Minimalist Design | 4 | Leaner and calmer — the page is now hero → jump-to → note, with even 8px-grid rhythm and no orphan gap. |
| 9 | Error Recovery | 3 | n/a — no destructive or failure surface on the home screen. |
| 10 | Help and Documentation | 3 | The honest "full squad overview arrives later" note sets expectations; tiles self-describe. |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop, and cleaner than before. The dashboard was carrying a settings-shaped control (a global target tier) on a landing page — a small IA smell, since a "set once, applies everywhere" toggle on the home screen asks the coach to reason about distant screens before doing anything. Removing it makes the page do one thing: get you logging or moving. The remaining tiles avoid the identical-card-grid trap by pairing distinct icons with specific one-line descriptions.

**Deterministic scan:** `detect.mjs --json` over the dashboard and the two screens that changed their tier source returned `[]` (exit 0).

**Browser evidence:** Rendered live (2× DPI). The card is gone and the layout reflows with no leftover gap — the page ends on the Jump-to grid followed immediately by the muted "full squad overview arrives later" note, on the same `gap-8` rhythm as the rest. The empty area below is just the short page's natural end, not a hole.

## Overall Impression

The redundant control is gone with nothing orphaned: the global `useTargetTier` store (localStorage) is deleted, and each screen that needed a tier now owns it locally — Road opens on All, the progression projection defaults to SANJ, the viewer road/overview keep a sensible per-view default. The dashboard reads as a calmer, more honest home.

## What's Working

- **No orphaned state.** The whole global-default-tier mechanism (hook, storage key, sync event) is deleted; a repo-wide grep for `useTargetTier` / the storage key is clean, and tsc/build pass.
- **Right control, right place.** A projection genuinely needs one cut, so it keeps a local selector (default SANJ); Road, which is a survey, now opens on the all-tiers zoned view. The control moved to where the task is.
- **Clean reflow.** Removing a flex child from a `gap-8` column closes up on its own — no bespoke spacing patch, no empty section left behind.

## Priority Issues

- **[P3] The home is now quite sparse on large screens.** With the card gone, tall viewports show a lot of canvas below the note. That's consistent with the "honest, not a metrics wall" intent and the promised later squad-overview, but worth revisiting when that overview lands.
  - *Fix:* Let the future squad-overview fill the reclaimed space; no interim filler.
  - *Suggested command:* `$impeccable layout`

## Persona Red Flags

**Alex (Power User):** One hero action and six labelled jump-offs — no forced set-up step before working. The removed global toggle was exactly the kind of upfront ceremony this persona skips.

**Jordan (First-Timer):** Fewer competing decisions on first load; the hero says what to do, and each tile explains itself.

## Minor Observations

- Road-to-qualify now opens on "All" by default with a per-session tier switch; the projection and viewer road keep their own local toggles, so no screen depends on a global.
- Doc comments on the dashboard, road page and TargetTierToggle were updated so none still claim a "shared/persisted" tier.

## Questions to Consider

- When the squad overview lands, should it sit above or below the Log-a-time hero — is logging still the first job, or does "who needs attention" lead?
