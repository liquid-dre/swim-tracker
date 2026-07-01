import { InputHTMLAttributes, forwardRef, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className = "", id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          "h-9 rounded-md border bg-surface px-3 text-base text-ink placeholder:text-ink-muted " +
          "transition-[border-color] [transition-duration:var(--dur-1)] outline-none " +
          "focus:border-border-strong " +
          (error
            ? "border-danger bg-danger-subtle "
            : "border-border hover:border-border-strong ") +
          className
        }
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
