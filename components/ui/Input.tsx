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
    // min-w-0 so the field can shrink inside a flex row or grid track. Without
    // it a flex/grid item keeps `min-width: auto`, which is the input's own
    // intrinsic width (roughly 20 characters) — two of these side by side then
    // refuse to fit a narrow card and spill out of it. w-full on the input so it
    // fills whatever width the wrapper is given.
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          "h-11 lg:h-9 touch:h-11 w-full rounded-lg border bg-white px-3 text-base text-gray-800 placeholder:text-gray-500 " +
          "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] outline-none " +
          "focus:border-brand-300 focus:shadow-focus-ring " +
          // A disabled state has to be AUTHORED here: `bg-white` and
          // `text-gray-800` above override the UA's own disabled rendering, so
          // without these a blocked field looked exactly like a live one and
          // still invited a tap. Inactive controls are exempt from WCAG 1.4.11,
          // which is why the recessive fill is allowed to be this quiet.
          "disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 " +
          "disabled:text-ink-faint disabled:placeholder:text-gray-400 " +
          "disabled:hover:border-gray-200 " +
          (error
            ? "border-error-500 bg-error-50 "
            : "border-gray-300 hover:border-gray-400 ") +
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
