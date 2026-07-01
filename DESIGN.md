# Design

Modern, minimalist coaching tool. Cool near-monochrome on soft off-white, exactly one
teal accent, a semantic tier scale that never relies on colour alone. Product register:
dense and scannable, one visual anchor per screen. Tokens are authoritative — components
consume `var(--token)` / the Tailwind utilities generated from them; **no raw hex, no ad-hoc
fonts, ever.** Colours are OKLCH.

Living reference screen: `app/preview/page.tsx` (route `/preview`).

---

## Theme

- **One light theme.** Soft off-white canvas (never pure `#fff`), near-ink text (never pure
  `#000`), cool slate neutrals with a faint blue cast (hue ≈ 258). No auto dark mode in v1.
- **Colour strategy: Restrained.** Tinted neutrals + one accent. Accent + semantic colours
  together cover well under 10% of any screen.
- **One anchor per screen.** The PB / the gap / the trend is the single focal point; all else
  is support.

## Colour palette (OKLCH semantic tokens)

### Neutrals — surfaces
| Token | OKLCH | Use |
|---|---|---|
| `--bg` | `0.985 0.004 258` | app canvas (soft off-white) |
| `--surface` | `0.998 0.002 258` | cards, panels, table body |
| `--surface-2` | `0.965 0.005 258` | toolbars, table header, zebra, subtle fills |
| `--border` | `0.912 0.006 258` | hairline dividers, input borders |
| `--border-strong` | `0.84 0.008 258` | emphasised borders, focused inputs |

### Neutrals — text (the ink ramp)
| Token | OKLCH | Use | Contrast on `--bg` |
|---|---|---|---|
| `--ink` | `0.24 0.014 258` | primary text, headings, times | ~13:1 |
| `--ink-muted` | `0.46 0.012 258` | secondary text, labels, captions | ~4.7:1 (AA body) |
| `--ink-faint` | `0.56 0.010 258` | tertiary marks; ≥14px / non-body only | ~3.2:1 |

### Accent — exactly ONE (deep teal). Primary actions, active nav, focus, primary data line.
| Token | OKLCH | Use |
|---|---|---|
| `--accent` | `0.46 0.09 199` | primary button bg, links, primary chart line |
| `--accent-hover` | `0.40 0.09 199` | hover/active of accent |
| `--accent-strong` | `0.38 0.09 199` | accent text on `--accent-subtle` |
| `--accent-subtle` | `0.95 0.03 199` | active-nav / selected-row tint |
| `--accent-fg` | `0.99 0 0` | text/icons on `--accent` (white, ≥4.5:1) |
| `--ring` | `0.55 0.11 199` | focus ring (2px, 2px offset) |

### Success / qualified — a single clear green, used ONLY for a qualified state.
| Token | OKLCH | Use |
|---|---|---|
| `--success` | `0.47 0.12 152` | "Qualified" solid marker bg |
| `--success-fg` | `0.99 0 0` | text on `--success` |
| `--success-ink` | `0.40 0.10 150` | qualified text on light |
| `--success-subtle` | `0.94 0.04 152` | qualified row/badge tint |

### Warning / error — standard semantic, sparing.
| Token | OKLCH | Use |
|---|---|---|
| `--warning-ink` | `0.48 0.10 60` | caution text |
| `--warning-subtle` | `0.93 0.06 70` | caution tint |
| `--danger` | `0.50 0.18 27` | destructive button bg |
| `--danger-fg` | `0.99 0 0` | text on `--danger` |
| `--danger-ink` | `0.47 0.16 27` | inline error text on light |
| `--danger-subtle` | `0.95 0.04 25` | error field tint |

### Tier scale — ordered SANJ > LEVEL_3 > LEVEL_2 > none (hardest → easiest → unranked).
**Never colour-only.** Every tier badge also carries a text label AND a shape glyph, so it
reads in greyscale and under colour-blindness. `-bg`/`-ink`/`-border` build the badge; the
base token colours the chart reference line / dot.

| Tier | base | `-bg` | `-ink` | `-border` | glyph |
|---|---|---|---|---|---|
| `--tier-sanj` (top, warm gold) | `0.74 0.12 82` | `0.92 0.055 84` | `0.42 0.075 66` | `0.82 0.07 78` | ◆ filled diamond |
| `--tier-l3` (mid, cool blue) | `0.55 0.10 250` | `0.93 0.035 250` | `0.42 0.06 255` | `0.85 0.04 252` | ● filled circle |
| `--tier-l2` (entry, slate) | `0.55 0.02 258` | `0.93 0.008 258` | `0.42 0.012 258` | `0.86 0.008 258` | ○ ring |
| `--tier-none` (unranked grey) | `0.62 0.006 258` | — (ghost) | `--ink-muted` | dashed `--border` | – em dash |

