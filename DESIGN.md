# Swim Tracker — Design System (DESIGN.md)

Design language derived from the TailAdmin reference the coach chose: a clean, professional
admin aesthetic — soft off-white canvas, white cards with soft layered shadows, an indigo brand
accent, Untitled-UI grays, and the **Outfit** typeface. This file is the single source of truth
for tokens. **No ad-hoc hex or fonts in components** — use these tokens only.

Impeccable still governs craft: this is the *system*, and `/impeccable critique` enforces
consistency, hierarchy, and spacing **within** it (≥ 35/40). If a critique dings the intentional
soft shadows or cards themselves, that's a style choice we are keeping — fix real inconsistencies,
don't strip the system to chase points.

---

## 1. Typeface
- **Outfit** (Google, via `next/font/google`), latin subset. Set on `<body>`.
- Base body text **14px** (`text-sm`). Muted body copy uses `gray-500`; primary text `gray-800/900`.
- **Swim times always use tabular figures:** `font-variant-numeric: tabular-nums` (a `.tnums`
  utility) so columns of `m:ss:hh` align. Non-negotiable on every time cell, PB, and gap value.

## 2. Colour ramp (Tailwind v4 `@theme` — put in globals.css)
```css
@import 'tailwindcss';
@custom-variant dark (&:is(.dark *));

@theme {
  --font-outfit: Outfit, sans-serif;

  /* Brand — the signature indigo accent */
  --color-brand-25:#f2f7ff; --color-brand-50:#ecf3ff; --color-brand-100:#dde9ff;
  --color-brand-200:#c2d6ff; --color-brand-300:#9cb9ff; --color-brand-400:#7592ff;
  --color-brand-500:#465fff; --color-brand-600:#3641f5; --color-brand-700:#2a31d8;
  --color-brand-800:#252dae; --color-brand-900:#262e89; --color-brand-950:#161950;

  /* Neutrals (Untitled-UI gray) */
  --color-gray-25:#fcfcfd; --color-gray-50:#f9fafb; --color-gray-100:#f2f4f7;
  --color-gray-200:#e4e7ec; --color-gray-300:#d0d5dd; --color-gray-400:#98a2b3;
  --color-gray-500:#667085; --color-gray-600:#475467; --color-gray-700:#344054;
  --color-gray-800:#1d2939; --color-gray-900:#101828; --color-gray-950:#0c111d;
  --color-gray-dark:#1a2231;

  /* Semantic */
  --color-success-50:#ecfdf3; --color-success-500:#12b76a; --color-success-600:#039855;
  --color-error-50:#fef3f2;   --color-error-500:#f04438;   --color-error-600:#d92d20;
  --color-warning-50:#fffaeb; --color-warning-500:#f79009; --color-warning-600:#dc6803;
  --color-blue-light-500:#0ba5ec; --color-blue-light-600:#0086c9;

  /* Soft layered shadows (the "TailAdmin" depth) */
  --shadow-theme-xs: 0 1px 2px 0 rgba(16,24,40,.05);
  --shadow-theme-sm: 0 1px 3px 0 rgba(16,24,40,.1), 0 1px 2px 0 rgba(16,24,40,.06);
  --shadow-theme-md: 0 4px 8px -2px rgba(16,24,40,.1), 0 2px 4px -2px rgba(16,24,40,.06);
  --shadow-theme-lg: 0 12px 16px -4px rgba(16,24,40,.08), 0 4px 6px -2px rgba(16,24,40,.03);
  --shadow-focus-ring: 0 0 0 4px rgba(70,95,255,.12);
}
```

## 3. App-semantic tokens (qualifying galas)
Mapped onto the reference palette so they harmonise. **Galas are never colour-only — every gala
badge carries a text label** (`SANS` / `SANY` / `SANJ` / `L3` / `L2`), per the domain rules.

