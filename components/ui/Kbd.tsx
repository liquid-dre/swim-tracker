import { ReactNode } from "react";

// Keystroke chip for surfacing shortcuts (accelerators for expert coaches).
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="time inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-surface-2 px-1 text-xs font-medium text-ink-muted">
      {children}
    </kbd>
  );
}
