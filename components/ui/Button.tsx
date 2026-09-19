import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerQuiet";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-1)] " +
  "[transition-timing-function:var(--ease-standard)] " +
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
  "active:scale-[0.98] disabled:pointer-events-none " +
  // Only a NATIVE disabled (a caller passing `disabled`) fades. `loading` is
  // handled separately below, because it also sets `disabled` — and a button
  // that was `aria-disabled` as well then compounded the inert fill with this
  // fade and landed at 1.92:1, on the one state where someone is waiting and
  // looking hardest.
  "[&:disabled:not([aria-busy])]:opacity-50 " +
  // The SAME visual state for `aria-disabled`, which callers use when a
  // disabled control still has to explain itself — a native `disabled` button
  // is unfocusable, so its reason reaches neither keyboard nor screen reader.
  // Without these a button could be inert while still dimming for nobody,
  // lighting under the pointer and animating the press: reachable but
  // invisible, which is the trade the a11y fix was not meant to make.
  // A muted FILL and muted ink, not opacity. `opacity-50`
  // composited the whole button and put a blocked Save at 2.09:1 — on the one
  // control `aria-disabled` exists to keep a low-vision keyboard user able to
  // land on. The `ghost` hover moved off this fill so the two cannot be
  // confused. Ratios are locked in lib/contrast.test.ts, not stated here —
  // three prose figures in these files were wrong in three consecutive reviews.
  //
  // The pointer stays LIVE: `pointer-events-none` left a sighted coach tapping
  // a dead control with no cursor, no hover, no tooltip and no click — and it
  // silently killed the two rules beside it. The click is stopped by the
  // caller's own guard.
  //
  // Every rule is gated `:not([aria-busy])` rather than being overridden by a
  // busy rule afterwards. `loading` sets BOTH `disabled` and `aria-busy`, and
  // the override spelling tried here first reset the background to the CSS
  // `initial` value under an aria-busy variant — but that value is
  // TRANSPARENT, not "whatever the variant said", so every primary button
  // vanished to white-on-canvas (1.03:1) for
  // the whole duration of its own write. It did not even win: the inert fill
  // compiled after it at equal specificity. A state this hard to reason about
  // in overrides is one to express as a condition.
  "[&[aria-disabled]:not([aria-busy])]:bg-gray-100 " +
  "[&[aria-disabled]:not([aria-busy])]:text-gray-500 " +
  "[&[aria-disabled]:not([aria-busy])]:border-gray-300 " +
  "[&[aria-disabled]:not([aria-busy])]:shadow-none " +
  "[&[aria-disabled]:not([aria-busy])]:cursor-default " +
  "[&[aria-disabled]:not([aria-busy])]:active:scale-100 " +
  "[&[aria-disabled]:not([aria-busy])]:hover:bg-gray-100 " +
  "[&[aria-disabled]:not([aria-busy])]:hover:text-gray-500 " +
  // Busy keeps the variant's own fill untouched — a running action still reads
  // as the action it is — and only says so through the cursor.
  "aria-busy:cursor-progress";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600",
  secondary:
    "bg-white text-gray-700 border border-gray-300 shadow-theme-xs hover:bg-gray-50",
  // `hover:bg-gray-50`, not gray-100: gray-100 is the inert fill below, so a
  // hovered ghost Cancel and a blocked Save read identically — and on iOS the
  // hover sticks after the tap.
  ghost: "bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800",
  // error-600, not 500: white on #f04438 is 3.76:1 and a button label is
  // normal-weight text needing 4.5. DESIGN.md §2 already made this call for
  // danger INK and it was never applied to the fill.
  danger: "bg-error-600 text-white shadow-theme-xs hover:bg-error-700",
  // Destructive INK on a secondary shell. A solid red fill is the confirm
  // dialog's answer, not a toolbar's: three filled buttons in one header
  // (indigo, white, red) leaves a screen with no dominant action, against
  // PRODUCT.md's "one anchor per screen". --danger-ink is error-700, locked
  // against white and against its own tint in lib/contrast.test.ts.
  dangerQuiet:
    "bg-white text-danger-ink border border-error-500/40 shadow-theme-xs " +
    "hover:bg-error-50 hover:border-error-500/60",
};

// ≥44px targets on touch viewports (PRODUCT.md); compact from lg up so the
// dense coach toolbars keep their density.
const sizes: Record<Size, string> = {
  sm: "h-11 px-3 text-sm lg:h-8 touch:h-11",
  md: "h-11 px-4 text-base lg:h-9 touch:h-11",
};

/** The full Button class string, for link elements styled as buttons. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md") {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, type, className = "", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Defaults to "button": an `aria-disabled` Save keeps a live pointer, so
      // without this it would submit any form it was dropped into.
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      {children}
    </button>
  );
});
