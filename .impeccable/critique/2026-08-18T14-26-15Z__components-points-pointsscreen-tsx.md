---
target: /points screen and stroke-profile radar
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-08-18T14-26-15Z
slug: components-points-pointsscreen-tsx
---
## Target
`/points` (PointsScreen, PointsBarChart, PointsTrendChart) plus the re-based stroke-profile radar.

Assessment independence: degraded (sub-agents not used in this session; A and B run sequentially).
Detector (`detect.mjs`): 0 findings across `components/points`, `app/(app)/points`, `StrokeRadar.tsx`.

## AI slop verdict
Passes. No gradient text, no glassmorphism, no icon-tile-above-every-heading, no eyebrow kickers,
no identical card grid, no over-rounded cards (`rounded-2xl` matches the system), no ghost-card
border+wide-shadow pairing. Two cards on the page, no nesting. Colour is used for stroke identity
and neutral grid ink only; `aqua` is not used as a data channel, per DESIGN.md 3c.

## Heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Skeleton mirrors real block heights; four self-explaining empty states |
| 2 | Match with the real world | 4 | The sport's own vocabulary throughout; no invented "aqua points" |
| 3 | User control and freedom | 4 | Selection lives in `?swimmer=`, so back/forward and links work |
| 4 | Consistency and standards | 3 | Bar length means the opposite of `/compare` (labelled, not eliminated) |
| 5 | Error prevention | 4 | No free text; unscoreable events omitted, never drawn at zero |
| 6 | Recognition over recall | 4 | Every bar numbered, every line captioned, table repeats all values |
| 7 | Flexibility and efficiency | 3 | One path: no course control, no squad view, no export |
| 8 | Aesthetic and minimalist | 4 | Chart is the hero; headline carries no card of its own |
| 9 | Error recovery | 3 | Empty states name cause and next step; a server throw still hits a boundary |
| 10 | Help and documentation | 4 | Scale, direction, base-time year and metric all named in context |
| **Total** | | **37/40** | **Excellent** |

## Issues found and fixed in this pass

- **P0 — Dashed reference lines read as qualifying cuts.** Everywhere else in this app a dashed
  line across a bar chart is a gala standard (`ValueThresholds` on comparison and road). Reusing the
  identical mark for arbitrary round numbers is a false claim in a qualifying-focused product.
  Fixed: an explicit caption names them as scale markers, not cuts, and DESIGN.md records the rule.
- **P1 — Headline number sat in its own card**, which is the metric-tile shape PRODUCT.md lists as an
  anti-reference and made one number compete with the chart it summarises. Fixed: plain type on the
  page, one fewer card.
- **P1 — Trend chart drew a single dot on a 60-day axis** for a swimmer with one meet, inviting a
  reading that is not there. Fixed: below two meets the section says so in a sentence.
- **P1 — Trend chart had no accessible equivalent** while the bar chart did. Fixed: an `sr-only`
  table, as a sibling of the `role="img"` box rather than a child of it.
- **P1 — Single rigid path, no shareable state.** Fixed: the swimmer selection moved into the URL,
  so a points page can be linked and the back button steps through swimmers.
- **P2 — Dead `status` loading prop** on PointsBarChart that no caller passed. Removed.
- **P2 — Tooltip re-derived its date** from the nudged axis position. Fixed: the row carries the
  meet's real `swimDate`, locked by a test.

## Remaining, accepted

- The bar-length inversion against `/compare` is inherent to plotting a score rather than a time. It
  is named on screen ("Longer is better") and every bar carries its number, so nothing is read off
  length alone.
- The stroke radar plots points on long course and percent of world record on short course. This is
  two metrics in one chart and was flagged as such; the coach chose it over losing short-course
  stroke profiles. Mitigated by naming the active metric in the ring labels, both captions and the
  accessible table.
- No course control until the short-course base times are supplied.
