"use client";

import { forwardRef, useCallback, useEffect, useRef } from "react";
import { Check } from "lucide-react";

import { clockFromDigits, formatTime, parseTime } from "@/lib/swim";

/*
  The single anchor of the /log screen (Step 5, hardened in R1). Poolside,
  one-thumb entry: the coach types digits only and they shift in from the RIGHT,
  calculator/stopwatch style — hundredths → seconds → minutes. Backspace shifts
  the last digit back out. There is no caret to place and no per-segment focus,
  so a digit can never land in the wrong segment and Backspace can never delete
  the wrong one.

  The model is the raw `digits` string in the parent (leading zeros stripped —
  they carry no meaning in a right-to-left fill). This component is a pure view
  over it: it renders the formatted `m:ss:hh`, echoes the exact canonical time
  that will be stored (via formatTime), and flags an out-of-range entry. It
  drives the model from `beforeinput` (not the caret) so entry is identical on a
  desktop keyboard and a mobile numeric keypad, and stays correct under fast
  repeated typing.
*/

const MAX_DIGITS = 6; // 99:59:99 — the largest clock the three fields hold.

/**
 * Canonicalise any raw text into the accumulator string: digits only, no
 * leading zeros, capped at the last 6. Pasted times ("5:48.28", "33,68") and
 * padded display strings both regroup through this to the same value.
 */
export function normaliseDigits(raw: string): string {
  return (raw.match(/\d/g)?.join("") ?? "").replace(/^0+/, "").slice(-MAX_DIGITS);
}

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
    // Only ss out of range can land here (the shape is always well-formed).
    return { ms: null, text: null, error: "Seconds must be 00–59." };
  }
}

export const TimeField = forwardRef<
  HTMLInputElement,
  { digits: string; onDigits: (digits: string) => void }
>(function TimeField({ digits, onDigits }, forwardedRef) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  // Keep the latest digits reachable from the (stable) beforeinput listener.
  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  const setDigits = useCallback(
    (next: string) => onDigits(normaliseDigits(next)),
    [onDigits],
  );

  // Right-to-left accumulator. We read the intent from `beforeinput` and mutate
  // the model ourselves, then preventDefault so the browser never edits the
  // formatted string underneath us — that is what keeps the fill caret-free.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const onBeforeInput = (event: Event) => {
      const e = event as InputEvent;
      const type = e.inputType;
      if (
        type === "insertText" ||
        type === "insertFromPaste" ||
        type === "insertReplacementText"
      ) {
        const add = (
          e.data ??
          e.dataTransfer?.getData("text") ??
          ""
        ).replace(/\D/g, "");
        e.preventDefault();
        if (add) setDigits(digitsRef.current + add);
      } else if (type.startsWith("delete")) {
        // Any backspace/delete shifts out exactly the last digit.
        e.preventDefault();
        setDigits(digitsRef.current.slice(0, -1));
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [setDigits]);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

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
        ref={setRefs}
        id="time-entry"
        // Digit-only numeric keypad on mobile; colons are formatting only.
        inputMode="numeric"
        autoComplete="off"
        value={display}
        aria-describedby="time-echo"
        aria-invalid={parsed.error ? true : undefined}
        // Fallback for the rare browser without a cancelable `beforeinput`:
        // re-canonicalise whatever landed in the field (right-to-left preserved).
        onChange={(e) => setDigits(e.target.value)}
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
