"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentProfile } from "./useCurrentProfile";

export type PickerSwimmer = { _id: Id<"swimmers">; name: string; age: number };

/*
  The swimmer set for an analysis screen's swimmer picker, role-scoped so the
  same screen serves both a coach (/compare, /road…) and a viewer (/me/…).

  Coaches / super-users get the full roster (listSwimmers); a viewer gets only
  the swimmer(s) they are linked to (listForProfile). Returns `undefined` while
  the role or the list is still loading. Crucially it never fires the coach-only
  `listSwimmers` for a viewer — the query is skipped until the role is known and
  only the role-appropriate one runs.
*/
export function usePickerSwimmers(): PickerSwimmer[] | undefined {
  const profile = useCurrentProfile();
  const role = profile?.role;
  const isViewer = role === "VIEWER";

  const coach = useQuery(
    api.swimmers.listSwimmers,
    role !== undefined && !isViewer ? {} : "skip",
  );
  const viewer = useQuery(
    api.swimmers.listForProfile,
    isViewer ? {} : "skip",
  );

  if (role === undefined) return undefined;
  return isViewer ? viewer?.swimmers : coach;
}
