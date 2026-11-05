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
  const visibleGroups = useMemo(
    () =>
      needle === ""
        ? groups
        : groups
            .map((g) => ({
              ...g,
              swimmers: g.swimmers.filter((s) =>
                s.name.toLowerCase().includes(needle),
              ),
            }))
            .filter((g) => g.swimmers.length > 0),
    [groups, needle],
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
  // search then "all of Seniors" ticks exactly what the coach is looking at.
  function toggleGroup(group: Group, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of group.swimmers) {
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
            personal note.{bandText ? ` ${bandText}` : ""}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-2">
            {/* ── Who ─────────────────────────────────────────────────── */}
            <fieldset className="flex min-w-0 flex-col gap-2">
              <div className="flex items-end justify-between gap-3">
                <legend className="text-sm font-medium text-gray-700">
                  Swimmers
                </legend>
                <p className="text-xs tabular-nums text-ink-muted" aria-live="polite">
                  {count} of {total} selected
                  {count > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="font-medium text-brand-500 hover:text-brand-600"
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
                    className="h-11 lg:h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base text-ink placeholder:text-ink-muted outline-none transition-[border-color] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
                  />
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {loading ? (
                  <ul className="divide-y divide-gray-100" aria-busy>
                    {[0, 1, 2, 3].map((i) => (
                      <li key={i} className="h-11 animate-pulse bg-white" />
                    ))}
                  </ul>
                ) : total === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink-muted">
                    {band
                      ? "None of the club's active swimmers are in your age group right now."
                      : "No active swimmers to write to yet."}
                  </p>
                ) : visibleGroups.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink-muted">
                    No swimmer matches &ldquo;{search.trim()}&rdquo;.
                  </p>
                ) : (
                  visibleGroups.map((group) => (
                    <RecipientGroup
                      key={group.key}
                      group={group}
                      selected={selected}
                      onToggle={toggle}
                      onToggleGroup={(on) => toggleGroup(group, on)}
                    />
                  ))
                )}
              </div>
            </fieldset>

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

function RecipientGroup({
  group,
  selected,
  onToggle,
  onToggleGroup,
}: {
  group: Group;
  selected: Set<Id<"swimmers">>;
  onToggle: (id: Id<"swimmers">, on: boolean) => void;
  onToggleGroup: (on: boolean) => void;
}) {
  const picked = group.swimmers.filter((s) => selected.has(s._id)).length;
  const all = picked === group.swimmers.length;
  const some = picked > 0 && !all;

  // `indeterminate` is a DOM property, not an attribute.
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = some;
  }, [some]);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-3 bg-surface-2 px-3 py-2">
        <input
          ref={headRef}
          type="checkbox"
          checked={all}
          onChange={(e) => onToggleGroup(e.target.checked)}
          aria-label={`Select everyone in ${group.name}`}
          className="size-4 accent-brand-500"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {group.name}
        </span>
        <span className="text-xs tabular-nums text-ink-muted">
          {picked}/{group.swimmers.length}
        </span>
      </label>
      <ul>
        {group.swimmers.map((s) => {
          const on = selected.has(s._id);
          return (
            <li key={s._id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-50",
                  on && "bg-brand-50/60",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle(s._id, e.target.checked)}
                  className="size-4 accent-brand-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                <span className="text-xs tabular-nums text-ink-faint">{s.age}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