Hues are deliberately far apart (gold 82 / blue 250 / neutral) and safe under deuteranopia;
the label + glyph carry the meaning regardless.

## Typography

**One family**, weight + size for hierarchy (avoids the Inter-for-everything tell).

- `--font-sans`: **Geist Sans** — headings, labels, body, UI. (`next/font`, var `--font-geist-sans`.)
- `--font-mono`: **Geist Mono** — **all swim times and numeric cells**, with
  `font-variant-numeric: tabular-nums` so `m:ss:hh` columns align. Utility: `.time`.
- No third family. No display/serif. No Inter/Roboto/Open Sans.

Fixed rem scale (product, not fluid), ratio ≈ 1.2:

| Token | px | Use |
|---|---|---|
| `--text-xs` 0.75rem | 12 | badge, caption, table meta |
| `--text-sm` 0.8125rem | 13 | secondary labels |
| `--text-base` 0.875rem | 14 | body / table cell (base) |
| `--text-md` 1rem | 16 | emphasised value |
| `--text-lg` 1.125rem | 18 | section title |
| `--text-xl` 1.375rem | 22 | screen title |
| `--text-2xl` 1.75rem | 28 | the single anchor number |

Weights: 400 body, 500 labels/times, 600 headings & the anchor. Line-height 1.5 body, 1.2
headings. Prose capped 65–75ch; data tables may run denser.

## Spacing & radius

- **8px grid.** Use multiples of 8 for structure (8/16/24/32/48/64), 4px only for tight
  intra-component gaps. Tailwind's default 4px step maps: `2`=8, `3`=12, `4`=16, `6`=24, `8`=32.
- Radius: `--radius-sm` 6px (badges, inputs), `--radius-md` 8px (buttons, controls),
  `--radius-lg` 12px (cards/panels). Never `rounded-full` on containers, cards, or primary
  buttons; never ≥ 16px on cards.
- Elevation: borders first. `--shadow-sm` `0 1px 2px oklch(0.25 0.02 258 / .05)`;
  `--shadow-md` `0 4px 12px oklch(0.25 0.02 258 / .06)` for popovers only. Opacity < 0.08.

## Motion

Minimal, only to reinforce hierarchy or confirm state.

- Durations: `--dur-1` 120ms (hover/press), `--dur-2` 180ms (controls), `--dur-3` 240ms (panels).
- Easing: `--ease-out` `cubic-bezier(0.16,1,0.3,1)`; `--ease-standard` `cubic-bezier(0.4,0,0.2,1)`.
- Animate only `transform` / `opacity` (+ chart path draw). No layout animation, no bounce.
- Buttons: `:active { transform: scale(0.98) }`. Charts: one gentle ~600ms path-draw on load.
- `@media (prefers-reduced-motion: reduce)`: transitions → instant; chart animation off.

## Components (vocabulary — consistent across every screen)

- **Button**: `primary` (accent), `secondary` (surface + border), `ghost` (transparent),
  `danger`. States: default / hover / active / focus-visible (ring) / disabled / loading.
- **Input / Select**: `--surface` bg, `--border`, focus → `--border-strong` + ring. Error →
  `--danger-subtle` bg + `--danger-ink` message below.
- **Table**: `--surface-2` header, hairline row borders, `.time` cells right-aligned and
  tabular, selected row → `--accent-subtle`. Tables over card grids on data screens.
- **TierBadge**: `-bg`/`-ink`/`-border` + glyph + label. Typed to `SANJ|LEVEL_3|LEVEL_2|NONE`.
- **Card / panel**: single `--border`, `--radius-lg`, `--surface`. **Never card-in-card.**
- Empty states teach; loading uses skeletons, not centred spinners.

## Anti-references (banned — refuse and rewrite)

- **card-in-card** (nested bordered/elevated containers)
- **purple→blue gradients** (and gradient text / decorative gradients generally)
- **glassmorphism without function**
- **the rounded-square icon tile above every heading**
- **grey text on coloured backgrounds** (use a darker shade of the bg's own hue)
- **generic SaaS card grids / hero-metric tiles**
- colour as the sole carrier of tier/qualified meaning
- decorative motion; emoji in UI; Inter/Roboto/Open Sans; `rounded-full` containers;
  card radius ≥ 16px; heavy drop shadows.
