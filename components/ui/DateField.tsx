"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/*
  The one date picker for the whole app — a flip calendar. Adapted from the
  requested dayzed/motion component into a controlled form field on our tokens:
  the trigger matches the sibling text inputs (so forms stay one visual language
  and we never nest a card in a card), while the signature flip card + month grid
  live in a portaled popover where the animation has room to breathe. Value is an
  ISO "YYYY-MM-DD" string (or "" for none); selection commits live, so the trigger
  and flip card update as you click and the popover dismisses on outside/Escape.

  The month grid is a small local implementation (dayzed's peer range stops at
  React 18); `« ‹ month year › »` navigates month and — with the double chevrons —
  whole years, so a date of birth years back is reachable without a long scroll.
  Days outside [min, max] are DISABLED, never hidden, matching the event-selector
  convention. Honours `prefers-reduced-motion` by swapping the flip for a fade.
*/

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Pure date helpers — local-time (never UTC), so an ISO day never shifts.
// ---------------------------------------------------------------------------

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Weeks of the given month as a 7-wide grid; leading/trailing cells are null. */
function buildCalendar(year: number, month: number): (Date | null)[][] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// DateField — the public form control
// ---------------------------------------------------------------------------

export interface DateFieldProps {
  label: string;
  /** ISO "YYYY-MM-DD" or "" when nothing is chosen. */
  value: string;
  onChange: (iso: string) => void;
  /** Inclusive bounds as ISO strings; days outside are disabled. */
  min?: string;
  max?: string;
  id?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  id,
  hint,
  error,
  required,
  disabled,
  placeholder = "Select a date",
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  const [open, setOpen] = useState(false);

  const selected = useMemo(() => parseIso(value), [value]);
  const triggerText = selected ? format(selected, "d MMM yyyy") : placeholder;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-danger-ink">*</span>}
      </label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={inputId}
            disabled={disabled}
            aria-label={ariaLabel}
            data-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "flex h-9 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-base outline-none",
              "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)]",
              "focus:border-brand-300 focus:shadow-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-error-500 bg-error-50"
                : "border-gray-300 hover:border-gray-400",
            )}
          >
            <span className={cn("truncate", selected ? "text-gray-800" : "text-gray-500")}>
              {triggerText}
            </span>
            <CalendarIcon aria-hidden className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto p-0">
          <FlipCalendar
            selected={selected}
            min={min ? parseIso(min) : null}
            max={max ? parseIso(max) : null}
            onSelect={(d) => onChange(toIso(d))}
          />
        </PopoverContent>
      </Popover>

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
}

// ---------------------------------------------------------------------------
// FlipCalendar — the flip display + month grid inside the popover
// ---------------------------------------------------------------------------

function FlipCalendar({
  selected,
  min,
  max,
  onSelect,
}: {
  selected: Date | null;
  min: Date | null;
  max: Date | null;
  onSelect: (d: Date) => void;
}) {
  // The grid opens on the selected month, else the max (usually today), else now.
  const anchor = selected ?? max ?? new Date();
  const [view, setView] = useState({
    year: anchor.getFullYear(),
    month: anchor.getMonth(),
  });
  // Bumped on each pick so the flip card knows to turn a fresh page.
  const [flip, setFlip] = useState(0);

  const weeks = useMemo(
    () => buildCalendar(view.year, view.month),
    [view.year, view.month],
  );

  function shift(months: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + months, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function outOfRange(d: Date): boolean {
    if (min && d < new Date(min.getFullYear(), min.getMonth(), min.getDate())) return true;
    if (max && d > new Date(max.getFullYear(), max.getMonth(), max.getDate())) return true;
    return false;
  }

  function handleSelect(d: Date) {
    onSelect(d);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setFlip((n) => n + 1);
  }

  return (
    <div className="flex w-64 flex-col gap-3 p-3">
      <FlipDisplay date={selected} flip={flip} />

      {/* Month / year navigation: single chevrons step a month, double a year. */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <NavButton label="Previous year" onClick={() => shift(-12)}>
            <ChevronsLeft className="size-4" />
          </NavButton>
          <NavButton label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </NavButton>
        </div>
        <span className="text-sm font-medium text-ink">
          {MONTH_NAMES[view.month]} {view.year}
        </span>
        <div className="flex items-center gap-0.5">
          <NavButton label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </NavButton>
          <NavButton label="Next year" onClick={() => shift(12)}>
            <ChevronsRight className="size-4" />
          </NavButton>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7">
        {WEEKDAY_NAMES.map((w) => (
          <div key={w} className="text-center text-2xs font-medium uppercase text-ink-faint">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((d, i) => {
          if (!d) return <div key={i} aria-hidden />;
          const isSelected = selected ? sameDay(d, selected) : false;
          const disabled = outOfRange(d);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={format(d, "EEEE d MMMM yyyy")}
              aria-pressed={isSelected}
              onClick={() => handleSelect(d)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm tabular-nums outline-none",
                "transition-colors [transition-duration:var(--dur-1)]",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-brand-500 font-medium text-white"
                  : disabled
                    ? "cursor-not-allowed text-ink-faint opacity-40"
                    : "text-gray-700 hover:bg-accent hover:text-primary",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FlipDisplay — the signature flip card (month · big day · year)
// ---------------------------------------------------------------------------

function FlipDisplay({ date, flip }: { date: Date | null; flip: number }) {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="overflow-hidden rounded-xl border border-brand-500 bg-brand-500">
      <div className="px-3 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-white/90">
          {date ? format(date, "LLLL") : "—"}
        </span>
      </div>
      <div className="relative z-0 h-24 w-full bg-white">
        {date === null ? (
          <div className="grid h-full w-full place-content-center text-sm text-ink-faint">
            Pick a date
          </div>
        ) : reduced ? (
          <StaticDay date={date} />
        ) : (
          <AnimatePresence mode="sync">
            <motion.div
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
                zIndex: -flip,
                backfaceVisibility: "hidden",
              }}
              key={flip}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              initial={{ rotateX: "0deg" }}
              animate={{ rotateX: "0deg" }}
              exit={{ rotateX: "-180deg" }}
              className="absolute inset-0"
            >
              <DayFace date={date} />
            </motion.div>
            <motion.div
              style={{
                clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)",
                zIndex: flip,
                backfaceVisibility: "hidden",
              }}
              key={(flip + 1) * 2}
              initial={{ rotateX: "180deg" }}
              animate={{ rotateX: "0deg" }}
              exit={{ rotateX: "0deg" }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <DayFace date={date} showYear />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function DayFace({ date, showYear }: { date: Date; showYear?: boolean }) {
  return (
    <div className="relative grid h-full w-full place-content-center bg-white text-5xl font-semibold tabular-nums text-ink">
      {format(date, "do")}
      {showYear && (
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs font-normal text-ink-muted">
          {format(date, "yyyy")}
        </span>
      )}
    </div>
  );
}

function StaticDay({ date }: { date: Date }) {
  return (
    <div className="grid h-full w-full place-content-center bg-white text-5xl font-semibold tabular-nums text-ink">
      {format(date, "do")}
      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs font-normal text-ink-muted">
        {format(date, "yyyy")}
      </span>
    </div>
  );
}
