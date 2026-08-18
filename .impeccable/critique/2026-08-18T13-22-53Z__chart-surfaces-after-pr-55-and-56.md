---
target: chart surfaces after PR #55 and #56
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-08-18T13-22-53Z
slug: chart-surfaces-after-pr-55-and-56
---
# Critique — chart surfaces after PR #55 and #56

Targets: `components/compare/`, `components/season/`, `components/road/`,
`components/progression/`, `components/profile/StrokeRadar.tsx`,
`components/attendance/AttendanceHeatmap.tsx`, and the shared parts in
`components/charts/swim/`.

Third pass on these surfaces. Pass 1 (post-migration) scored 37; pass 2, after the
bklit chart work in #55/#56, scored 28 on three P1s; pass 3 scored 30 after the fix
round introduced four regressions of its own. This is pass 4, and the first one where
every chart under review has actually been rendered in a browser before scoring.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons, empty states, filter counts, tooltip anchored to the hovered bar rather than the top of the plot; a qualified `/road` row now says "✓ Qualified" instead of drawing nothing |
| 2 | Match System / Real World | 4 | `m:ss:hh` axis labels, "shorter = faster" everywhere, per-course cuts never borrowed, `/season` reads "Time dropped" and so drops the double negative on its bar labels |
| 3 | User Control and Freedom | 3 | Filters, per-page target toggle and a group "Clear" exist; still no single "reset this event". Pre-existing, unchanged |
| 4 | Consistency and Standards | 4 | One `ValueAxis` / `ValueThresholds` / `SwimBars` / tooltip vocabulary across six surfaces; `TIER_STYLE` remains the single source for gala colour, dash and glyph; `/road` single-gala no longer inverts the app-wide bar semantics |
| 5 | Error Prevention | 4 | Whitelist-derived pickers, entry-window gate, per-event coverage zones, and bands are no longer drawn for a gala an event has no cut for |
| 6 | Recognition Rather Than Recall | 4 | Compare carries the gala as a text badge column, not hue alone; heatmap legend swatches render the same SVG pattern node the cells do; group progression legend decodes all four point marks; radar names unraced strokes in words |
| 7 | Flexibility and Efficiency | 3 | No keyboard path into any chart VALUE — every tooltip is pointer-or-tap. The heatmap's month jump is now a real button row, but that is navigation, not data access. Open across four critiques |
| 8 | Aesthetic and Minimalist Design | 4 | `/road` went from two charts plus four lists to one chart plus one list; bar textures removed; bklit's glow, edge fade and curve smoothing all off; axis ticks thin by stride so labels never overprint |
| 9 | Error Recovery | 3 | Empty and no-standards states explain themselves; a failed Convex read still lands on the generic skeleton with no chart-level retry. Open |
| 10 | Help and Documentation | 3 | Captions state the reading direction on every chart and the radar explains its scale in words, but `/preview` still documents only the line chart and the qualification bars — the radar, the heatmap and the `/road` bar family are absent from the component preview |
| **Total** | | **36/40** | **Excellent — clears the 35 gate** |

## Anti-Patterns Verdict

**Does this look AI-generated?** No. `detect.mjs --json` over all seven directories
returns `[]`, exit 0. More to the point, the defects this round fixed were all of the
opposite kind: a chart library's default that looked fine and said something untrue.

## What the fix round actually closed

**P1 — attendance statuses were four flat hues.** `STATUS_LEVEL_STYLES` set
`patternColor` equal to `color`, so the hatching was stroked in the tile's own colour
and vanished. Each pattern now strokes in a contrasting value (`gray-25` on the
saturated fills, `gray-600` on the light one), and the legend uses the vendored
`HeatmapLegendSwatch`, which renders the same pattern node the cells do — matching by
construction rather than by CSS approximation.

**P1 — same-named swimmers collapsed into one bar.** `scaleBand` interns its domain and
both bar charts passed the display NAME as the category, so two "Jane Smith" rows drew
on top of each other while the list below showed two. Bands are keyed on `swimmerId`
now, with a `labelFor` LOCAL EDIT on `BarYAxis` resolving the name for the axis.

**P1 — `/compare` carried the highest gala met in hue alone.** The chart is
`aria-hidden` and the leaderboard had no tier column, so the datum existed only as one
of six colours. A `TierBadge` column restores the text channel.

**Four regressions the third pass caught, all from the second pass's own fixes.**
Zero-length bars drew nothing where "at the cut" and "0.02% over" mean opposite things
(sliver floor in `SwimBars`); three card headers still described the deleted single-gala
chart; the level-0 legend swatch was bordered in its own colour; and `/season`'s bar
labels kept a minus sign the restored axis had already made redundant.

**Two collisions only rendering could find.** Threshold labels overprinted as "SAN2"
when three cuts landed within ~26px, and the value axis printed `0:00:0020:00:0040:01`.
Labels now degrade to their glyph as a set when they cannot fit, and ticks thin by
STRIDE rather than greedily — greedy dropping left `/season` at 0% / 4% / 10%, three
labels at two intervals, which reads as a non-linear axis.

## Open, in priority order

1. **No keyboard path to any chart value** (H7). Progression per-point detail — swim
   type, PB flag, meet name — exists nowhere but the tooltip. Deferred four passes
   running; it wants its own.
2. **No chart-level error recovery** (H9). A failed query renders the loading skeleton
   forever, with no retry distinct from loading.
3. **`/preview` does not cover the new chart vocabulary** (H10). The radar, the season
   heatmap and the `/road` bar family are all absent, so the one page that documents
   composition documents half of it.
4. **Horizontal scroll region needs a focus target.** The attendance strip scrolls
   rather than shrinking below `md`, which fixes the 4px-cell smear, but an
   `overflow-x: auto` region should be reachable by keyboard. The month-jump row
   mitigates rather than solves it.

## Run Notes

- Target slug: `chart-surfaces-after-pr-55-and-56`
- Ignore list: none (`.impeccable/critique/ignore.md` absent)
- Assessment independence: **degraded** — sub-agents not used in this session; A and B
  run sequentially, A recorded before the detector ran
- CLI detector: `detect.mjs --json` over seven directories, `[]`, exit 0
- Browser: temporary unauthenticated harness route rendering `/compare`, `/season`,
  `/road` and the attendance strip against fixtures, screenshotted with the
  pre-installed Chromium at deviceScaleFactor 2, then deleted. Overlay injection not
  attempted; the harness was the evidence path
- Live server: dev server on 3112, stopped before reporting
- Temp files: harness route, `.env.local` and the `middleware.ts` patch all reverted
- Verification: `tsc --noEmit` clean, `eslint` 0 errors, 399 tests passing,
  `next build` clean with no harness route in the manifest
