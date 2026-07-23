"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";
import { SquadCheckboxes, TimeInput, WeekdayCheckboxes } from "./controls";

/*
  Create or edit a recurring session pattern (§R18). Saving materialises the
  pattern's future sessions across the season window; the toast reports how many
  were generated. Past, marked and hand-overridden sessions are never touched.
*/

type PatternInit = {
  _id: Id<"sessionPatterns">;
  name: string;
  weekdays: number[];
  startMin: number;
  endMin: number;
  squadIds: Id<"squads">[];
  label: string | null;
  location: string | null;
  active: boolean;
};

export function PatternForm({
  open,
  onOpenChange,
  squads,
  pattern,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squads: Array<{ _id: Id<"squads">; name: string; memberCount?: number }>;
  pattern?: PatternInit | null;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(pattern);
  const createPattern = useMutation(api.sessionPatterns.createPattern);
  const updatePattern = useMutation(api.sessionPatterns.updatePattern);

  const [name, setName] = useState(pattern?.name ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(pattern?.weekdays ?? [1, 3, 5]);
  const [startMin, setStartMin] = useState<number | null>(pattern?.startMin ?? 990);
  const [endMin, setEndMin] = useState<number | null>(pattern?.endMin ?? 1080);
  const [squadIds, setSquadIds] = useState<Id<"squads">[]>(pattern?.squadIds ?? []);
  const [label, setLabel] = useState(pattern?.label ?? "");
  const [location, setLocation] = useState(pattern?.location ?? "");
  const [saving, setSaving] = useState(false);

  const canSave =
    name.trim() !== "" &&
    weekdays.length > 0 &&
    startMin !== null &&
    endMin !== null &&
    startMin < endMin &&
    squadIds.length > 0 &&
    !saving;

  async function onSubmit() {
    if (!canSave || startMin === null || endMin === null) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        weekdays,
        startMin,
        endMin,
        squadIds,
        label: label.trim() || undefined,
        location: location.trim() || undefined,
      };
      if (pattern) {
        await notify.promise(updatePattern({ patternId: pattern._id, ...payload }), {
          loading: "Saving pattern…",
          success: (r) => `Pattern updated · ${r.generated} new session${r.generated === 1 ? "" : "s"}`,
        });
      } else {
        await notify.promise(createPattern(payload), {
          loading: "Creating pattern…",
          success: (r) => `Pattern created · ${r.generated} session${r.generated === 1 ? "" : "s"} generated`,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } catch {
      // notify surfaces the server message
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit pattern" : "New pattern"}</SheetTitle>
          <SheetDescription>
            A recurring practice. Saving updates future sessions; the past is left
            untouched.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Evening squad"
          />
          <WeekdayCheckboxes value={weekdays} onChange={setWeekdays} />
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="Start" value={startMin} onChange={setStartMin} />
            <TimeInput label="End" value={endMin} onChange={setEndMin} />
          </div>
          <SquadCheckboxes squads={squads} value={squadIds} onChange={setSquadIds} />
          <Input
            label="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Main session"
          />
          <Input
            label="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Main pool"
          />
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={saving} disabled={!canSave}>
            {isEdit ? "Save pattern" : "Create pattern"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
