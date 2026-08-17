---
target: chart surfaces after the Recharts to bklit UI migration
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-08-17T14-24-56Z
slug: chart-surfaces-after-the-bklit-migration
---
# Critique — chart surfaces after the Recharts → bklit UI migration

Targets: `components/progression/ProgressionChart.tsx` (+ `ProgressionScreen`),
`components/compare/ComparisonBarChart.tsx` (+ `CompareScreen`),
`components/attendance/AttendanceInsightsScreen.tsx`, `app/preview/page.tsx`,
and the new shared parts in `components/charts/swim/`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons on load, empty states, filter counts, crosshair + tooltip, and the hovered point now carries a halo (was missing after the migration; fixed this pass) |
| 2 | Match System / Real World | 4 | "Shorter bar = faster", `m:ss:hh` axis labels, stepped cuts that change on a birthday exactly as the standards do |
| 3 | User Control and Freedom | 3 | Filters and a group "Clear" exist; still no single "reset this event" affordance. Unchanged by this migration |
| 4 | Consistency and Standards | 4 | One `ValueAxis`, one tooltip stack, one cut-overlay vocabulary across all four charts; `TIER_STYLE` is the single source for gala colour/dash/glyph |
| 5 | Error Prevention | 4 | Course mandatory before a read; whitelist-derived pickers; cut resolution refuses to borrow across course or age window |
| 6 | Recognition Rather Than Recall | 4 | Legends decode every mark and every gala; bars carry their exact time; no hidden state |
| 7 | Flexibility and Efficiency | 3 | Dense and scannable, but no keyboard path into the chart itself — tooltips are pointer-only. Pre-existing |
| 8 | Aesthetic and Minimalist Design | 4 | Chart is the hero, slim toolbar, no chart junk. bklit's decorative defaults (edge fade, curve smoothing, backdrop blur) are all switched off |
| 9 | Error Recovery | 3 | Empty and no-standards states explain themselves; a failed Convex read still falls back to the generic skeleton rather than a retry |
| 10 | Help and Documentation | 4 | `/preview` now documents the real composition and both cut shapes; captions state the reading direction |
| **Total** | | **37/40** | **Excellent — ship it** |

## Anti-Patterns Verdict

**Does this look AI-generated?** No. The product slop test here is "would a coach fluent in
Linear/Stripe-grade tooling trust it", and the answer is yes for a specific reason: every place the
chart library's default was prettier but less true, the default lost. That is the opposite of the
generated-UI reflex.

**LLM assessment.** Three bklit defaults were actively removed because they made visual claims the
data does not support:

- `curveNatural` on `Line` — a spline between two swims bulges, drawing times the swimmer never
  swam. Now `curveLinear`.
- `fadeEdges` on by default — washes out the first and last points, and the last swim is usually
  the PB.
- `[0, max × 1.1]` y domain — a zero baseline flattens a whole season into the top ~5% of the plot.

The one remaining decorative default, `backdrop-blur-md` on the tooltip panel, is switched off via
`SWIM_TOOLTIP_PANEL`; glassmorphism is an explicit ban. No gradients, no hero-metric tiles, no
eyebrow labels, no side-stripe borders, no over-rounded cards.

**Deterministic scan.** `detect.mjs --json` over `components/charts/swim`,
`components/progression`, `components/compare`, `components/attendance`, `app/preview`,
`components/analysis`, and `app/globals.css`: **`[]`, exit 0. Zero findings.** No false positives to
discount. The detector and the manual review agree; both of the real defects this pass found were
things the detector cannot see (a missing hover state, and a contrast failure inside an SVG `fill`
attribute).

**Visual overlays.** Not available. This sandbox cannot reach `fonts.googleapis.com`, and
`app/layout.tsx:2` loads Outfit through `next/font/google`, so every route returns 500 in dev and
`next build` fails at the font fetch. Pre-existing and unrelated to these changes — confirmed by
`curl` to the font host returning exit 56. Fallback signal: source review plus the CLI detector
plus 296 unit tests. **These charts have not been seen rendered.**

## Overall Impression

