---
target: branch UI changes deep pass + fixes
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-07-07T20-29-50Z
slug: components-dashboard-squadoverview-tsx
---
# Critique v2 — branch UI changes (deeper pass) + fixes applied

Second, deeper review pass scored 33/40 and surfaced two P1s the first pass missed. All P1/P2 findings below were FIXED in commit a472f5f; P3s and design questions remain open.

## Findings (state before fixes)
1. [P1, FIXED] Road's default "All" view bypassed StandardsMissing — showAll defaults true and getStrokeProfile carried no hasStandards flag, so the guided state never showed on the page's landing view. Fixed: flag added to getStrokeProfile; ALL branch renders StandardsMissing.
2. [P1, FIXED] Audit filters silently searched only the loaded page window. Fixed: footer states "N matching — only the M loaded entries were searched" while older rows remain; sort order now always stated.
3. [P2, FIXED] Button and Segmented (both touched by the 44px pass) had no focus-visible ring; Segmented claimed radio semantics without arrow keys. Fixed: shared ring classes; roving tabindex + Arrow/Home/End on Segmented.
4. [P2, FIXED] 44px pass missed DateField interiors (28px calendar trigger/nav, 32px day cells) and the dashboard empty-CTA. Fixed: size-11 lg:size-7 trigger/nav, h-10 lg:h-8 day cells (7-col grid can't fit 44px on a phone; 40px = WCAG 2.5.8 minimum), CTA uses buttonClasses.
5. [P2, FIXED] Error boundary surfaced framework boilerplate in prod (Next replaces server-error messages) and hid the digest. Fixed: only ConvexError messages shown verbatim, digest rendered as "Reference: …".
6. [Minor, FIXED] Viewer-copy flash in StandardsMissing while profile loads (Road + matrix now hold the skeleton); matrix FilterBar hidden when there are no standards to filter; EmptyRoster full-reload navigation → Link; global-error console.error moved to useEffect; role="status" on the two async warning notices.

## Remaining open (P3 / design questions)
- Training-note chart flags are hover-only — untappable on touch (viewer progression). Needs a tap-friendly affordance.
- Server-side audit filtering is the trust-complete fix; the honest footer is the stopgap.
- FirstRunChecklist gates the whole stat grid on any missing flag — consider a banner once real data exists.
- No "why did my cuts change?" moment when a swimmer ages up.

## Score
Pre-fix deep pass: 33/40 (P1s above). With both P1s and all P2s fixed, the surfaces stand at/above the first-pass 35/40; re-run critique after the next UI change to confirm on a live render.
