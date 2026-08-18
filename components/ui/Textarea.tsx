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
      // min-w-0 + w-full for the same reason as <Input>: a form control must
      // fill the space it is given and be able to shrink below its intrinsic
      // width, or it spills out of a narrow flex row or grid track.
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={
            "min-h-20 w-full rounded-lg border bg-white px-3 py-2 text-base text-gray-800 placeholder:text-gray-500 " +
            "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] outline-none resize-y " +
            "focus:border-brand-300 focus:shadow-focus-ring " +
            (error
              ? "border-error-500 bg-error-50 "
              : "border-gray-300 hover:border-gray-400 ") +
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