The migration held the line on correctness, which was the risk. The chart layer changed engines
underneath four surfaces and the domain rules — course never borrowed, cuts stepping on birthdays,
meet-only PBs, eligible galas only — all survived intact, with more of them now pinned by tests than
before.

What works less well is that the honesty is carried almost entirely by *code comments*. The
`yDomain`, `curveLinear` and `fadeEdges` decisions are each explained at their call site, which is
right, but a reader of the *interface* has no way to know the y axis starts near the world record
rather than at zero. The axis simply begins at an unexplained number.

Biggest opportunity: say the quiet part out loud in the UI. One line under the progression chart
naming the floor would turn an invisible correctness decision into visible authority — exactly the
"exact, legible, unshowy" voice PRODUCT.md asks for.

## What's Working

1. **One vocabulary across four charts.** `ValueAxis`, the tooltip stack, `GalaCutOverlay` /
   `ValueThresholds` and `TIER_STYLE` mean a gala looks and reads identically on the progression
   line, the comparison bars and the preview page. Before this pass the tooltip card was
   copy-pasted four times and drifting; there is now one of it.
2. **The stepped cut overlay is the honest drawing, and it is tested.** An age-graded standard
   renders as dated segments joined by a vertical riser at the birthday, not one averaged rule.
   `cutSegment` has five tests including two contradictory-input cases (a riser carrying a stale
   `x2`, and `full` set alongside `y2`) that both resolve toward "stay vertical" rather than
   silently drawing a cut for one age across every age.
3. **The group tooltip got better, not just different.** Recharts showed `payload[0]` — one
   arbitrary swimmer. The bklit `content` render prop receives the whole row, so every swimmer who
   actually swam on the hovered date is listed, separated by a `gray-100` rule rather than nested
   cards.

## Priority Issues

### [P2] The y-axis floor is correct and completely unexplained to the reader
**Why it matters.** The progression axis starts one second under the world record. A coach reading
it sees an axis that begins at, say, 1:41 with no stated reason, and the natural inference is "this
chart starts at an arbitrary number" — which erodes exactly the trust the decision was made to
earn. The `aria-label` explains it to screen-reader users; sighted users get nothing.
**Fix.** One muted caption under the plot: "Axis floor: 1 s under the world record (1:41.00)."
Sits beside the existing "estimate only" projection caveat, in the same register.
**Suggested command.** `$impeccable clarify components/progression/ProgressionChart.tsx`

### [P2] Charts are pointer-only; there is no keyboard path to a value
**Why it matters.** Every tooltip on all four surfaces requires hover or tap. A keyboard user, or a
coach on a laptop trackpad mid-poolside, cannot read a specific swim's date and type at all. The
comparison chart is covered by its table and attendance now has an `sr-only` list, but the
progression chart's per-point detail (swim type, PB flag, exact date) exists nowhere else.
**Fix.** Make the plot focusable and step the crosshair with arrow keys, or add a collapsible
"All swims" table beneath the chart mirroring the comparison screen's pattern.
**Suggested command.** `$impeccable audit components/progression/ProgressionChart.tsx`

### [P3] Two swimmers with the same name collide in the comparison chart
**Why it matters.** `SwimBars` places bars by `barScale(bar.category)` where category is the
swimmer's display name, so two swimmers called "Sam Patel" resolve to one band and their bars draw
on top of each other. Pre-existing (Recharts keyed on `dataKey="name"` the same way) and unlikely
at club scale, but silent when it happens.
**Fix.** Key the band on `swimmerId` and render the name via a lookup for the label.
**Suggested command.** `$impeccable harden components/compare/ComparisonBarChart.tsx`

### [P3] No retry on a failed read, only the loading skeleton
**Why it matters.** `data === undefined` renders a skeleton, which is right for pending. A Convex
read that fails leaves the skeleton up forever and the user has no action.
**Fix.** Distinguish pending from failed and offer a retry. Applies across the app, not just these
charts.
**Suggested command.** `$impeccable harden components/attendance/AttendanceInsightsScreen.tsx`

## Fixed during this pass

Three findings from the review were real defects and were fixed rather than filed:

