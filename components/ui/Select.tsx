"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { MENU_ITEM, MENU_PANEL } from "./menu-styles";

/*
  The one styled value picker (Step R11). A Radix Select — full keyboard, focus
  and aria behaviour — dressed in the shared menu language (white rounded panel,
  soft shadow, brand-tinted rows, staggered entrance) so every filter select and
  the swimmer pickers read identically. The trigger keeps the old slim look; its
  chevron rotates 180° on open. Options are passed as data, not <option> markup.
*/

/**
 * What Radix is told when the caller's value is "".
 *
 * Radix decides controlled-vs-uncontrolled by `prop !== undefined`, so passing
 * `value || undefined` for an empty selection flipped the component to
 * UNCONTROLLED on every clear — and Radix then fell back to the stale value it
 * had stored while uncontrolled. Pick Day 2, then pick "Not listed", and the
 * trigger still read "Day 2" while the data said none. That hit every select
 * with a selectable empty option: course "Not set", the gala tag, squad
 * filters, the programme's day picker.
 *
 * A sentinel keeps the component controlled for its whole life. It never
 * escapes this file: it is mapped in on the way to Radix and out again in
 * `onValueChange`.
 */
const EMPTY = "__none__";

/** "" → the sentinel, so Radix is never handed `undefined` and never flips. */
export function toRadixValue(value: string): string {
  return value === "" ? EMPTY : value;
}

/** The sentinel → "", so the sentinel never escapes this module. */
export function fromRadixValue(value: string): string {
  return value === EMPTY ? "" : value;
}

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Typeahead text when `label` isn't a plain string. */
  textValue?: string;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  size = "sm",
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
  contentClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  "aria-label"?: string;
  /**
   * Declared, because a hyphenated JSX attribute is exempt from TypeScript's
   * excess-property check: passing `aria-describedby` to a wrapper that does
   * not accept it compiles clean and reaches no DOM node. The roster's day
   * picker did exactly that, so the warning contradicting its value was
   * announced by nothing.
   */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={toRadixValue(value)}
      onValueChange={(next) => onValueChange(fromRadixValue(next))}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        data-slot="select-trigger"
        className={cn(
          "group inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-ink-faint",
          // "sm" is still ≥44px on touch viewports (PRODUCT.md), compacting
          // to h-9 only in the dense lg+ toolbars.
          size === "sm" ? "h-11 px-3 text-sm lg:h-9" : "h-11 px-3 text-base",
          className,
        )}
      >
        <span className="truncate text-left">
          {/* The empty option now has a real value (`EMPTY`), so Radix renders
              its own label and the placeholder is only reached when a caller
              supplies no empty option at all. Kept as the fallback for that
              case, and because an explicit `placeholder` should still win. */}
          <SelectPrimitive.Value
            placeholder={
              placeholder ?? options.find((o) => o.value === "")?.label ?? undefined
            }
          />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-ink-faint transition-transform [transition-duration:var(--dur-2)] group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            MENU_PANEL,
            "max-h-(--radix-select-content-available-height) min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="stagger-menu flex max-h-[inherit] flex-col gap-0.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={toRadixValue(o.value)}
                disabled={o.disabled}
                textValue={
                  o.textValue ?? (typeof o.label === "string" ? o.label : undefined)
                }
                className={cn(MENU_ITEM, "pr-8")}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
