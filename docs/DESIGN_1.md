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

## 3. App-semantic tokens (qualifying tiers)
Mapped onto the reference palette so they harmonise. **Tiers are never colour-only — every tier
badge carries a text label** (`SANJ` / `L3` / `L2`), per the domain rules.
```css
:root {
  --tier-sanj:  #f79009;  /* warning/gold — top (hardest) */
  --tier-l3:    #465fff;  /* brand indigo — mid */
  --tier-l2:    #0086c9;  /* deep sky — entry */
  --tier-none:  #98a2b3;  /* gray-400 — no standard met */
  --qualified:  #12b76a;  /* success green — used ONLY for qualified states */
}
```

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
