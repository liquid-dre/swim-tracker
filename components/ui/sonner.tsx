"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useMediaQuery } from "@/lib/useMediaQuery";

/*
  Single app-wide Toaster (mounted once in the root layout). Themed to DESIGN.md:
  neutral --surface toast, hairline --border, one radius, soft popover shadow. The
  ONLY colour a toast carries is its semantic icon (success=green, error=red,
  warning=amber, info=teal) — no rich-colour backgrounds, no rainbow. Subtle
  slide+fade only; the global prefers-reduced-motion rule neutralises it.

  Position: bottom-right on desktop, top-centre on mobile (thumb-reachable, clears
  the on-screen keyboard). One light theme, so `theme` is pinned to "light".
*/

// Semantic status icons. Colour lives here and nowhere else on the toast, and it
// is paired with a distinct shape so type never reads by colour alone.
const iconStroke = {
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
  stroke: "currentColor",
};

const icons = {
  success: (
    <svg viewBox="0 0 16 16" className="size-4 text-success-ink" aria-hidden>
      <circle cx="8" cy="8" r="6.5" {...iconStroke} />
      <path d="M5.2 8.2 7 10l3.6-4" {...iconStroke} />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 16 16" className="size-4 text-danger-ink" aria-hidden>
      <circle cx="8" cy="8" r="6.5" {...iconStroke} />
      <path d="M8 4.8v3.6M8 10.9v.01" {...iconStroke} />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 16 16" className="size-4 text-warning-ink" aria-hidden>
      <path d="M8 2.2 14.4 13H1.6L8 2.2Z" {...iconStroke} />
      <path d="M8 6.6v2.8M8 11.4v.01" {...iconStroke} />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" className="size-4 text-accent-strong" aria-hidden>
      <circle cx="8" cy="8" r="6.5" {...iconStroke} />
      <path d="M8 7.4v3.4M8 5.1v.01" {...iconStroke} />
    </svg>
  ),
  loading: (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-ink-faint border-t-transparent"
    />
  ),
};

export function Toaster(props: ToasterProps) {
  // Responsive placement without a media library. SSR-safe default (desktop) via
  // useSyncExternalStore — no hydration flip.
  const mobile = useMediaQuery("(max-width: 640px)");

  return (
    <Sonner
      theme="light"
      position={mobile ? "top-center" : "bottom-right"}
      closeButton
      duration={4000}
      gap={8}
      icons={icons}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "var(--color-border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group rounded-md border border-border bg-surface text-ink shadow-[var(--shadow-md)] text-sm",
          title: "font-medium text-ink",
          description: "text-ink-muted",
          actionButton:
            "rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover",
          cancelButton:
            "rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink-muted hover:text-ink",
          closeButton:
            "border-border bg-surface text-ink-muted hover:text-ink hover:bg-surface-2",
        },
      }}
      {...props}
    />
  );
}