With five galas these hues are a **categorical identity set, not an ordered ramp**: difficulty
order is carried by `GALA_ORDER` (in `lib/galas.ts`) and by the label, *never* by colour. They
split into two families that match the two kinds of gala:

- **age-graded ladder** — sapphire (L2, entry) → purple (L3, mid) → gold (SANJ, top of the ladder)
- **open senior pair** — pink (SANY) and rose (SANS): one cut for every age, entry by age window

Grouping the two open galas chromatically is deliberate — they are the same *kind* of gala, and
their labels do the discriminating. Each hue is that gala's ONE colour everywhere it appears
(badges, cut lines, progress bars, the matrix). All are deliberately clear of the reserved signals
(green = qualified, red = error, brand indigo = action) so a gala is never mistaken for a state.
```css
:root {
  --tier-sans:  #e31b54;  /* rose — SA Senior Nationals (open, 15+) */
  --tier-sany:  #c11574;  /* deep pink — SA National Youth (open, 17–25) */
  --tier-sanj:  #f79009;  /* gold — top of the age-graded ladder */
  --tier-l3:    #9333ea;  /* vivid purple — mid */
  --tier-l2:    #0086c9;  /* sapphire / deep sky — entry */
  --tier-none:  #98a2b3;  /* gray-400 — no standard met */
  --qualified:  #12b76a;  /* success green — used ONLY for qualified states */
}
```

## 3b. Stroke identity palette (categorical — the stroke-profile wheel)
Five **categorical** hues that group events by stroke (never a scale, never ranked). Used only where
a view groups by stroke — chiefly the radial stroke-profile wheel, where each stroke forms a
contiguous coloured arc. Chosen to stay clear of the `--tier-*` (gold/indigo/sky) and semantic
(green/red/amber) signals so a stroke arc is never mistaken for a tier or a status. In the wheel the
three reference rings stay **neutral grey** — colour encodes **stroke only**; a text label always
accompanies the swatch (legend), so it is never colour-only.
```css
@theme {
  --color-stroke-free:   #0e9384;  /* teal    — Free */
  --color-stroke-back:   #7839ee;  /* violet  — Back */
  --color-stroke-breast: #dd2590;  /* magenta — Breast */
  --color-stroke-fly:    #e04f16;  /* orange  — Fly */
  --color-stroke-im:     #1570ef;  /* blue    — IM */
}
```

