import { ReactNode } from "react";

// Keystroke chip for surfacing shortcuts (accelerators for expert coaches).
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="tnums inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-gray-200 bg-gray-100 px-1 text-xs font-medium text-gray-500">
      {children}
    </kbd>
  );
}
