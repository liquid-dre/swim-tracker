"use client";

import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/*
  Compact native <select> shell (Step R2). Extracts the select + chevron pattern
  duplicated across every analysis screen so filter selectors read identically
  wherever they appear — the slim toolbars and the "Filters" popovers. `sm` is
  the toolbar height (h-9); `md` matches the taller primary swimmer pickers.
*/

export function Select({
  className,
  size = "sm",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "md";
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none rounded-lg border border-gray-300 bg-white text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50",
          size === "sm" ? "h-9 pl-3 pr-9 text-sm" : "h-11 pl-3 pr-9 text-base",
          className,
        )}
        {...props}
      />
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </div>
  );
}
