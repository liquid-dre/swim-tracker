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
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5"
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
              "h-7 rounded-sm px-3 text-sm font-medium transition-colors [transition-duration:var(--dur-1)] " +
              (active
                ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                : "text-ink-muted hover:text-ink")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
