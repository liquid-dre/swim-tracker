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
  The one date picker for the whole app — a flip calendar you can also TYPE into.
  Adapted from the requested dayzed/motion component into a controlled form field
  on our tokens: the field is a real text input (so a coach can key a whole date
  straight in — "2026-07-01", "1/7/2026" or "1 Jul 2026" all parse), with a
  calendar button that opens the signature flip card + month grid in a portaled
  popover where the animation has room to breathe. Value is an ISO "YYYY-MM-DD"
  string (or "" for none); typing and clicking both commit live, so the field and
  flip card stay in lock-step and the popover dismisses on outside/Escape.

  The month grid is a small local implementation (dayzed's peer range stops at
  React 18); `« ‹ month year › »` navigates month and — with the double chevrons —
  whole years, and the year itself is a typeable field so a date of birth years
  back is reachable without a long scroll. Days outside [min, max] are DISABLED,
  never hidden, matching the event-selector convention. Honours
  `prefers-reduced-motion` by swapping the flip for a fade.
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

/** Month name (any case, ≥3 letters) → 1-based month number, or null. */
function monthFromName(name: string): number | null {
  const key = name.slice(0, 3).toLowerCase();
  const i = MONTH_NAMES.findIndex((m) => m.toLowerCase() === key);
  return i < 0 ? null : i + 1;
}

/** Expand a 2-digit year to a full one (<50 → 20xx, else 19xx); pass 4-digit through. */
function normaliseYear(n: number, digits: number): number {
  if (digits <= 2) return n < 50 ? 2000 + n : 1900 + n;
  return n;
}

/**
 * Parse a hand-typed date into an ISO "YYYY-MM-DD" string, or null when it can't
 * be read unambiguously. Day-first for the numeric forms (SA convention), and
 * month names are accepted in either order:
 *   "2026-07-01", "2026/7/1", "1/7/2026", "1-7-26", "1 Jul 2026", "Jul 1, 2026".
 * Validates the calendar day (so "31 Feb" is rejected); range against min/max is
 * the field's job, not this pure parser's.
 */
