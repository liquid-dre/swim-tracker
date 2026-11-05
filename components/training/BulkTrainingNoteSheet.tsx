"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage, notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/*
  One note, many swimmers (§R16, bulk entry). A coach writes a focus and a
  body once and ticks who it applies to; each ticked swimmer gets it as their
  OWN personal note (edited and deleted on its own afterwards). The picker is
  grouped by squad with a per-squad select-all, because "the whole seniors
  squad" is the one-click case this sheet exists for.

  The server decides who is offered (listNoteRecipients): own club, and for a
  Senior / Junior coach only their age band today. Anyone else is simply not
  here — there is nothing a coach can do on this screen about a swimmer's age
  — and the band is stated once in the header so the gaps aren't a mystery.
  The save re-checks every id server-side and is all-or-nothing.

  Keyed by the parent on open so every field seeds fresh.
*/

type Recipient = { _id: Id<"swimmers">; name: string; age: number };
type Group = { key: string; name: string; swimmers: Recipient[] };
/** A group as rendered: its full membership plus the rows a search shows. */
type ShownGroup = Group & { shown: Recipient[] };

export function BulkTrainingNoteSheet({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const recipients = useQuery(
    api.trainingNotes.listNoteRecipients,
    open ? {} : "skip",
  );
  const createBatch = useMutation(api.trainingNotes.createTrainingNotesBatch);

  const [selected, setSelected] = useState<Set<Id<"swimmers">>>(new Set());
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState("");
  const [body, setBody] = useState("");
  const [noteDate, setNoteDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Squads first, then the squadless as their own group — one shape to render.
  const groups: Group[] = useMemo(() => {
    if (!recipients) return [];
    const out: Group[] = recipients.squads.map((s) => ({
      key: s._id,
      name: s.name,
      swimmers: s.swimmers,
    }));
    if (recipients.unsquadded.length > 0) {
      out.push({
        key: "none",
        name: recipients.squads.length > 0 ? "No squad" : "Swimmers",
        swimmers: recipients.unsquadded,
      });
    }
    return out;
  }, [recipients]);

  const total = useMemo(() => {
    const ids = new Set<Id<"swimmers">>();
    for (const g of groups) for (const s of g.swimmers) ids.add(s._id);
    return ids.size;
  }, [groups]);

  const needle = search.trim().toLowerCase();
  const searching = needle !== "";
  // A group keeps its FULL membership (for the count) and carries the rows the
  // search shows (what select-all acts on) — so the header never claims more
  // than it does.
  const visibleGroups: ShownGroup[] = useMemo(
    () =>
      searching
        ? groups
            .map((g) => ({
              ...g,
              shown: g.swimmers.filter((s) => s.name.toLowerCase().includes(needle)),
            }))
            .filter((g) => g.shown.length > 0)
        : groups.map((g) => ({ ...g, shown: g.swimmers })),
    [groups, needle, searching],
  );

  function toggle(id: Id<"swimmers">, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // A group's select-all acts on the swimmers currently SHOWN in it, so a
  // search then "all of Seniors" ticks exactly what the coach is looking at —
  // and the header says so while a search is active.
  function toggleGroup(group: ShownGroup, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of group.shown) {
        if (on) next.add(s._id);
        else next.delete(s._id);
      }
      return next;
    });
  }

  const count = selected.size;
  const canSave = count > 0 && body.trim() !== "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await createBatch({
        swimmerIds: Array.from(selected),
        focus: focus.trim() === "" ? undefined : focus.trim(),
        body: body.trim(),
        noteDate,
      });
      notify.success(
        result.created === 1
          ? "Training note added for 1 swimmer"
          : `Training note added for ${result.created} swimmers`,
      );
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const band = recipients?.ageBand ?? null;
  const bandText =
    band === null
      ? null
      : band.level === "JUNIOR"
        ? `You can write notes for swimmers ${band.juniorMaxAge} and under.`
        : `You can write notes for swimmers ${band.juniorMaxAge + 1} and over.`;

  const loading = recipients === undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>Add a note to several swimmers</SheetTitle>
          <SheetDescription>
            One note, added to each selected swimmer&rsquo;s timeline as their own
            personal note — visible to them and to their viewers.
            {bandText ? ` ${bandText}` : ""}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-2">
            {/* ── Who ─────────────────────────────────────────────────── */}
            <div
              role="group"
              aria-labelledby="bulk-note-who"
              className="flex min-w-0 flex-col gap-2"
            >
              <div className="flex items-end justify-between gap-3">
                <span id="bulk-note-who" className="text-sm font-medium text-gray-700">
                  Swimmers
                </span>
                <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span aria-live="polite" className="tabular-nums">
                    {count} of {total} selected
                  </span>
                  {count > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="rounded px-1 py-1 font-medium text-brand-500 outline-none hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </p>
              </div>

              {!loading && total > 6 && (
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a swimmer"
                    aria-label="Find a swimmer"
                    className="h-11 lg:h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink-muted outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
                  />
                </div>
              )}

              {/* Capped so the note fields stay a flick away on a sixty-swimmer
                  club; squad headers stick while the list scrolls under them. */}
              <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-gray-200 bg-white">
                {loading ? (
                  <ul aria-busy aria-label="Loading swimmers">
                    {[0, 1, 2, 3].map((i) => (
                      <li key={i} className="flex min-h-11 items-center gap-3 px-3 lg:min-h-9">
                        <Skeleton className="size-4" />
                        <Skeleton className="h-3 w-40" />
                      </li>
                    ))}
                  </ul>
                ) : total === 0 ? (
                  <p role="status" className="px-4 py-8 text-center text-sm text-ink-muted">
                    {band
                      ? "None of the club's active swimmers are in your age group right now."
                      : "No active swimmers to write to yet."}
                  </p>
                ) : visibleGroups.length === 0 ? (
                  <p role="status" className="px-4 py-8 text-center text-sm text-ink-muted">
                    No swimmer matches &ldquo;{search.trim()}&rdquo;.
                  </p>
                ) : (
                  visibleGroups.map((group) => (
                    <RecipientGroup
                      key={group.key}
                      group={group}
                      searching={searching}
                      selected={selected}
                      onToggle={toggle}
                      onToggleGroup={(on) => toggleGroup(group, on)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── What ────────────────────────────────────────────────── */}
            <Input
              label="Focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Streamlining & underwater"
              hint="Optional short title for the phase."
              maxLength={80}
            />

            <Textarea
              label="Note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What the training is focused on, and why."
              className="min-h-32"
              required
            />

            <DateField
              label="Applies from"
              value={noteDate}
              onChange={setNoteDate}
              hint="The date this phase starts — anchors each timeline and chart marker."
            />
          </div>

          {error && (
            <p className="px-4 py-2 text-xs text-danger-ink" role="alert">
              {error}
            </p>
          )}

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
              {count === 0
                ? "Add note"
                : count === 1
                  ? "Add note to 1 swimmer"
                  : `Add note to ${count} swimmers`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// One squad: a select-all header row, then its members
// ---------------------------------------------------------------------------

const CHECKBOX =
  "size-4 shrink-0 rounded border-gray-300 accent-brand-500 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

function RecipientGroup({
  group,
  searching,
  selected,
  onToggle,
  onToggleGroup,
}: {
  group: ShownGroup;
  searching: boolean;
  selected: Set<Id<"swimmers">>;
  onToggle: (id: Id<"swimmers">, on: boolean) => void;
  onToggleGroup: (on: boolean) => void;
}) {
  // The count is always over the WHOLE squad; select-all acts on what is shown.
  const picked = group.swimmers.filter((s) => selected.has(s._id)).length;
  const shownPicked = group.shown.filter((s) => selected.has(s._id)).length;
  const allShown = shownPicked === group.shown.length;
  const someShown = shownPicked > 0 && !allShown;

  // `indeterminate` is a DOM property, not an attribute.
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someShown;
  }, [someShown]);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <label className="sticky top-0 z-10 flex min-h-11 cursor-pointer items-center gap-3 border-b border-gray-100 bg-surface-2 px-3 py-1.5 focus-within:bg-gray-100 lg:min-h-9">
        <input
          ref={headRef}
          type="checkbox"
          checked={allShown}
          onChange={(e) => onToggleGroup(e.target.checked)}
          aria-label={
            searching
              ? `Select the ${group.shown.length} shown in ${group.name}`
              : `Select everyone in ${group.name}`
          }
          className={CHECKBOX}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {group.name}
        </span>
        <span className="text-xs tabular-nums text-ink-muted">
          {picked}/{group.swimmers.length}
          {searching && ` · ${group.shown.length} shown`}
        </span>
      </label>
      <ul>
        {group.shown.map((s) => {
          const on = selected.has(s._id);
          return (
            <li key={s._id}>
              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-50 focus-within:bg-gray-50 lg:min-h-9",
                  on && "bg-brand-50/60 hover:bg-brand-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle(s._id, e.target.checked)}
                  className={CHECKBOX}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                <span className="text-xs tabular-nums text-ink-muted">{s.age}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
