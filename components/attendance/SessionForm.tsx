"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

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
import { notify } from "@/lib/notify";
import { SquadCheckboxes, TimeInput } from "./controls";

/*
  Create a one-off session, or edit a single occurrence (§R18). An edit stamps the
  session `overridden` server-side so a later pattern regeneration leaves it alone.
  Reset per target via a `key` on the parent so state re-initialises from props.
*/

type SessionInit = {
  _id: Id<"sessions">;
  date: string;
  startMin: number;
  endMin: number;
  squadIds: Id<"squads">[];
  label: string | null;
  location: string | null;
};

export function SessionForm({
  open,
  onOpenChange,
  today,
  squads,
  session,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  squads: Array<{ _id: Id<"squads">; name: string; memberCount?: number }>;
  session?: SessionInit | null;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(session);
  const createOneOff = useMutation(api.sessions.createOneOffSession);
  const updateSession = useMutation(api.sessions.updateSession);

  const [date, setDate] = useState(session?.date ?? today);
  const [startMin, setStartMin] = useState<number | null>(session?.startMin ?? 990); // 16:30
  const [endMin, setEndMin] = useState<number | null>(session?.endMin ?? 1080); // 18:00
  const [squadIds, setSquadIds] = useState<Id<"squads">[]>(session?.squadIds ?? []);
  const [label, setLabel] = useState(session?.label ?? "");
  const [location, setLocation] = useState(session?.location ?? "");
  const [saving, setSaving] = useState(false);

  const canSave =
    date !== "" &&
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
        date,
        startMin,
        endMin,
        squadIds,
        label: label.trim() || undefined,
        location: location.trim() || undefined,
      };
      if (session) {
        await notify.promise(updateSession({ sessionId: session._id, ...payload }), {
          loading: "Saving session…",
          success: "Session updated",
        });
      } else {
        await notify.promise(createOneOff(payload), {
          loading: "Creating session…",
          success: "Session created",
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
          <SheetTitle>{isEdit ? "Edit session" : "New session"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Changes apply to this session only."
              : "A one-off practice outside the recurring schedule."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          <DateField label="Date" value={date} onChange={setDate} required />
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="Start" value={startMin} onChange={setStartMin} />
            <TimeInput label="End" value={endMin} onChange={setEndMin} />
          </div>
          <SquadCheckboxes squads={squads} value={squadIds} onChange={setSquadIds} />
          <Input
            label="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Distance set"
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
            {isEdit ? "Save session" : "Create session"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
