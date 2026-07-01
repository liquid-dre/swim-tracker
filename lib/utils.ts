import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui class combiner: clsx for conditionals, tailwind-merge to
// dedupe conflicting utilities. Used by every shadcn-derived component.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
