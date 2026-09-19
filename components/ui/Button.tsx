import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-1)] " +
  "[transition-timing-function:var(--ease-standard)] " +
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 " +
  // The SAME visual state for `aria-disabled`, which callers use when a
  // disabled control still has to explain itself — a native `disabled` button
  // is unfocusable, so its reason reaches neither keyboard nor screen reader.
  // Without these a button could be inert while still dimming for nobody,
  // lighting under the pointer and animating the press: reachable but
  // invisible, which is the trade the a11y fix was not meant to make.
  // INK, not opacity. `opacity-50` composites the whole button, which put a
  // blocked primary Save at 2.09:1 with a 2.04:1 focus ring — on the one
  // control `aria-disabled` exists to keep a low-vision keyboard user able to
  // land on. gray-500 on gray-100 is 4.51:1. This is the same treatment
  // `IconButton` uses, so the app has one inert vocabulary rather than three.
  //
  // The pointer stays LIVE: `pointer-events-none` left a sighted coach tapping
  // a dead control with no cursor, no hover, no tooltip and no click — and it
  // silently killed the two rules beside it. The click is stopped by the
  // caller's own guard.
  "aria-disabled:bg-gray-100 aria-disabled:text-gray-500 aria-disabled:border-gray-300 " +
  "aria-disabled:shadow-none aria-disabled:cursor-default aria-disabled:active:scale-100 " +
  "aria-disabled:hover:bg-gray-100 aria-disabled:hover:text-gray-500";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600",
  secondary:
    "bg-white text-gray-700 border border-gray-300 shadow-theme-xs hover:bg-gray-50",
  ghost: "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800",
  // error-600, not 500: white on #f04438 is 3.76:1 and a button label is
  // normal-weight text needing 4.5. DESIGN.md §2 already made this call for
  // danger INK and it was never applied to the fill.
  danger: "bg-error-600 text-white shadow-theme-xs hover:bg-error-700",
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
  { variant = "primary", size = "md", loading = false, disabled, className = "", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
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
