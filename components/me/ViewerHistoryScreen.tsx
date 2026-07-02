"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { HistoryTable } from "@/components/swimmers/HistoryTable";
import { useViewer } from "./ViewerContext";
import { ReadOnlyChip, Section } from "./viewerShared";

/*
  Viewer History (/me/history, Step R6). The full, read-only results table for
  the selected swimmer. Reuses the already-built HistoryTable — with no edit /
  delete handlers it renders in its read-only form.
*/
export function ViewerHistoryScreen() {
  const { selectedId } = useViewer();
  const data = useQuery(api.personalBests.getSwimmerProfile, {
    swimmerId: selectedId,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="History"
        breadcrumb={[{ label: "Overview", href: "/me" }, { label: "History" }]}
        description="Every swim your coach has logged — meets, trials and practice. Filter and sort to explore."
        actions={<ReadOnlyChip />}
      />

      {data === undefined ? (
        <div
          className="h-96 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
          aria-busy
        />
      ) : (
        <Section title="All results">
          <HistoryTable rows={data.history} />
        </Section>
      )}
    </div>
  );
}
