import { TextareaHTMLAttributes, forwardRef, useId } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

// Labeled textarea — same token vocabulary as <Input> (DESIGN.md components).
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, className = "", id, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const describedBy = error
      ? `${fieldId}-error`
      : hint
        ? `${fieldId}-hint`
        : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={
            "min-h-20 rounded-md border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted " +
            "transition-[border-color] [transition-duration:var(--dur-1)] outline-none resize-y " +
            "focus:border-border-strong " +
            (error
              ? "border-danger bg-danger-subtle "
              : "border-border hover:border-border-strong ") +
            className
          }
          {...props}
        />
        {error ? (
          <p id={`${fieldId}-error`} className="text-xs text-danger-ink">
            {error}
          </p>
        ) : hint ? (
          <p id={`${fieldId}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
