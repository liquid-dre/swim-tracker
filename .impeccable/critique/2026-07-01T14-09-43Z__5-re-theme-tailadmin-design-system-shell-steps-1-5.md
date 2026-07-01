---
target: Step 5.5 re-theme — TailAdmin design system (shell + Steps 1-5)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T14-09-43Z
slug: 5-re-theme-tailadmin-design-system-shell-steps-1-5
---
# Critique — Step 5.5 re-theme to the TailAdmin design system (shell + Steps 1–5)

Register: product. Targets: the token layer (`app/globals.css`, `app/layout.tsx`),
the shell (`components/shell/*`, themed `components/ui/sidebar.tsx`), the shared UI
kit (`Button`, `Input`, `Textarea`, `Segmented`, `TierBadge`, `Kbd`, `sonner`,
`skeleton`), the roster (`RosterTable`, `SwimmersScreen`, forms), squads, the log
flow (`LogScreen`, `TimeField`), the auth screens (`app/login`, `app/signup`), and
the design-system reference (`app/preview`). Assessed at the code level (no Convex
backend in this container, so routes are auth-gated); build passes, detector clean.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Active route = brand-50 tint + brand-500 text/icon; breadcrumb + PageHeader on every screen; inline validation, loading skeletons, save toasts |
| 2 | Match System / Real World | 4 | Plain domain labels ("Log a time", "Fastest meet time"); SCM/LCM, tier labels; natural top-down order |
| 3 | User Control and Freedom | 4 | Cancel/undo on forms, delete-recent, Cmd/Ctrl+B collapse, mobile drawer scrim, Clear on the time field |
| 4 | Consistency and Standards | 4 | One token system now — brand/gray ramp, one radius language (controls rounded-lg, cards rounded-2xl), one soft-shadow scale; shadcn maps to the same vars |
| 5 | Error Prevention | 3 | Whitelisted event pickers, date max=today, disabled save until valid; destructive delete has no confirm (recoverable, session-local) |
| 6 | Recognition Rather Than Recall | 4 | Persistent labelled nav; remembered meet/date/type defaults; visible chip pickers rather than free text |
| 7 | Flexibility and Efficiency | 4 | Keyboard toggle + ⌘K affordance, persisted rail, sticky mobile save bar, form stays put for rapid logging |
| 8 | Aesthetic and Minimalist Design | 4 | Soft off-white canvas, white cards, one indigo accent, tabular times; no card-in-card, no gradient, no glass |
| 9 | Error Recovery | 3 | Inline field errors + server error line preserve input; no global 404 (placeholders cover unbuilt routes) |
| 10 | Help and Documentation | 3 | Inline hints ("Only meet times count toward a PB"), teaching placeholders; no formal help surface |
| **Total** | | **37/40** | **Strong — ships** |

## Anti-Patterns Verdict

**LLM assessment**: Not slop. The re-theme swaps the single teal accent for the
DESIGN.md indigo brand and adds the intentional TailAdmin depth (white cards,
`rounded-2xl`, soft layered `shadow-theme-*`) without importing any of the tells the
system bans. One accent, used only for action/focus and the active nav item; green
reserved for qualified; tiers always carry a text label (`SANJ`/`L3`/`L2`), never
colour alone. No hero-metric tiles, no identical card grids, no icon-tile-above-every-
heading, no gradient text, no glassmorphism. Times are tabular everywhere. Skeletons
are neutral gray, not the brand tint. The auth screens were promoted from raw
`zinc/red` placeholders to the shared card + Input + Button vocabulary.

**Deterministic scan**: `detect.mjs --json` over the shell, UI kit, roster, squads,
log, auth, and preview surfaces returned `[]` (exit 0) — zero findings. No
border+heavy-shadow ghost cards, no over-rounded cards (cards sit at 16px, controls at
12px), no side-stripe indicators, no gradient text, no repeating-gradient stripes.

**Contrast**: All text pairs verified ≥ AA. gray-800 on white 14.7:1; gray-500 muted
4.97:1; brand-500 on white 4.84:1 and on brand-50 (active nav) 4.34:1; error-600
4.83:1; tier inks 5.2–5.8:1. `ink-faint` was remapped off gray-400 (2.58:1, text-
failing) to gray-500; gray-400 is now reserved for icons/borders/placeholder decoration.

## Overall Impression

The system got more cohesive, not busier. Before, the palette was a bespoke teal-on-
slate; now it's a documented ramp (brand/gray + semantic + tier) with a single source
of truth in `globals.css`, mapped through to every shadcn primitive. The soft cards and
shadows read as "well-kept logbook with a little depth", which is on-brand. The biggest
win is consistency: one radius language, one shadow scale, one accent, tabular times —
and the auth screens no longer look like a different product.

## What's Working

- **One token layer, applied everywhere.** brand/gray/semantic/tier tokens live once in
  `globals.css`; components consume tokens (or the mapped shadcn vars), so there is no
  ad-hoc hex left in the app (`grep` for default Tailwind colour classes returns none).
- **Active nav = brand-50 + brand-500.** The single accent marks the current item and
  nothing else; idle is gray-700, hover a quiet gray-100 — the decision that keeps a
  sidebar out of slop territory, now in the brand hue.
- **Tabular truth preserved.** Every time cell, PB, and gap keeps `tabular-nums`; the
  `.time`/`.tnums` utilities dropped the mono face and align in Outfit.

## Priority Issues

- **[P2] Destructive delete lacks confirm.** Removing a just-logged entry is one click.
  It's session-local and low-stakes, but a coach logging fast could misfire.
  **Fix**: inline undo affordance on the toast. **Command**: `$impeccable harden`.
- **[P3] Collapsed rail sub-route signal.** Carried over from Step 3.6: the icon rail
  tints the group when it holds the active route only in `collapsible=icon` state; verify
  the brand tint reads at rail width. **Command**: `$impeccable polish`.
- **[P3] Dark mode is defined but unexercised.** `.dark` tokens exist per DESIGN.md §7 so
  a future toggle needs no rework, but no screen has been viewed dark yet.
  **Command**: `$impeccable audit` (when the toggle lands).

## Persona Red Flags

**Coach (power user, poolside laptop)**: Cmd/Ctrl+B, persisted rail, ⌘K search
affordance, and a form that stays put for rapid logging all suit a returning power user.
Active highlight + breadcrumb answer "where am I". No red flag beyond the P2 above.

**Parent/Viewer (first-timer, mobile)**: Thumb-reachable drawer + sticky mobile save bar,
plain labels, no jargon, brand-tinted focus rings for keyboard users. Tiers carry text
labels so meaning survives colour-blindness. No red flag.

## Minor Observations

- `Segmented` active segment is a raised white pill on gray-100 (TailAdmin pattern),
  distinct from the brand-filled chip pickers — intentional, reads clearly.
- Placeholders now use gray-500 (AA) rather than the lighter gray-400 default.
- Legacy `--shadow-sm` / `--shadow-md` custom properties kept as aliases onto the
  shadow-theme scale so no stray arbitrary-shadow call broke during the swap.

## Questions to Consider

- Should the "logged this session" delete get an undo toast instead of an immediate remove?
- Now that depth is on the table, should the PB/anchor card carry `shadow-theme-md` to sit
  one layer above supporting cards, or stay flat for maximum restraint?
