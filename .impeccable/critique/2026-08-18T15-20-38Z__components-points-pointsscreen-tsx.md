---
target: /points compare mode
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-08-18T15-20-38Z
slug: components-points-pointsscreen-tsx
---
## Target
`/points` in **compare** mode: PointsScreen's mode toggle and chips picker, PointsCompareChart,
pointsCompare.ts.

Assessment independence: degraded (sub-agents not used; A and B run sequentially).
Detector (`detect.mjs`): 0 findings across `components/points`.
Rendered and inspected in a real browser via a temporary `/preview` harness (since reverted).

## AI slop verdict
Passes. One card, one chart, one legend, one caption. No gradient text, no glassmorphism, no
eyebrow kickers, no metric tiles, no over-rounded cards. Colour carries swimmer identity only,
and the legend names it.

## Heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Skeleton holds layout; three distinct, self-explaining empty states |
| 2 | Match with the real world | 4 | "Compare across strokes / distances" is how a coach says it |
| 3 | User control and freedom | 4 | Mode, swimmers, axis and pinned event all in the URL; chips remove individually |
| 4 | Consistency and standards | 3 | First vertical bar chart here, and taller=better inverts every other one |
| 5 | Error prevention | 4 | Cap enforced both sides; stale ids filtered; invalid pinned event falls back |
| 6 | Recognition over recall | 4 | Chips show who is on the chart; tooltip ranks the whole group; sr-only table |
| 7 | Flexibility and efficiency | 3 | Deep-linkable and keyboard-navigable, but one course and no bulk add |
| 8 | Aesthetic and minimalist | 4 | Redundant reference lines and their defensive caption removed this pass |
| 9 | Error recovery | 3 | Empty states name cause and fix; a server throw still hits a boundary |
| 10 | Help and documentation | 4 | Heading names selection and course; sub-line names direction, scale and base year |
| **Total** | | **37/40** | **Excellent** |

## Issues found and fixed in this pass

- **P0 — the x-axis would have printed band keys.** `BarXAxis` renders its accessor's value
  verbatim and has no `labelFor` hook the way `BarYAxis` does, so `xDataKey="category"` would
  have shown `50|FREE` instead of `Free`. Caught before render; fixed by banding on `label`,
  with a test locking label uniqueness per chart so it cannot regress.
- **P1 — reference lines duplicated the value axis.** Rendering showed the dashed 400/600/800
  markers reprinting numbers the axis already prints at gridlines of its own, with a caption
  existing only to defend a mark that means "qualifying cut" everywhere else in this app.
  Removed from all three points charts; the helper and its tests deleted rather than left dead.
  This reverses an earlier decision, and the reversal is recorded in DESIGN.md with the reason.
- **P2 — `valueDomain` was inert in vertical orientation.** Fixed in the vendored chart, which
  is what lets the fixed 0-1000 axis hold; verified in a browser with all values under 500.

## Remaining, accepted

- Taller=better here versus shorter=faster on every other bar chart. Inherent to plotting a
  score rather than a time; named on screen and in DESIGN.md.
- The chips picker duplicates StrokeProfileScreen's rather than sharing one component.
  Extracting a shared picker was explicitly ruled out of this change.
- Long course only, until the short-course base times are supplied.
