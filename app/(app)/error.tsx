"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/notify";

/*
  Segment error boundary for every shell page (coach and /me alike). A thrown
  Convex query — e.g. a viewer-scoping "You can only view your own swimmer" —
  lands here instead of white-screening; the sidebar and top bar stay up so the
  user can simply navigate elsewhere.
*/
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-theme-sm">
      <TriangleAlert aria-hidden className="size-7 text-error-500" strokeWidth={1.6} />
      <div className="space-y-1">
        <p className="text-base font-medium text-ink">Something went wrong</p>
        <p className="mx-auto max-w-[52ch] text-sm text-ink-muted">
          {errorMessage(error, "This page hit an unexpected error. Your data is safe.")}
        </p>
      </div>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
