/*
  One visual language for every popover menu in the app (Step R11): the swimmer
  picker and filter selects (Radix Select) and the action menus (Radix Dropdown
  Menu) all draw their panel + item styling from here, so a "menu" reads the same
  everywhere. Colours come from DESIGN.md tokens — `bg-card` (white), `bg-accent`
  (brand-50 hover tint) and `text-brand-600` (see the note on MENU_ITEM for why
  that, and not brand-500) — never literal Tailwind indigo. The staggered item entrance is the shared `.stagger-menu` rule in
  globals.css; both primitives put it on the element that wraps the rows.
*/

// White rounded panel, hairline border, soft layered shadow, p-2, with a quick
// fade + short slide on open (the per-item stagger rides on top via .stagger-menu).
export const MENU_PANEL =
  "z-50 rounded-lg border border-gray-200 bg-card p-2 text-popover-foreground shadow-theme-lg " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

// Row: icon + label, rounded-md, brand-tinted on hover/highlight, brand-inked when
// selected, pointer cursor. Keyboard highlight (`data-[highlighted]`) matches hover.
//
// `tap` because a 34px option row is the target a coach hits thirty times
// picking days down a programme: 44px everywhere a finger might be, released
// only on a pointer-driven large screen. (The rule this replaced was gated on
// the pointer ALONE, and the sentence here still said so after the swap.) `text-brand-600`, not `text-primary`
// (brand-500): on brand-50 that pair is under AA (locked in lib/contrast.test.ts),
// and the highlighted row is exactly the one a low-vision keyboard user is
// reading.
export const MENU_ITEM =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 outline-hidden tap " +
  "transition-colors [transition-duration:var(--dur-1)] " +
  "hover:bg-accent hover:text-brand-600 focus:bg-accent focus:text-brand-600 " +
  "data-[highlighted]:bg-accent data-[highlighted]:text-brand-600 " +
  "data-[state=checked]:font-medium data-[state=checked]:text-brand-600 " +
  // Solid recessive ink, not `opacity-50`: fading `text-gray-700` landed well
  // under the Add-event listbox beside it, which authors its own disabled row
  // and says in a comment that it matches this one. One state, one depth, and
  // now literally one colour (locked in lib/contrast.test.ts).
  "data-[disabled]:pointer-events-none data-[disabled]:text-gray-500 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";