## 3c. Water accent + vibrance layer (chrome only — NEVER data)
The one energetic addition to the system: a single **aqua** water tone plus a **deep-water header
band**, used to make the product feel alive without touching the meaning of any data. The rule is
absolute and mirrors the discipline already applied to brand indigo: **aqua never encodes a tier, a
stroke, a status or a chart series** — it lives only in chrome (the header band), motion (the ambient
wave), focus energy, and the celebration moment. That is what lets it never be mistaken for a tier or
a state. `--color-aqua-ink` (#0e7490) is the AA-safe text tone on white (4.6:1); raw `--color-aqua-500`
is a fill / large-element colour only.

**"Aqua" is a colour, never a metric.** The scoring metric is called **World Aquatics points** in
every surface, label and axis — never "aqua points", and never painted in the aqua ramp. Points are
a data category, and the rule above forbids aqua from carrying one; the points charts colour by
stroke and use the neutral grid ink for their reference lines.
```css
@theme {
  --color-aqua-50:#ecfeff; --color-aqua-100:#cff9fe; --color-aqua-400:#22d3ee;
  --color-aqua-500:#06b6d4; --color-aqua-600:#0891b2;
  --color-aqua-ink:#0e7490; --color-aqua-deep:#155e75;
  /* Deep-water header band (indigo-night → teal), carrying the title/greeting. */
  --color-water-1:#0b2b5c; --color-water-2:#123f7a; --color-water-3:#0e5a73;
}
```
- **Deep-water header:** `PageHeader variant="water"` renders the breadcrumb + title (+ actions) inside
  the gradient band, light-on-dark, with a slow ambient wave (`.water-wave`, motion-safe). Actions on
  the band must be styled for a dark ground (white / translucent), not brand-on-white.
- **Celebration moment (PB / qualification):** the swimmer-register cheer. Confetti auto-plays **once**
  on mount, replayable, withheld under `prefers-reduced-motion`. The award medal is **tinted by the
  actual tier** (gold SANJ / purple L3 / sky L2) so tier meaning is reinforced, and the tier is always
  **named** (heading + chip) — never colour-only. Celebration reuses the colours that already mean
  success — gold (top tier) + green (qualified) — plus the aqua splash, so nothing decorative steals a
  signal. Times in the card stay **tabular**.
- Motion classes (`.water-wave`, `.celebrate-shimmer`, `.celebrate-pop`) all fall under the global
  `prefers-reduced-motion` reset.

## 4. shadcn/ui variable mapping (`:root` + `.dark`)
So shadcn components (sidebar, breadcrumb, sonner, buttons, inputs) inherit this palette instead of
their defaults. Map, don't fight.
```css
:root {
  --radius: 0.75rem;                 /* cards use rounded-2xl; controls rounded-lg */
  --background:#f9fafb; --foreground:#101828;
  --card:#ffffff;       --card-foreground:#101828;
  --popover:#ffffff;    --popover-foreground:#101828;
  --primary:#465fff;    --primary-foreground:#ffffff;
  --secondary:#f2f4f7;  --secondary-foreground:#344054;
  --muted:#f9fafb;      --muted-foreground:#667085;
  --accent:#ecf3ff;     --accent-foreground:#465fff;   /* nav/hover tint = brand-50 */
  --destructive:#f04438;--destructive-foreground:#ffffff;
  --border:#e4e7ec;     --input:#e4e7ec;  --ring:#465fff;
}
.dark {
  --background:#101828; --foreground:#f9fafb;
  --card:#1a2231;       --card-foreground:#f9fafb;
  --popover:#1a2231;    --popover-foreground:#f9fafb;
  --primary:#465fff;    --primary-foreground:#ffffff;
  --secondary:#1d2939;  --secondary-foreground:#e4e7ec;
  --muted:#1d2939;      --muted-foreground:#98a2b3;
  --accent:#252dae;     --accent-foreground:#c2d6ff;
  --border:#1d2939;     --input:#1d2939;  --ring:#465fff;
}
```

## 5. Component conventions (match the reference)
- **Card:** `rounded-2xl border border-gray-200 bg-white shadow-theme-sm` (dark: `border-gray-800 bg-gray-dark`). Padding `p-5`/`p-6`. **No card-in-card** — one card, internal sections divided by `border-gray-100`.
- **Table:** header row `bg-gray-50 text-gray-500 text-xs uppercase`; row borders `border-gray-200`; body text `text-gray-700 text-sm`; **time columns right-aligned + tabular-nums**. Horizontal scroll uses the thin `custom-scrollbar`.
- **Sidebar (shell):** `290px` expanded / `90px` icon rail. Menu item `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium`. **Active** = `bg-brand-50 text-brand-500` with `text-brand-500` icon; inactive = `text-gray-700 hover:bg-gray-100`, icon `text-gray-500`. Active route's group auto-expands.
- **Primary button:** `bg-brand-500 hover:bg-brand-600 text-white rounded-lg shadow-theme-xs`. Secondary: `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`.
- **Input/select:** `rounded-lg border border-gray-300 bg-transparent text-sm`; focus `ring` = brand (`--shadow-focus-ring`).
- **Badge (tier/status):** small pill, `--tier-*` background tint + matching text + a label. Qualified uses `--qualified`.
- **Toasts (Sonner):** neutral surface + border; success/error/warning use the semantic colours only; brand indigo for any action link. Subtle slide+fade; respect `prefers-reduced-motion`.
- **Focus ring** everywhere: `--shadow-focus-ring` (brand tint), not a hard outline.
- **Scrollbar:** thin custom scrollbar (6px, `gray-200` thumb; dark `white/10`).

## 5b. Chart layer (bklit UI, vendored)
Charts are **bklit UI** — a shadcn registry built on Visx — vendored into `components/charts/`.
Treat that directory as **third-party**: a future `npx shadcn@latest add @bklit/...` will overwrite
it, and it is excluded from eslint for that reason. Our own chart parts live in
`components/charts/swim/`, which is linted and tested normally; its `index.ts` lists what each one
exists for and why bklit has no equivalent.

**Eight deliberate edits do live in the vendored tree**, each marked `LOCAL EDIT` in a comment
naming the upstream behaviour it overrides:

| Edit | Where | Why |
|---|---|---|
| `yDomain` | time-series shell, `line-chart.tsx` | Upstream pins all-positive data to a **zero baseline**, which flattens a whole season's trajectory into the top of the plot. |
| `xLabelFormat` | time-series shell, `line-chart.tsx` | Upstream hard-codes a month/day format that drops the year — unreadable across seasons. |
| `valueDomain` | `bar-chart.tsx` | Our bars come from `SwimBars`, so bklit finds no `dataKey` to scan and falls back to `[0, 110]`. |
| `maxLabelWidth` | `bar-y-axis.tsx` | The category gutter has to size to the longest swimmer name without clipping or over-reserving. |
| **null metric values** | `radar-area.tsx`, `radar-context.tsx` | Upstream coerces a missing metric to `0`, drawing "never raced this stroke" identically to "slowest possible at it". A null now breaks the polygon. |
| `labelFor` | `bar-y-axis.tsx` | Upstream uses a band's KEY as its LABEL, forcing them to be one string. `bar-chart.tsx` feeds the key domain to `scaleBand`, which interns it — so two swimmers named "Jane Smith" collapsed into one band while the table beside the chart listed two. Charts now key on the swimmer id and label by lookup. |
| **skip missing points** | `series-path-utils.ts` | Upstream coerced a missing value to `y: 0`, the TOP of the plot. Invisible on a one-series chart; on the group progression chart every date one swimmer raced and another did not spiked the other's line to the ceiling. Missing rows are now dropped, so a line joins that swimmer's own consecutive races. |
| **bar tooltip anchor** | `tooltip/chart-tooltip.tsx` | Upstream anchors the panel to `lines[0]` and falls back to `0` with no line configs — which is every chart where `SwimBars` draws the bars, so the tooltip pinned to the top of the plot instead of the hovered bar. Now falls back to the hovered bar's band centre. |

Most of these are one shape of the same problem: the upstream default is right for counting web
analytics and wrong for swim times. The edits with real logic keep it in **our** tree —
`components/charts/swim/radarPaths.ts` and `components/charts/swim/barTooltipAnchor.ts`, both
linted and tested — so the vendored diff is an import rather than an algorithm. Prefer that shape
for any future edit big enough to need one; where the edit is a one-line guard, test it from
`components/charts/swim/` instead (see `seriesPathPoints.test.ts`).

Three of these eight are the SAME upstream habit: a missing value silently becomes `0`. It is
worth assuming the next vendored chart does it too, because none of them is visible to the
typechecker, the linter or the detector — all three shipped through a green build and were only
caught by rendering the chart.

**Theming:** bklit ships its own greyscale `--chart-*` palette; every value is repointed at the
ramp in §2/§3 (`app/globals.css`), in both themes. A chart never introduces a colour the rest of
the app does not have. `--chart-1..5` are bklit's default series palette and mirror `SERIES_COLORS`.

**Re-pulling from the registry — three things it does every time, all of which must be undone:**
1. **Never pass `--overwrite`.** It silently reverts the `LOCAL EDIT`s above *and* the two of our
   own component names registered in `chart-child-passthrough.ts`'s underlay set (`GalaCutOverlay`,
   `ValueThresholds`) — which, unfixed, draws qualifying-cut lines on top of the data instead of
   under it. `shadcn add` prompts per existing file; answer **no** to all of them
   (`yes N | npx shadcn@latest add @bklit/...`).
