"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import { formatShortDate } from "@/lib/format";
import { PatternForm } from "./PatternForm";
import { formatTimeRange, formatWeekdays } from "./attendance-format";

/*
  Manage the recurring schedule (§R18). Coaches define named patterns; "Generate
  season" materialises every active pattern across the current season window.
  Generation freezes the past, preserves hand-overrides, and refreshes clean future
  sessions — so re-running it is always safe.
*/

type Pattern = {
  _id: Id<"sessionPatterns">;
  name: string;
  weekdays: number[];
  startMin: number;
  endMin: number;
  squadIds: Id<"squads">[];
  squadNames: string[];
  label: string | null;
  location: string | null;
  active: boolean;
};

export function ScheduleScreen() {
  const patterns = useQuery(api.sessionPatterns.listPatterns, {});
  const squads = useQuery(api.squads.listSquads, {});
  const settings = useQuery(api.settings.getAppSettings, {});
  const regenerate = useMutation(api.sessionPatterns.regenerateSeason);
  const updatePattern = useMutation(api.sessionPatterns.updatePattern);
  const deletePattern = useMutation(api.sessionPatterns.deletePattern);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pattern | null>(null);
  const [toDelete, setToDelete] = useState<Pattern | null>(null);
  const [generating, setGenerating] = useState(false);

  const squadsForForm = squads ?? [];

  async function onGenerate() {
    setGenerating(true);
    try {
      await notify.promise(regenerate({}), {
        loading: "Generating sessions…",
        success: (r) =>
          r.generated === 0
            ? "Schedule up to date — no new sessions"
            : `${r.generated} session${r.generated === 1 ? "" : "s"} generated through ${formatShortDate(r.to)}`,
      });
    } catch {
      // notify surfaces the server message
    } finally {
      setGenerating(false);
    }
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(p: Pattern) {
    setEditing(p);
    setFormOpen(true);
  }

  const seasonNote =
    settings == null
      ? null
      : settings.seasonEnd
        ? `Sessions generate through the season end, ${formatShortDate(settings.seasonEnd)}.`
        : "No season end is set — sessions generate up to a year ahead. Set a season end to bound the schedule.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Schedule"
        breadcrumb={trailForHref("/attendance/schedule")}
        description="Recurring training patterns."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onGenerate} loading={generating}>
              <CalendarClock className="size-4" aria-hidden />
              Generate season
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" aria-hidden />
              New pattern
            </Button>
          </div>
        }
      />

      {seasonNote && <p className="text-sm text-ink-muted">{seasonNote}</p>}

      {patterns === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      ) : patterns.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-theme-sm">
          <p className="text-sm font-medium text-ink">No patterns yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add a recurring practice, then generate the season to fill the calendar.
          </p>
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" aria-hidden />
              New pattern
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
          {patterns.map((p) => (
            <div
              key={p._id}
              className="flex flex-col gap-3 border-b border-gray-100 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                  {!p.active && <Badge variant="secondary">Paused</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {formatWeekdays(p.weekdays)} · {formatTimeRange(p.startMin, p.endMin)}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {p.squadNames.join(", ")}
                  {p.location ? ` · ${p.location}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${p.active ? "Pause" : "Resume"} ${p.name}`}
                  onClick={() =>
                    notify.promise(
                      updatePattern({ patternId: p._id, active: !p.active }),
                      {
                        loading: p.active ? "Pausing…" : "Resuming…",
                        success: p.active ? "Pattern paused" : "Pattern resumed",
                      },
                    )
                  }
                >
                  {p.active ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => setToDelete(p)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PatternForm
        key={editing?._id ?? (formOpen ? "new-open" : "new-closed")}
        open={formOpen}
        onOpenChange={setFormOpen}
        squads={squadsForForm}
        pattern={editing}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this pattern?"
        description="Upcoming unmarked sessions from this pattern are removed. Past and already-marked sessions are kept."
        confirmLabel="Delete pattern"
        onConfirm={async () => {
          if (!toDelete) return;
          await deletePattern({ patternId: toDelete._id });
          notify.success("Pattern deleted");
          setToDelete(null);
        }}
      />
    </div>
  );
}