- **[was P1] Threshold and legend labels failed contrast.** Gala hues are tuned to read as 1.5px
  strokes; at 11px they fail badly as text. `--color-tier-sanj` (#f79009) is ~2.4:1 on white against
  a 4.5:1 requirement. `TIER_STYLE` now carries an `ink` field (`--color-tier-*-ink`, ~5.5:1) used
  for every label and glyph, with `color` reserved for strokes and swatches. The comparison chart
  had this defect *before* the migration too — `/preview` was the only surface that got it right.
- **[was P2] No hovered-point feedback.** Recharts' `activeDot` enlarged the point under the
  cursor; nothing replaced it. On a dense season, or a group chart where one crosshair serves
  several swimmers, the tooltip did not say which point it described. Added `ActiveHalo`, split into
  its own component so pointer motion re-renders one circle rather than the whole mark grid.
- **[was P1] The attendance chart had no accessible alternative.** bklit marks its SVG
  `aria-hidden`, and unlike the other two this card has no table beneath it, so a screen reader got
  the heading and nothing else. Added an `sr-only` list of squad, rate and session counts.

## Persona Red Flags

**Priya (Coach, poolside, primary persona).** Reads a chart on a laptop between heats, often
one-handed. Two flags: the y-axis floor is unexplained, so her first reaction to the progression
chart is to work out what the bottom number means rather than to read the trend; and she cannot get
a swim's detail without a precise hover, which is the hardest interaction to land on a trackpad in a
hurry. She is well served by the bars carrying their exact times — no hover needed for the primary
comparison.

**Jordan (First-timer / parent viewer, on a phone).** The legends do their job: every mark and every
gala is decoded in words, not colour alone. Two flags: nothing tells them a shorter bar is faster
until they find the caption above the chart, and the school-gala diamond reads as "warning" in the
amber tone before they read the legend that says "unofficial". The tone is deliberate and correct,
but the first impression is alarm rather than "not an official time".

**Alex (Power user, keyboard-first).** Blocked. No keyboard access to any chart value, no shortcut
to switch event or course, no way to tab to a data point. He will use the tables and ignore the
charts entirely — which is a legitimate fallback on three of the four surfaces and no fallback at
all on the progression chart.

## Minor Observations

- `aspectRatio=""` appears on all four charts to opt out of bklit's default `2 / 1` box. It works
  (empty string is falsy in the guard, and unset in CSS) but reads as a typo. A named
  `FILL_PARENT = ""` constant, or an `aspectRatio={undefined}`-aware guard upstream, would say what
  it means.
- The `MaybeStatic` reduced-motion wrapper is now defined identically in three files. It is four
  lines, so duplication is cheap, but it belongs in `components/charts/swim/` with the rest.
- `chartCssVars` in the vendored context names six tokens (`--chart-segment-*`,
  `--chart-marker-badge-*`, `--chart-indicator-*`) that belong to bklit components we did not
  vendor. Nothing references them, so they are inert, but the first person to use
  `chartCssVars.segmentLine` will get a transparent stroke and no clue why.
- `ValueAxis` requires its `width` prop to match the chart's `left` margin by hand. Two numbers that
  must agree, in two places, with nothing enforcing it.
- The comparison chart's value axis is zero-based, which is correct there (a bar length *is* the
  time), while the progression axis is not. Both are right; nothing on either screen explains why
  they differ, and a coach moving between them may notice.

## Questions to Consider

- The y-axis floor, the "eligible galas only" rule and the meet-only PB rule are three invisible
  correctness decisions. Should the interface state them, or does saying them out loud make the tool
  louder than the data?
- The progression chart is the only surface with no tabular fallback. Is that a gap, or is the chart
  genuinely the only useful shape for "trend over a season"?
- Four charts now share one vocabulary. Is the stroke-profile wheel — deliberately outside that
  vocabulary — still recognisably part of the same product, or has it drifted into being a different
  kind of object?
- `/preview` documents four galas because nobody is eligible for five. Would showing all five, marked
  as impossible, teach the entry-window rule better than quietly showing only what is reachable?
