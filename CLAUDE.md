# Swim Tracker — Project Guide (CLAUDE.md)

A coach tool for tracking swimmers' personal bests, progression, and readiness against
qualifying standards. **Source of truth:** `docs/swim-tracker-BRD.md`. **Build steps:**
`docs/swim-tracker-build-prompts.md`. Build one step at a time; do not scaffold ahead.

## Stack
Next.js (App Router) · TypeScript · Tailwind · Convex · **bklit UI** charts (a shadcn registry
built on Visx) vendored into `components/charts/`. Times stored as integer milliseconds.

## Design skills — always use these for UI (they live in `.claude/skills/`)
- **impeccable** — product-mode design + anti-slop. **Every UI screen must pass
  `/impeccable critique` at ≥ 35/40** (fix the flagged issues, do not suppress them) before it is
  "done". Also use `/impeccable polish`, `audit`, `distill`, `decoration discipline`.
- **minimalist-ui** — the aesthetic direction (modern minimalist). One aesthetic base only.
- **emil-design-eng** — interaction/motion craft (charts, transitions); subordinate to impeccable's restraint.
- **ui-ux-pro-max** — UX patterns for dense screens (status matrix, filters, tables).
- **full-output-enforcement** — no truncated or half-finished output.

**Do NOT use** for this project: `industrial-brutalist-ui`, `brandkit`, `redesign-existing-projects`,
`imagegen-frontend-web`, `imagegen-frontend-mobile`, `image-to-code`, `gpt-taste`,
`stitch-design-taste`, `design-taste-frontend`, `high-end-visual-design`. They conflict with the
minimalist product direction or bloat context.

## Design system (product mode)
Authoritative tokens live in `DESIGN.md` (TailAdmin-derived). **Outfit** typeface; soft off-white
canvas (`gray-50`); white cards at `rounded-2xl` with a `gray-200` border and a soft layered shadow;
brand **indigo `#465fff`** accent for primary actions, active nav, and focus rings; Untitled-UI gray
ramp (`gray-900 #101828`, never pure black). Semantic success/error/warning used only for those
states. Semantic tier scale `--tier-sanj` (gold) → `--tier-l3` (indigo) → `--tier-l2` (deep sky) →
`--tier-none` (grey), **never colour-only** (always a label). **Tabular figures** for all swim times.
8px grid, minimal functional motion. Banned: card-in-card, gradients, glassmorphism, pure black/white,
colour-only meaning. Active nav state = `bg-brand-50 text-brand-500`.

## UI conventions (apply on every screen from Step 4 on)
- **App shell:** every screen renders inside a collapsible sidebar + slim top bar (shadcn Sidebar,
  lucide icons, TailAdmin-style but on our tokens). Nav IA (coach view): **Dashboard**; **Swimmers**
  (Roster, Squads, Log a time); **Performance** (Comparison, Progression, Season improvement);
  **Qualifying** (Status matrix, Road to qualify, Standards — coach only). Viewers get their own
  compartmentalised nav — **Overview / Progress / Road to qualify / History** — each its own route, not a single info-dump page.
- **Breadcrumbs on every page** via the shared `<PageHeader>` / `<AppBreadcrumb>` — real hierarchy, last
  crumb `aria-current="page"`, dynamic segments resolve real names (e.g. *Swimmers / Jane Doe*).
- **Feedback on every action** via `lib/notify` (Sonner) — `notify.promise` wraps async mutations
  (loading → success/error), surfacing the server message on error. No silent successes, no raw `alert()`.
- All shell/nav/toast/breadcrumb UI is themed from DESIGN.md tokens, uses semantic colours only for
  success/error/warning, respects `prefers-reduced-motion`, and falls under the ≥ 35/40 gate.
- **Event selectors:** distance / stroke / course are always shown together (no progressive disclosure),
  identically styled, with invalid options **disabled** (not hidden) per the event whitelist.
- **Time input:** a right-to-left digit accumulator (digits fill hundredths → seconds → minutes;
  backspace removes the last digit; no caret/segment focus). Validate via `parseTime` on blur/save.
- **Chart pages:** the chart is the centred hero above the fold; filters are a slim toolbar (primary
  selectors) plus a compact "Filters" popover (secondary filters, with an active-count badge) — never a
  tall filter block. Shared FilterBar across all chart pages.
