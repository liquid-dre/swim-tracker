---
target: "Unified menu system: picker + action menu (R11)"
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-02T11-43-05Z
slug: shared-menu-select-and-action-menu
---
# Critique — Unified menu system: swimmer picker + action menu (STEP R11)

**Target:** `components/ui/Select.tsx` (Radix Select) and `components/ui/dropdown-menu.tsx` (Radix DropdownMenu), both drawing from `components/ui/menu-styles.ts`.
**Scope:** One styled panel/item language for every select, filter dropdown and action menu. Verified live in a browser (screenshots) plus tsc / eslint / next build.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Trigger chevron rotates 180° on open; selected row shows a brand check; keyboard/hover highlight is unmistakable. |
| 2 | Match System / Real World | 4 | Familiar select + menu affordances; the swimmer picker reads like any native picker but styled. |
| 3 | User Control and Freedom | 4 | Esc / click-away close; nothing traps; disabled triggers can't be opened. |
| 4 | Consistency and Standards | 4 | The picker and the action menu are pixel-siblings — same panel, radius, shadow, row treatment — from one shared style source. |
| 5 | Error Prevention | 3 | Disabled options and disabled triggers are honoured; placeholder never becomes a selectable value. |
| 6 | Recognition Rather Than Recall | 4 | Rows are icon + label; the selected option carries a check; placeholders state the choice to make. |
| 7 | Flexibility and Efficiency | 4 | Radix keyboard model intact: type-ahead, arrow keys, Home/End, focus return — for free, on every menu. |
| 8 | Aesthetic and Minimalist Design | 4 | One brand accent, a soft layered shadow, a quick staggered entrance; no gradients, no clutter. |
| 9 | Error Recovery | 3 | n/a — menus have no error surface of their own. |
| 10 | Help and Documentation | 3 | Self-evident controls; no docs needed. |
| **Total** | | **37/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI slop. The two menus are genuinely one system — the screenshots show the swimmer picker and the row-action menu sharing the identical white `rounded-lg` panel, `shadow-theme-lg`, and brand-tinted rows, with icons that inherit the row's brand colour on hover. Colours are DESIGN.md tokens (`bg-card`, `bg-accent` = brand-50, `text-primary` = brand-500 / #465fff), never literal Tailwind indigo. The destructive row stays semantic red.

**Deterministic scan:** `detect.mjs --json` over the menu components returned `[]` (exit 0). No side-stripe borders, no ghost-card border+shadow, no over-rounding, no gradient text.

**Browser evidence:** Rendered live at 2× DPI. Confirmed: (1) closed trigger chevron points down, open points up (180° rotation); (2) hovering a select row paints brand-50 bg + brand-500 text; (3) the action menu's hovered "Edit swimmer" row shows the same brand tint with the pencil icon going brand; (4) the destructive "Delete" row is red with a red icon. The staggered entrance is CSS (`.stagger-menu` nth-child ramp) and is zeroed under `prefers-reduced-motion` (duration + delay).

## Overall Impression

Every picker and menu in the app now speaks one visual language, and it's a polished one. The win is that this came from consolidating onto two Radix primitives behind a shared style module — so the keyboard/focus/aria correctness is inherited, not hand-rolled, while the look is fully on-token.

## What's Working

- **True single source of truth.** `menu-styles.ts` exports `MENU_PANEL` + `MENU_ITEM`; both the Select and the DropdownMenu consume them, so a change to the menu language is one edit.
- **Accessibility for free.** Moving native `<select>`s onto Radix Select kept (and in places gained) type-ahead, arrow-key nav, focus return and proper roles — every migrated call site inherits it.
- **Motion with a conscience.** The staggered fade/slide is a short nth-child ramp (caps at ~136ms) and the global reduced-motion rule now zeroes both duration and delay, so it never pops in row-by-row for users who opted out.

## Priority Issues

- **[P3] Native-select affordances traded for consistency.** Radix Select replaces the OS picker, so very long rosters lose the native mobile wheel. Mitigated by Radix type-ahead and a capped-height scrolling viewport; worth watching on low-end mobile.
  - *Fix:* If it ever bites, a virtualised viewport or a search field inside the panel.
  - *Suggested command:* `$impeccable audit`

## Persona Red Flags

**Sam (Accessibility):** Trigger exposes state (chevron + `data-state`), the listbox has roles/labels, the selected option is announced, focus returns to the trigger on close. Reduced motion is honoured.

**Alex (Power User):** Type-ahead and arrow keys work on every picker now; no reach-for-the-mouse.

## Minor Observations

- The account menu trigger gained a rotating chevron so its open state matches the selects.
- The Filters popover was left as-is: it holds form controls, not menu rows, and already uses `bg-popover` + `shadow-theme-lg`, so it's consistent without adopting item styling.

## Questions to Consider

- Should the swimmer pickers get an inline search field once a roster passes ~30, or is type-ahead enough?
