"use client";

import { useRef } from "react";

// Segmented control — the shared pattern for course (SCM/LCM) and the
// target-tier toggle (BRD §5.10). Single accent marks the active segment.
// Real radio-group keyboard model: one tab stop (the active segment), arrow
// keys move selection and focus (roving tabindex).

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + options.length) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-100 p-0.5"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={
              // ≥44px segments on touch viewports (PRODUCT.md); h-8 from lg up
              // aligns with the h-9 toolbar controls in the dense desktop rows.
              "h-11 lg:h-8 rounded-sm px-3.5 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
              (active
                ? "bg-white text-gray-800 shadow-theme-xs"
                : "text-gray-500 hover:text-gray-800")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
