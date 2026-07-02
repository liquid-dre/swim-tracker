---
target: Viewer History (/me/history, R6)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T09-37-12Z
slug: components-me-viewerhistoryscreen-tsx
---
## Design Health Score — Viewer History (/me/history, R6)

One focused page in the viewer's new compartmentalised, sidebar-driven experience: the full read-only results table. reuses the gate-passed HistoryTable in its read-only form.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Own PageHeader + skeletons; the Read-only chip states the mode; the active sidebar item shows where you are |
| 2 | Match System / Real World | 4 | Plain viewer language ("your bests", "closest to qualifying"); meet-only PBs |
| 3 | User Control and Freedom | 3 | Sidebar + breadcrumb navigate freely; a multi-swimmer parent switches swimmer; nothing traps |
| 4 | Consistency and Standards | 4 | Same shell, PageHeader, Section and card vocabulary as every other screen; reuses the already-built charts unchanged |
| 5 | Error Prevention | 4 | Read-only (no edit/delete); every read is server-scoped to the linked swimmer(s); a viewer can't reach coach routes or other swimmers by nav OR direct URL |
| 6 | Recognition Rather Than Recall | 4 | Four labelled sidebar sections instead of one scroll; the switcher and section names are always visible |
| 7 | Flexibility and Efficiency | 3 | The swimmer choice persists across sections; no keyboard accelerators beyond native nav |
| 8 | Aesthetic and Minimalist Design | 4 | One focus per page (the R2 "hero" layout); the old single info-dump is gone |
| 9 | Error Recovery | 3 | Clear empty/skeleton states; no-link state explains how to get linked |
| 10 | Help and Documentation | 3 | A one-line orientation under each heading |
| **Total** | | **37/40** | **Good — compartmentalised, ship it** |

## Anti-Patterns Verdict

**LLM assessment**: Reads as a calm, well-kept logbook, not a dashboard demo. One page, one job; the shared shell + tokens keep it consistent with the coach side. No card-in-card, no gradient, no emoji.

**Deterministic scan**: `detect.mjs` over the viewer components → exit 0, **0 findings**.

**Visual overlays**: The four routes need the Convex backend to render live. The Overview composition was verified in a headless-Chromium harness (switcher, greeting, identity strip, PB board, closest-to-qualifying list, jump tiles) and reads as a calm summary; the other sections wrap already-gate-passed charts in the same layout. Access + nav logic is locked by unit tests (navForRole / isRouteAllowed / isLeafActive).

## What's Working

1. **One focus per page.** The old /me crammed charts, metrics and history onto a single scroll; each now has its own route surfaced in a role-aware sidebar, so a viewer navigates instead of hunting.
2. **Reuse, not rebuild.** Progression, the stroke wheel, road-to-qualify, the PB board and the history table are the existing components, relocated — so craft and correctness carry over for free.
3. **Scoping holds two ways.** RoleGuard + isRouteAllowed bar cross-role navigation and direct URLs, and every Convex read is server-scoped to the viewer's linked swimmer(s); the switcher only ever lists their own.

## Priority Issues

- **[P3] Switcher sits above the page's own header.** For a multi-swimmer parent the "Viewing …" row precedes the greeting/section title. It's clear, but another option is to fold it into the header actions. **Command**: `$impeccable layout`.
- **[P3] Overview PB board is a table on a summary page.** It's the right summary (not a chart), but a very wide roster of events could make Overview long; a "top events" cap could keep it lean. **Command**: `$impeccable distill`.

## Persona Red Flags

**Casey (Mobile)**: The sidebar collapses to the icon rail; each page is a single focused scroll; the switcher wraps. Touch targets are ≥ the house control height.

**Sam (Accessibility)**: Labelled sidebar items with an active state; a real h1 per page; the switcher is a labelled button group with aria-pressed; read-only is stated, not just implied.

## Questions to Consider

- Should the swimmer switcher live in the sidebar header rather than above the page, for a parent with several swimmers?
- Is the Overview the right home for the full PB board, or should it show only the top few events with a link to a fuller board?
