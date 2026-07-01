"use client";

import { forwardRef } from "react";
import { Check } from "lucide-react";

import { clockFromDigits, formatTime, parseTime } from "@/lib/swim";

/*
  The single anchor of the /log screen (Step 5). Poolside, one-thumb entry:
  the coach types digits only and they right-fill calculator-style into
  `m:ss:hh` (last two = hundredths). Big tabular mono so it reads at arm's
  length; a live line below echoes the exact canonical time that will be stored
  (via formatTime) or flags an out-of-range entry. No colon typing required —
  pasted times regroup too.

  State lives in the parent as the raw `digits` string; this component is a pure
  view over it. `onDigits` receives the new (capped, digits-only) string.
*/

export type TimeParse =
  | { ms: number; text: string; error: null }
  | { ms: null; text: null; error: string | null };

/** Parse the current digit run into ms, or an error, for the parent's gate. */
export function parseDigits(digits: string): TimeParse {
  const { minutes, ss, hh } = clockFromDigits(digits);
  if (digits.replace(/\D/g, "") === "") {
    return { ms: null, text: null, error: null }; // nothing typed yet
  }
  try {
    const ms = parseTime(`${minutes}:${ss}:${hh}`);
    return { ms, text: formatTime(ms), error: null };
  } catch {
    // Only ss/hh out of range can land here (the shape is always valid).
    return { ms: null, text: null, error: "Seconds must be 00–59." };
  }
}

export const TimeField = forwardRef<
  HTMLInputElement,
  { digits: string; onDigits: (digits: string) => void }
>(function TimeField({ digits, onDigits }, ref) {
  const { minutes, ss, hh } = clockFromDigits(digits);
  const display = `${minutes}:${ss}:${hh}`;
  const parsed = parseDigits(digits);
  const hasEntry = digits.replace(/\D/g, "") !== "";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="time-entry" className="text-sm font-medium text-ink">
        Time
      </label>

      <input
        ref={ref}
        id="time-entry"
        // Digit-only numeric keypad on mobile; colons/dots are added for us.
        inputMode="numeric"
        autoComplete="off"
        value={display}
        aria-describedby="time-echo"
        aria-invalid={parsed.error ? true : undefined}
        onChange={(e) =>
          onDigits((e.target.value.match(/\d/g)?.join("") ?? "").slice(-6))
        }
        className={
          "time h-20 w-full rounded-lg border bg-white text-center text-[2.75rem] " +
          "font-semibold leading-none tracking-tight text-gray-800 tabular-nums outline-none " +
          "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] " +
          "focus:border-brand-300 focus:shadow-focus-ring " +
          (parsed.error
            ? "border-error-500 bg-error-50 "
            : "border-gray-300 hover:border-gray-400")
        }
      />

      <div
        id="time-echo"
        className="flex min-h-5 items-center gap-1.5 text-sm"
        aria-live="polite"
      >
        {parsed.error ? (
          <span className="text-danger-ink">{parsed.error}</span>
        ) : parsed.text ? (
          <>
            <Check aria-hidden className="size-4 text-brand-500" strokeWidth={2.25} />
            <span className="text-ink-muted">
              Saves as <span className="time font-medium text-ink">{parsed.text}</span>
            </span>
          </>
        ) : (
          <span className="text-ink-faint">
            Type the digits. The last two are hundredths.
          </span>
        )}
        {hasEntry && (
          <button
            type="button"
            onClick={() => onDigits("")}
            className="ml-auto rounded-sm px-1 text-xs text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
});
