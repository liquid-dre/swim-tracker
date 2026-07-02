"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoLinkState, ReadOnlyChip, ViewerSkeleton } from "./viewerShared";

/*
  Viewer selection context (Step R6). Holds the linked swimmers and which one is
  selected, shared across every /me/* route so the switcher choice persists as a
  viewer moves between Overview / Progress / Road / History. The list is the
  server's role-scoped `listForProfile`, so a viewer only ever sees — and can
  only select — their OWN linked swimmer(s). The pick is remembered in
  localStorage and self-heals if a link is later revoked.

  The provider gates the whole viewer area: a calm skeleton while the link
  loads, the no-link state when there is none, and otherwise the shared switcher
  (only for a parent with >1 swimmer) above the focused page.
*/

export type ViewerSwimmer = { _id: Id<"swimmers">; name: string; age: number };

type ViewerContextValue = {
  swimmers: ViewerSwimmer[];
  selectedId: Id<"swimmers">;
  selected: ViewerSwimmer;
  setSelectedId: (id: Id<"swimmers">) => void;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

/** The selected linked swimmer for the current viewer. */
export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) {
    throw new Error("useViewer must be used inside the /me ViewerProvider");
  }
  return ctx;
}

const STORAGE_KEY = "swim-tracker:viewer-swimmer";

export function ViewerProvider({ children }: { children: ReactNode }) {
  const data = useQuery(api.swimmers.listForProfile, {});
  const swimmers = useMemo<ViewerSwimmer[]>(
    () =>
      (data?.swimmers ?? []).map((s) => ({
        _id: s._id,
        name: s.name,
        age: s.age,
      })),
    [data],
  );

  // Restore the last pick once (client-only, so SSR and first render agree).
  const [picked, setPicked] = useState<Id<"swimmers"> | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // A deliberate one-time sync from an external store (localStorage): the
      // server and first client render use the default, then we patch — which is
      // what keeps this free of an SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPicked(raw as Id<"swimmers">);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Derived, self-healing selection: the stored pick if it's still linked,
  // otherwise the first linked swimmer.
  const selectedId = useMemo<Id<"swimmers"> | null>(() => {
    if (picked && swimmers.some((s) => s._id === picked)) return picked;
    return swimmers[0]?._id ?? null;
  }, [picked, swimmers]);

  const setSelectedId = (id: Id<"swimmers">) => {
    setPicked(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  if (data === undefined) {
    return <ViewerGate>{<ViewerSkeleton />}</ViewerGate>;
  }
  if (swimmers.length === 0) {
    return (
      <ViewerGate>
        <NoLinkState />
      </ViewerGate>
    );
  }
  if (selectedId === null) {
    return <ViewerGate>{<ViewerSkeleton />}</ViewerGate>;
  }

  const selected = swimmers.find((s) => s._id === selectedId) as ViewerSwimmer;

  return (
    <ViewerContext.Provider value={{ swimmers, selectedId, selected, setSelectedId }}>
      <div className="flex flex-col gap-6">
        {swimmers.length > 1 && (
          <SwimmerSwitcher
            swimmers={swimmers}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        {children}
      </div>
    </ViewerContext.Provider>
  );
}

// The loading / no-link states still get a header so the page never renders as
// a bare fragment.
function ViewerGate({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My swimmer"
        breadcrumb={[{ label: "Overview" }]}
        description="Your personal bests, progression, and how close you are to each qualifying cut."
        actions={<ReadOnlyChip tone="onWater" />}
      />
      {children}
    </div>
  );
}

// A parent linked to more than one swimmer: pick which one every viewer section
// is about. Scoped to their own linked swimmers only.
function SwimmerSwitcher({
  swimmers,
  selectedId,
  onSelect,
}: {
  swimmers: ViewerSwimmer[];
  selectedId: Id<"swimmers">;
  onSelect: (id: Id<"swimmers">) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-ink-muted">Viewing</span>
      <div role="group" aria-label="Choose a swimmer" className="flex flex-wrap gap-2">
        {swimmers.map((s) => {
          const active = s._id === selectedId;
          return (
            <button
              key={s._id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(s._id)}
              className={
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
                (active
                  ? "border-brand-500 bg-brand-50 text-brand-500"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900")
              }
            >
              {s.name}
              <span className="text-xs tabular-nums text-ink-faint">age {s.age}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
