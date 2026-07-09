"use client";

import { useId, useMemo, useRef, useState } from "react";

import { MENU_PANEL } from "@/components/ui/menu-styles";
import { cn } from "@/lib/utils";

/*
  Filter-as-you-type picker over existing accounts for the assign-coach form.
  A real combobox (ARIA 1.2 pattern, lean): the input filters by name or
  email as the super-user types, arrows move the highlight, Enter picks,
  Escape closes. Selecting fills the field with the account's name and pins
  the choice; typing anything afterwards clears it (the parent owns only the
  selected account — free text is never submitted).
*/

export type AssignableAccount = {
  profileId: string;
  name: string;
  email: string;
  role: "COACH" | "VIEWER";
  clubName: string | null;
};

const MAX_SHOWN = 8;

export function AccountCombobox({
  accounts,
  selected,
  onSelect,
  disabled = false,
}: {
  /** undefined = still loading. */
  accounts: AssignableAccount[] | undefined;
  selected: AssignableAccount | null;
  onSelect: (account: AssignableAccount | null) => void;
  disabled?: boolean;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (accounts === undefined) return [];
    const needle = query.trim().toLowerCase();
    const pool =
      needle === ""
        ? accounts
        : accounts.filter(
            (a) =>
              a.name.toLowerCase().includes(needle) ||
              a.email.toLowerCase().includes(needle),
          );
    return pool.slice(0, MAX_SHOWN);
  }, [accounts, query]);

  function pick(account: AssignableAccount) {
    onSelect(account);
    setQuery(account.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + matches.length) % Math.max(matches.length, 1));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={`${listboxId}-input`} className="text-sm font-medium text-gray-700">
        Coach account
      </label>
      <input
        ref={inputRef}
        id={`${listboxId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listboxId}-${matches[active].profileId}` : undefined
        }
        type="text"
        autoComplete="off"
        placeholder={
          accounts === undefined ? "Loading accounts…" : "Type a name or email…"
        }
        disabled={disabled || accounts === undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null); // typing invalidates the pinned choice
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={
          "h-11 lg:h-9 rounded-lg border bg-white px-3 text-base text-gray-800 placeholder:text-gray-500 " +
          "transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] outline-none " +
          "focus:border-brand-300 focus:shadow-focus-ring border-gray-300 hover:border-gray-400 " +
          "disabled:cursor-not-allowed disabled:opacity-50"
        }
      />

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Matching accounts"
          className={cn(MENU_PANEL, "absolute top-full z-50 mt-1 max-h-72 w-full overflow-auto")}
        >
          {matches.length === 0 ? (
            <li className="px-2 py-2 text-sm text-ink-muted" role="presentation">
              No account matches — for someone without an account, use
              “Invite a coach” above.
            </li>
          ) : (
            matches.map((a, i) => (
              <li
                key={a.profileId}
                id={`${listboxId}-${a.profileId}`}
                role="option"
                aria-selected={selected?.profileId === a.profileId}
                // mousedown (not click) so the input's blur doesn't close the
                // list before the choice registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(a);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer select-none items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                  "transition-colors [transition-duration:var(--dur-1)]",
                  i === active ? "bg-accent text-primary" : "text-gray-700",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {a.email}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {a.role === "COACH"
                    ? `Coach${a.clubName ? ` · ${a.clubName}` : ""}`
                    : "Viewer"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      {/* Confirm exactly who was picked before the button is pressed. */}
      <p className="min-h-4 text-xs text-ink-muted">
        {selected
          ? `${selected.email} · ${
              selected.role === "COACH"
                ? `currently coaches ${selected.clubName ?? "no club"}`
                : "currently a viewer"
            }`
          : "Pick an existing account; assigning again moves a coach between clubs."}
      </p>
    </div>
  );
}