2. It re-appends its greyscale `--chart-1..5` into the **dark** block of `app/globals.css`,
   overriding the series hues that block deliberately does not flip. Delete those five lines.
3. It emits three malformed self-referential lines — `--chart-line-primary: var(----chart-line-primary)`
   and friends, with four hyphens. They duplicate tokens already defined above. Delete them.

Vendored **subdirectories** need their own eslint ignore entry (`components/charts/tooltip/**`,
`components/charts/heatmap/**`); the top-level ignore is one level deep only. `components/charts/swim/**`
stays linted.

**`motion` and `@number-flow/react` arrive as bklit dependencies. They are NOT licence for
decorative animation** — §6 and the `prefers-reduced-motion` rule still hold in full. Charts opt out
of the enter reveal via bklit's own `StaticChartPreviewProvider` when motion is reduced.

**Two visualisations are deliberately NOT bklit** and must stay hand-built: the stroke-profile wheel
(every spoke has its own calibrated scale, which a shared radial scale would destroy — a test locks
it) and the dashboard sparkline (×20 rows, no axes). Both follow the app-wide orientation: faster =
lower / further out.

**The stroke RADAR does not contradict that.** It is a companion to the wheel, not a replacement,
because it answers a different question on a different scale. The wheel asks what a swimmer can
ENTER and measures against the gala cuts they are eligible for — age-fair, but only comparable
inside one entry window, since ring 2 means Level 3 at 14 and SANY at 18. The radar asks what a
swimmer is GOOD at, on a universal scale, so any swimmers overlay. That scale is age-blind, which is
why the radar's read is the SHAPE of a polygon, never its size.

