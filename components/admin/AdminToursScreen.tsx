"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { TierBadge } from "@/components/ui/TierBadge";
import { notify } from "@/lib/notify";
import { trailForHref } from "@/lib/nav";
import { formatShortDate } from "@/lib/format";
import { TIER_FULL, TIER_ORDER, type Tier } from "@/lib/swim";

/*
  Tour dates (super-user only; docs/access-control.md). One date per tier.
  Setting a date switches EVERY qualifying surface to judge swimmers against
  the cut for the age they'll be on tour day (the birthday rule); clearing it
  reverts that tier to judging at the age each time was swum (§4.9). Writes
  are gated server-side by requireSuperUser — this screen is reachable only
  by the super-user via the /admin route boundary.
*/

type Tour = { tier: Tier; date: string; name: string | null };

export function AdminToursScreen() {
  const tours = useQuery(api.tours.listTours, {});
  const byTier = useMemo(
    () => new Map((tours ?? []).map((t) => [t.tier, t as Tour])),
    [tours],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tour dates"
        breadcrumb={trailForHref("/admin/tours")}
        description="The date of each tier's tour. With a date set, the qualifying screens judge swimmers against the cut for their age on that day (the progression chart's historical overlay keeps showing what applied when each swim happened). Clear a date and that tier reverts to judging at the age each time was swum."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {TIER_ORDER.map((tier) => (
          <TourEditor
            key={tier}
            tier={tier}
            tour={tours === undefined ? undefined : (byTier.get(tier) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

function TourEditor({
  tier,
  tour,
}: {
  tier: Tier;
  // undefined = still loading; null = no tour date set for this tier.
  tour: Tour | undefined | null;
}) {
  const setTour = useMutation(api.tours.setTour);
  const clearTour = useMutation(api.tours.clearTour);

  // Local overrides only (null = show the live server value); a successful
  // save clears them so the fields re-sync — same pattern as SeasonStartEditor.
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const loading = tour === undefined;
  const date = dateOverride ?? tour?.date ?? "";
  const name = nameOverride ?? tour?.name ?? "";
  const dirty =
    !loading &&
    date !== "" &&
    (date !== (tour?.date ?? "") || name.trim() !== (tour?.name ?? ""));

  const today = new Date().toISOString().slice(0, 10);
  const inPast = tour !== null && tour !== undefined && tour.date < today;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await notify.promise(
        setTour({ tier, date, name: name.trim() === "" ? undefined : name.trim() }),
        {
          loading: "Saving tour date…",
          success: `${TIER_FULL[tier]} tour saved`,
        },
      );
      setDateOverride(null);
      setNameOverride(null);
    } catch {
      /* notify.promise surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm">
      <header className="flex items-center justify-between gap-3">
        <TierBadge tier={tier} />
        <span className="text-xs text-ink-faint">
          {loading ? "…" : tour ? `Tour day ${formatShortDate(tour.date)}` : "No date set"}
        </span>
      </header>

      <Input
        label="Tour name"
        placeholder={`e.g. ${TIER_FULL[tier]} Championships`}
        value={name}
        onChange={(e) => setNameOverride(e.target.value)}
        disabled={loading || saving}
        hint="Optional — shown wherever the tour is referenced."
      />

      <DateField
        label="Tour date"
        aria-label={`${TIER_FULL[tier]} tour date`}
        value={date}
        onChange={(iso) => setDateOverride(iso)}
        disabled={loading || saving}
        hint={
          inPast && dateOverride === null
            ? "This date has passed — set next season's tour, or clear it."
            : undefined
        }
      />

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          loading={saving}
        >
          Save
        </Button>
        {tour && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            disabled={saving}
          >
            Clear
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={`Clear the ${TIER_FULL[tier]} tour date?`}
        description="Without a tour date, this tier goes back to judging each swimmer at the age their time was swum — gaps and qualification may change across the app."
        confirmLabel="Clear date"
        onConfirm={async () => {
          await notify.promise(clearTour({ tier }), {
            loading: "Clearing…",
            success: `${TIER_FULL[tier]} tour date cleared`,
          });
          setDateOverride(null);
          setNameOverride(null);
        }}
      />
    </section>
  );
}