- **Charts draw only the galas the swimmer can actually enter.** Overlay cut lines and wheel rings come
  from the Step A entry-window gate (`pickApplicableStandardsPerGala`), so the count is 2–4, never 5:
  age ≤14 → L2/L3/SANJ; 15–16 → those + SANS; 17–25 → SANS + SANY; 26+ → SANS. That bound is what keeps
  five galas legible — do not "helpfully" draw a line for a gala with no cut to chase.
- **Two visualisations are deliberately hand-built SVG, not chart-library output.** The stroke-profile
  wheel, because `computeCalibratedRadius` gives every spoke its **own** scale so "the bar crosses the
  SANJ ring" means exactly "beats the SANJ cut" (a radar chart's shared radial scale would silently
  destroy that, and a test locks it); and the dashboard sparkline, because it renders ×20 rows and needs
  no axes. Both follow the app-wide orientation: **faster = lower / further out**.
- **Dropdowns:** one shared styled menu component (white rounded panel, soft shadow, brand-indigo hover
  items, rotating chevron, subtle staggered entrance) for every select / picker / action menu.
- **Collapsed sidebar:** the icon rail still reaches every subcategory — groups reveal a flyout of their
  sub-items on hover/focus; leaf items show a label tooltip.
- **Target gala** is chosen per page, NOT persisted. Road to qualify and the progression projection each
  own their own selection (`useState`), via the shared `TargetTierToggle` (a styled dropdown, since five
  galas plus "All" no longer fit a segmented control). *A persisted coach-level default does not exist —
  earlier revisions of this file claimed it did.*
- **Course selector on qualifying surfaces.** Because both courses qualify, the status matrix and Road
  carry a **Long / Short / Best-of-both** control, defaulting to Best-of-both.

## Non-negotiable domain invariants (do not drift, even across sessions or after compaction)
- **Events:** 50/100/200/400/800/1500 per the whitelist. 100 IM is **SCM-only**; there is no 50 IM;
  400 is Free/IM only. Reject anything off the whitelist.
- **Course:** SCM and LCM PBs are **separate**; never merge or compare across course.
- **Headline PB = fastest MEET time only.** Time trials and practice never count toward the PB.
- **Times:** integer ms internally; canonical text `m:ss:hh`. Bulletproof parser — 2 groups means
  `ss:hh` (so `59:09` = 59.09 s, never 59 minutes); the last group is always hundredths.
- **Five galas, not three.** `GALA_ORDER` in `lib/galas.ts` is the single difficulty order, hardest →
  easiest: **SANS > SANY > SANJ > LEVEL_3 > LEVEL_2**. `SANS` = SA Senior National Aquatic Champs,
  `SANY` = SA National Youth Champs. Never re-derive this order and never add a second rank map —
  `dashboard.ts` used to carry a divergent copy.
- **Cuts are per COURSE.** Every gala publishes separate long- and short-course standards and **both are
  valid for entry**, so a PB is only ever compared against a cut of the **same course** — never borrowed,
  never interpolated. "Qualified" = a headline MEET PB in **either** course beats that course's own cut.
  (`data/qualifying-times.csv` holds all 948 rows; regenerate its Convex mirror with
  `npm run seed:standards:gen`.)
- **Two gala shapes.** `AGE_GRADED` (L2/L3/SANJ) has a cut per exact single-year age with a youngest
  `&U` catch-all; `OPEN` (SANS/SANY) has one cut for every age. Match a swimmer's **exact single-year
  age**, never the two-year display band.
- **Entry age windows** are a separate gate from the cuts, stored on the gala and editable by the
  super-user (Admin › Galas): SANS **15+**, SANY **17–25**, the age-graded galas **up to 16**. Outside
  the window there is no cut to chase even though rows exist.
- **Coverage is DATA**, on `galas.coveredEvents` — not a hardcoded switch. Still a hard rule: no 50m at
  L3/SANJ, nothing above 200m at L2, no 200 Fly at L2/L3, no cut at all for 25m or 100 IM. Render no
  line where no cut exists.
- **Roles:** coaches edit; viewers are read-only and see only their linked swimmer(s), enforced
  server-side in every query and mutation.

## Workflow
Every UI step ends with the impeccable ≥ 35/40 gate. Prefer tables over card grids on data screens.
When in doubt, the BRD wins over any assumption.
