"use client";

// Segmented control — the shared pattern for course (SCM/LCM) and the
// target-tier toggle (BRD §5.10). Single accent marks the active segment;
// keyboard-operable via native radio semantics.

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
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-100 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              // ≥44px segments on touch viewports (PRODUCT.md); h-8 from lg up
              // aligns with the h-9 toolbar controls in the dense desktop rows.
              "h-11 lg:h-8 rounded-sm px-3.5 text-sm font-medium transition-colors [transition-duration:var(--dur-1)] " +
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
