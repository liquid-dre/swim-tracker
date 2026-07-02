---
target: Collapsed sidebar rail flyout (R10)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T11-20-39Z
slug: collapsed-sidebar-rail-flyout
---
# Critique — Collapsed sidebar rail flyout (STEP R10)

**Target:** `components/shell/AppSidebar.tsx` (`RailFlyoutGroup`, `GroupNav`, `InlineGroup`)
**Scope:** In the collapsed icon rail, groups now reveal their sub-items via a floating flyout on hover/focus; leaves keep a label tooltip. Expanded mode unchanged.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Active group's rail icon goes brand; the flyout marks the active child (brand fill + aria-current); a short fade/slide announces the panel. |
| 2 | Match System / Real World | 4 | A familiar right-flyout submenu with icon+label rows; plain nav labels, no jargon. |
| 3 | User Control and Freedom | 4 | Esc / ← / Tab return focus to the trigger; moving the pointer away dismisses; nothing traps the user. |
| 4 | Consistency and Standards | 4 | Flyout rows reuse the exact nav active vocabulary (brand-50 / brand-500) and DESIGN.md tokens; expanded groups are untouched. |
| 5 | Error Prevention | 3 | Presentational nav; the only actions are navigations, and the collapse state persists so the rail isn't a surprise. |
| 6 | Recognition Rather Than Recall | 4 | The rail no longer hides children — a chevron cue marks "has submenu", and hover/focus surfaces every labelled sub-item; leaves keep tooltips. |
| 7 | Flexibility and Efficiency | 4 | Pointer users hover; keyboard users arrow in (↑/↓ rove, Home/End jump) — both reach every route without expanding the rail. |
| 8 | Aesthetic and Minimalist Design | 4 | One panel, one accent, a subtle entrance; the only added chrome is a functional "has children" chevron. |
| 9 | Error Recovery | 3 | n/a — no error surface in nav chrome. |
| 10 | Help and Documentation | 3 | The labelled flyout header + row labels + leaf tooltips are self-documenting; nothing more is needed. |
| **Total** | | **37/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop. The flyout is a proper WAI-ARIA menu (button with `aria-haspopup`/`-expanded`/`-controls`; `role="menu"` panel of roving-tabindex `menuitem`s), portalled to `<body>` so the rail's `overflow-hidden` can't clip it, with a short fade+slide that the global reduced-motion rule zeroes. That is the opposite of a naive "absolutely-positioned div that gets clipped" or a hover tooltip masquerading as navigation.

**Deterministic scan:** `detect.mjs --json` over the sidebar returned `[]` (exit 0). No side-stripe borders, no ghost-card border+shadow, no over-rounding, no gradient text.

**Build/type/lint evidence (in place of a live overlay):** `tsc --noEmit`, `eslint`, and `next build` (22 routes) all pass. The build confirms the portal is SSR-safe — it renders only after a client pointer/focus event, so static generation never touches `document`.

**Visual overlays:** A live browser drive of the *authenticated coach* rail needs the Convex backend + a logged-in session, which isn't provisioned in this environment, so no in-page overlay was captured. Verdict rests on source review, the deterministic scan, and the green type/lint/build run.

## Overall Impression

The dead-end is gone: a collapsed group is now fully navigable without expanding the rail. The interaction is dual-input (hover and keyboard), the styling is the same single-accent vocabulary as the rest of the nav, and the motion is a quick, honest entrance rather than decoration.

## What's Working

- **Portalled, so never clipped.** The panel escapes the rail's `overflow-hidden` via `createPortal` and fixed positioning, with a viewport clamp so a bottom-of-rail group can't spill off-screen.
- **Real keyboard menu, not a hover-only trick.** Focus opens it; ↑/↓ rove roving-tabindex rows; Home/End jump; Esc/←/Tab hand focus back to the trigger so tab order stays sane despite the portal.
- **Active state is coherent end to end.** The group's rail icon takes the brand active state, the flyout's active row gets brand fill + `aria-current="page"`, matching the expanded tree exactly.

## Priority Issues

- **[P3] `role="menu"` opens on hover/focus, not the canonical click.** A strict menu-button opens on click/Enter; this also opens on hover and focus (the feature's whole point). It's a deliberate, well-behaved deviation (Esc/blur dismiss, roving focus), but a purist audit may note the pattern blends menu + disclosure semantics.
  - *Fix:* If flagged, drop to a pure disclosure (no `role="menu"`, tabbable links) — same UX, looser semantics.
  - *Suggested command:* `$impeccable audit`

## Persona Red Flags

**Sam (Accessibility):** Trigger announces group name (sr-only) + has-popup + expanded state; the panel is an aria-labelled menu; every row is reachable and the active one is `aria-current`. Focus returns to the trigger on dismiss. No keyboard trap.

**Alex (Power User):** Can stay collapsed and still reach any route: hover to glance, or arrow-key straight into a group without widening the rail.

## Minor Observations

- A ~120ms close delay bridges the small gap between the rail icon and the panel, so the pointer doesn't "fall out" mid-move.
- The mobile sheet and expanded desktop tree are deliberately left on the inline collapsible — the flyout is desktop-rail-only.

## Questions to Consider

- Should clicking (not just hovering) a collapsed group also pin the flyout open for touch-hybrid laptops, or is hover/focus the intended surface?
