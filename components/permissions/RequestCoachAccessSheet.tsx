"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";

/*
  "Request coach access" — a parent who has started coaching asks a club from
  the account menu (the same request a coach files at sign-up). The club's
  super coaches decide it, and pick the level, on their Permissions screen.
*/
export function RequestCoachAccessSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const clubs = useQuery(api.coachPermissions.listClubsForSignup, open ? {} : "skip");
  const request = useMutation(api.coachPermissions.requestCoachAccess);
  const [clubId, setClubId] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clubId === "" || saving) return;
    setSaving(true);
    try {
      await notify.promise(request({ clubId: clubId as Id<"clubs"> }), {
        loading: "Sending your request…",
        success: (res) => `Request sent to ${res.clubName}`,
      });
      onOpenChange(false);
    } catch {
      /* notify surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Request coach access</SheetTitle>
          <SheetDescription>
            Pick your club. Its super coaches will approve you and choose your
            coaching role. Your swimmers stay linked while you wait.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4">
            <label htmlFor="request-club" className="text-sm font-medium text-gray-700">
              Club
            </label>
            <Select
              id="request-club"
              size="md"
              value={clubId}
              onValueChange={setClubId}
              placeholder={clubs === undefined ? "Loading clubs…" : "Choose your club"}
              disabled={clubs === undefined || clubs.length === 0}
              options={(clubs ?? []).map((c) => ({ value: c._id, label: c.name }))}
            />
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={clubId === ""}>
              Send request
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
