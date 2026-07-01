---
target: App shell — sidebar + top bar (Step 3.6)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T11-38-35Z
slug: app-shell-sidebar-topbar-step-3-6
---
# Critique — App shell (Step 3.6): collapsible sidebar + slim top bar

Register: product. Targets: `components/shell/AppSidebar.tsx`, `AppTopbar.tsx`,
`ComingSoon.tsx`, the vendored-and-themed `components/ui/sidebar.tsx`, `lib/nav.ts`,
and the `app/(app)/*` routes. Verified live at 1280px (expanded + collapsed rail)
and 390px (off-canvas drawer).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Active route highlighted in teal; breadcrumb shows location; the active route's group auto-expands; collapse state persists across reload |
| 2 | Match System / Real World | 4 | Familiar side-nav + top-bar; plain labels ("Roster", "Log a time"); breadcrumb mirrors the IA |
| 3 | User Control and Freedom | 4 | Collapse via Cmd/Ctrl+B, the rail, and a footer control; mobile drawer dismisses on scrim; sign-out reachable from footer and top bar |
| 4 | Consistency and Standards | 4 | One shadcn primitive family; lucide icons at one size/weight; a single teal accent for active and nothing else; PageHeader on every route |
| 5 | Error Prevention | 3 | Unbuilt routes render a teaching placeholder, so nav never dead-ends in a 404 during the build |
| 6 | Recognition Rather Than Recall | 4 | Persistent labelled nav + breadcrumb; nothing to memorise |
| 7 | Flexibility and Efficiency | 4 | Keyboard toggle, persisted collapsed rail for power users, off-canvas on mobile |
| 8 | Aesthetic and Minimalist Design | 4 | Sidebar is the quiet "second neutral" (--surface-2); borders not shadows; no gradient fill; calm 8px rhythm |
| 9 | Error Recovery | 3 | Nav and sign-out are always present; no custom 404 yet (placeholders make one largely unnecessary now) |
| 10 | Help and Documentation | 3 | Placeholders teach what each unbuilt screen will do; no formal help surface |
| **Total** | | **37/40** | **Strong — ships** |

## Anti-Patterns Verdict

**LLM assessment**: Not slop. Sidebars are the classic slop magnet and this one stays
disciplined: no heavy drop shadow (a single hairline border separates the panel), no
gradient fill, no glassmorphism (the top bar was switched from a translucent blur to a
solid --surface), and exactly one accent — teal, used only for the active item (subtle
tint fill + accent text + accent icon), never for idle or hover. Idle items are ink; hover
is a quiet neutral. Icons are one lucide weight/size, and the brand mark (Droplets) is
deliberately distinct from every nav glyph so the collapsed rail never shows two identical
icons. Group parents (Waves / Gauge / Award) are distinct from their children. Reads like a
calm logbook, not a dashboard demo.

**Deterministic scan**: `detect.mjs --json` over the shell components, the themed
sidebar primitive, and the routes returned `[]` (exit 0) — zero findings. No border+heavy-shadow
ghost cards, no over-rounding, no side-stripe active indicators, no gradient text.

**Visual overlays**: Not injected; verified by direct screenshots of the running build —
expanded (active Roster in teal, Swimmers group auto-expanded, correct breadcrumb),
collapsed icon rail (Cmd/Ctrl+B), and the mobile off-canvas drawer.

## Overall Impression

The shell does its job and disappears into it. The second-neutral sidebar + teal-only active
state is exactly DESIGN.md's restraint, and every mechanic in the acceptance list works:
icon-rail collapse with persisted state, keyboard toggle, auto-expanded active group, mobile
drawer, role-filter seam. Biggest remaining opportunity is small: the collapsed rail doesn't
signal which group holds the active sub-route.

## What's Working

- **Teal-only active state.** The single accent marks the current item and nothing else;
  idle is ink, hover is a neutral lift. This is the decision that keeps a sidebar from
  becoming slop, and it's correct.
- **Role-filter seam.** `navForRole` + per-item `roles` means Step 15's VIEWER reduction is
  a data change, not a component rewrite. Standards is already gated COACH-only.
- **One kit, honestly.** The duplicate shadcn button/input the CLI pulled in were removed and
  the sidebar rewired to plain elements, so there is a single button vocabulary, not two.

## Priority Issues

- **[P2] Collapsed rail loses the sub-route "you are here".** On /swimmers the rail shows the
  Swimmers (Waves) icon un-highlighted because the active leaf lives in a hidden sub-menu.
  **Fix**: when a group contains the active route, mark its rail icon active in
  `collapsible=icon` state only (keep the parent neutral when expanded, where the child
  already shows teal). **Command**: `$impeccable polish`.
- **[P3] Idle hover uses --border as a full fill.** It's perceptible and calm, but it is the
  same token as the dividers; a dedicated subtle hover tint would separate "hover" from
  "rule" semantically. **Fix**: optional `--sidebar-hover` token. **Command**: `$impeccable colorize`.
- **[P3] Tall empty gap between nav and footer.** Expected with a short nav, but a future
  step could use the space (e.g. a squad quick-filter). Not a defect today.

## Persona Red Flags

**Coach (power user, poolside laptop)**: Cmd/Ctrl+B + persisted rail suit a returning power
user; active highlight + breadcrumb answer "where am I". Red flag only in the collapsed rail
(P2 above). Otherwise clean.

**Parent/Viewer (first-timer, mobile)**: Off-canvas drawer is thumb-reachable and dismissible;
labels are plain; sign-out is in the top-bar menu without opening the drawer. No jargon. In
Step 15 the nav collapses to their reduced set via the existing filter. No red flag.

## Minor Observations

- Sub-nav expand/collapse is height-animated and eased; the global reduced-motion rule
  neutralises it.
- Breadcrumb renders group crumbs (e.g. "Swimmers") as plain middle text — not a link and not
  aria-current — so only the current page is emphasised.
- Top bar sign-out duplicates the footer's, which is intentional: on mobile the footer is
  behind the drawer.

## Questions to Consider

- Should the collapsed rail show sub-items as a hover flyout, or is expand-to-navigate enough?
- Is a persistent top-bar needed on desktop, where the sidebar carries identity and the page
  owns its PageHeader — or could it be mobile-only?