function parseTypedDate(input: string): string | null {
  const t = input.trim();
  if (t === "") return null;

  let y: number | null = null;
  let mo: number | null = null;
  let d: number | null = null;
  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t))) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = normaliseYear(Number(m[3]), m[3].length);
  } else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{2,4})$/.exec(t))) {
    d = Number(m[1]);
    mo = monthFromName(m[2]);
    y = normaliseYear(Number(m[3]), m[3].length);
  } else if ((m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(t))) {
    mo = monthFromName(m[1]);
    d = Number(m[2]);
    y = normaliseYear(Number(m[3]), m[3].length);
  } else {
    return null;
  }

  if (mo === null || mo < 1 || mo > 12) return null;
  if (d === null || d < 1) return null;
  if (y === null || y < 1900 || y > 2100) return null;
  // Last day of the 1-based month `mo` (Date's month arg is 0-based, so day 0
  // of month `mo` is the last day of month `mo`).
  const daysInMonth = new Date(y, mo, 0).getDate();
  if (d > daysInMonth) return null;

  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

  const selected = useMemo(() => parseIso(value), [value]);
  const displayText = selected ? format(selected, "d MMM yyyy") : "";

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => displayText);
  // A quiet, typing-specific hint (bad format / out of range). Distinct from the
  // caller's `error` (form validation); either one styles + describes the field.
  const [localError, setLocalError] = useState<string | null>(null);

  // Mirror the committed value into the input when it changes externally — but
  // never mid-edit (that would fight the user's keystrokes) and never while a
  // typing hint is showing (that would erase the text they still need to fix).
  // Adjusting state during render (React's documented pattern) instead of in an
  // effect keeps the input in one paint with the value it reflects.
  const [syncedDisplay, setSyncedDisplay] = useState(displayText);
  if (displayText !== syncedDisplay && !focused && !localError) {
    setSyncedDisplay(displayText);
    setText(displayText);
  }

  const effectiveError = error ?? localError ?? undefined;
  const describedBy = effectiveError
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const boundLabel = (iso?: string): string => {
    const d = iso ? parseIso(iso) : null;
    return d ? format(d, "d MMM yyyy") : "";
  };

  // Finalise typed text (blur / Enter): empty clears, a valid in-range date
  // commits and normalises the display, anything else keeps the text and shows a
  // quiet hint so it can be corrected.
  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setLocalError(null);
      if (value !== "") onChange("");
      return;
    }
    const iso = parseTypedDate(trimmed);
    if (iso === null) {
      setLocalError("Try a date like 2026-07-01 or 1 Jul 2026.");
      return;
    }
    if (min && iso < min) {
      setLocalError(`Choose a date on or after ${boundLabel(min)}.`);
      return;
    }
    if (max && iso > max) {
      setLocalError(`Choose a date on or before ${boundLabel(max)}.`);
      return;
    }
    setLocalError(null);
    // Normalise the display to the canonical "d MMM yyyy" right away, so Enter
    // tidies "7/2/2025" → "7 Feb 2025" without waiting for a blur.
    const norm = parseIso(iso);
    if (norm) setText(format(norm, "d MMM yyyy"));
    if (iso !== value) onChange(iso);
  }

  // Live-parse while typing: a valid in-range date updates the calendar + flip
  // card at once; otherwise hold the last committed value and defer the hint to
  // blur so we never nag mid-keystroke.
  function handleChange(raw: string) {
    setText(raw);
    setLocalError(null);
    const iso = parseTypedDate(raw.trim());
    if (iso !== null && inRange(iso) && iso !== value) onChange(iso);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-danger-ink">*</span>}
      </label>

      <div
        data-invalid={effectiveError ? true : undefined}
        className={cn(
          "flex h-9 items-center gap-1 rounded-lg border bg-white pl-3 pr-1 text-base",
          "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)]",
          "focus-within:border-brand-300 focus-within:shadow-focus-ring",
          disabled && "cursor-not-allowed opacity-50",
          effectiveError
            ? "border-error-500 bg-error-50"
            : "border-gray-300 hover:border-gray-400",
        )}
      >
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={effectiveError ? true : undefined}
          aria-describedby={describedBy}
          onFocus={() => setFocused(true)}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-gray-800 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
        />

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={label ? `Open calendar for ${label}` : "Open calendar"}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-faint outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <CalendarIcon aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-auto p-0">
            <FlipCalendar
              selected={selected}
              min={min ? parseIso(min) : null}
              max={max ? parseIso(max) : null}
              onSelect={(d) => {
                setLocalError(null);
                onChange(toIso(d));
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {effectiveError ? (
        <p id={`${inputId}-error`} className="text-xs text-danger-ink">
          {effectiveError}
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
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <span>{MONTH_NAMES[view.month]}</span>
          <YearField
            year={view.year}
            onYear={(y) => setView((v) => ({ ...v, year: y }))}
          />
        </div>
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

/** Typeable year in the calendar header — pick via chevrons or key it straight in. */
function YearField({
  year,
  onYear,
}: {
  year: number;
  onYear: (year: number) => void;
}) {
  const [draft, setDraft] = useState(String(year));
  // Resync when the year prop changes (chevrons, or a committed key-in) using
  // React's render-time adjustment pattern rather than an effect.
  const [prevYear, setPrevYear] = useState(year);
  if (year !== prevYear) {
    setPrevYear(year);
    setDraft(String(year));
  }

  function commit(v: string) {
    const n = parseInt(v, 10);
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) onYear(n);
    else setDraft(String(year)); // out of range → snap back to the shown year
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Year"
      value={draft}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
        setDraft(digits);
        if (digits.length === 4) commit(digits);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(draft);
          e.currentTarget.blur();
        }
      }}
      className="w-[3.25rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-200 focus:border-brand-300 focus:shadow-focus-ring"
    />
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