**Which universal scale depends on the course.** World Aquatics points (0–1000) wherever base times
are loaded; percent of world record (0–100) where they are not — short course, until those tables are
supplied. Those are different rulers, so the metric is never assumed by the component: `radarMetric`
returns it with the data, and the ring labels, the caption above the chart, the caption below it and
the accessible table all name the active metric and change together. One course per chart, always —
the two courses are measured against different references and must never average onto one spoke (§4.2).

**Reference lines on a points chart are not cuts.** Everywhere else a dashed line across a bar chart
is a qualifying standard; on the points charts the 400 / 600 / 800 markers are scale rulers drawn in
the neutral grid ink, and a caption says so in words. Never let the two read alike.

## 6. Spacing & motion
- 8px spacing grid. Section gaps `gap-5`/`gap-6`. Page content max width ~`1440px`, generous gutters.
- Motion is minimal and functional: sidebar collapse, sub-menu expand, toast in/out, chart load.
  No decorative animation. Always honour `prefers-reduced-motion`.

## 7. Dark mode
Light is the default. The `.dark` tokens above are provided so a theme toggle can be added
(Step 16 or later) without rework. Body: `bg-gray-50` light / `bg-gray-900` dark.

## 8. Bans (impeccable "anti-references")
No card-in-card. No purple→blue gradients. No glassmorphism. No rounded-square icon tile above every
heading. No grey-text-on-coloured-bg. No pure black/white. No colour-only meaning (always a label).
Two of these bite the vendored chart layer specifically: bklit's tooltip panel ships with
`backdrop-blur-md`, switched off via `SWIM_TOOLTIP_PANEL`, and its `content` render prop draws
inside that panel — so a tooltip must never add a card of its own.
**No chart may smooth a line through data points** (bklit's `Line` defaults to `curveNatural`; use
`curveLinear`). A spline between two swims draws times the swimmer never swam, which is
colour-only-meaning's cousin: a visual claim the data does not support.
