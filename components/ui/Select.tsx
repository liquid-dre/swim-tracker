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

/**
 * "" → the sentinel, but ONLY where the caller offers an empty option.
 *
 * Two different situations wear the same `value=""`, and they want opposite
 * things from Radix:
 *
 *   an empty OPTION exists ("Not set", "All squads", "Not listed") — the
 *     trigger should read that option's own label, so it needs a real value
 *     Radix can match an `Item` against, hence the sentinel.
 *
 *   no empty option — "" means nothing is chosen yet and the trigger should
 *     read the PLACEHOLDER. Radix gates that on
 *     `shouldShowPlaceholder(v) = v === "" || v === undefined`, so "" has to
 *     pass straight through. Sending the sentinel here is what blanked
 *     "Choose a club" and eight other pickers.
 *
 * Either way the value is a string, never `undefined`, so the component stays
 * controlled for its whole life — which is the bug this pair exists for.
 */
export function toRadixValue(value: string, hasEmptyOption: boolean): string {
  return value === "" && hasEmptyOption ? EMPTY : value;
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
  const hasEmptyOption = options.some((o) => o.value === "");
  return (
    <SelectPrimitive.Root
      value={toRadixValue(value, hasEmptyOption)}
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
          "group inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring data-[placeholder]:text-ink-faint",
          // Authored, as `Input` authors it, not `opacity-50`. `bg-white` and
          // `text-gray-800` above override the UA's disabled rendering anyway,
          // and an opacity COMPOSITES: inside MultiMeetReview's skipped row,
          // which already dims itself to 60% to show what is being declined,
          // 0.6 × 0.5 landed the ink at 1.85:1 — below the 2.11:1 that row's
          // own comment rejects — while the Inputs beside it stayed at 60%.
          // One row, two recession depths, neither of them the stated one.
          "disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-ink-faint disabled:hover:border-gray-200",
          // Both sizes carry the same height rule - 44px everywhere a finger
          // reaches (PRODUCT.md), compacting only on a pointer-driven lg+
          // surface. They differ in TYPE, not in target. `md` was swept with
          // `sm` left behind, so a meet form stacked five 36px fields and then
          // a 44px Course select 8px proud of all of them.
          size === "sm"
            ? "h-11 px-3 text-sm lg:h-9 touch:h-11"
            : "h-11 px-3 text-base lg:h-9 touch:h-11",
          className,
        )}
      >
        <span className="truncate text-left">
          {/* With an empty option the trigger reads that option's own label,
              because it has a real value for Radix to match. Without one, ""
              reaches Radix untouched and this placeholder is what shows. */}
          <SelectPrimitive.Value placeholder={placeholder} />
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
                value={toRadixValue(o.value, hasEmptyOption)}
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
