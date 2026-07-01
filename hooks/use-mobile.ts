import { useMediaQuery } from "@/lib/useMediaQuery";

const MOBILE_BREAKPOINT = 768;

// SSR-safe, lint-clean mobile detection via our shared useMediaQuery
// (useSyncExternalStore under the hood — no setState-in-effect).
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
