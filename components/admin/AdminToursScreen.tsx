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
import { GALA_FULL, GALA_ORDER, type GalaCode } from "@/lib/galas";

/*
  Galas (super-user only; docs/access-control.md). Two things per gala, both
  global reference data every other screen reads:

  TOUR DATE — setting one switches EVERY qualifying surface to judge swimmers
  against the cut for the age they'll be on tour day (the birthday rule);
  clearing it reverts that gala to judging at the swimmer's current age (§4.9).

  ENTRY WINDOW — the inclusive age range the gala accepts. Outside it there is no
  cut to chase even though rows exist. SSA publishes these OUTSIDE the cut
  tables, and SANY's real window is not yet confirmed, so a coach must be able to
  correct them here rather than waiting on a deploy.

  Writes are gated server-side by requireSuperUser — this screen is reachable
  only by the super-user via the /admin route boundary.
*/

type Gala = {
  code: GalaCode;
  displayName: string;
  ageScope: "AGE_GRADED" | "OPEN";
  minAge: number | null;
  maxAge: number | null;
  tourDate: string | null;
  tourName: string | null;
};

export function AdminToursScreen() {
  const galas = useQuery(api.galas.listGalas, {});
  const byCode = useMemo(
    () => new Map((galas ?? []).map((g) => [g.code as GalaCode, g as Gala])),
    [galas],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Galas"
        breadcrumb={trailForHref("/admin/tours")}
        description="Each gala's tour date and the age range it accepts. With a date set, the qualifying screens judge swimmers against the cut for their age on that day (the progression chart's historical overlay keeps showing what applied when each swim happened). Clear a date and that gala reverts to judging at the swimmer's current age."
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {GALA_ORDER.map((code) => (
          <GalaEditor
            key={code}
            code={code}
            gala={galas === undefined ? undefined : (byCode.get(code) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

/** "15+", "17–25", "Up to 16", or "All ages" — never a bare pair of numbers. */
function windowLabel(minAge: number | null, maxAge: number | null): string {
  if (minAge === null && maxAge === null) return "All ages";
  if (minAge !== null && maxAge === null) return `${minAge}+`;
  if (minAge === null && maxAge !== null) return `Up to ${maxAge}`;
  return `${minAge}–${maxAge}`;
}

/** "" for an unset bound; the number as text otherwise. */
function boundText(value: number | null): string {
  return value === null ? "" : String(value);
}

/** Parse a bound field: blank means unbounded, anything else must be an integer. */
function parseBound(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : "invalid";
}

function GalaEditor({
  code,
  gala,
}: {
  code: GalaCode;
  // undefined = still loading; null = the gala row is missing (seed not run).
  gala: Gala | undefined | null;
}) {
  const setGalaTour = useMutation(api.galas.setGalaTour);
  const clearGalaTour = useMutation(api.galas.clearGalaTour);
  const setGalaEligibility = useMutation(api.galas.setGalaEligibility);

  // Local overrides only (null = show the live server value); a successful save
  // clears them so the fields re-sync — same pattern as SeasonStartEditor.
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [minOverride, setMinOverride] = useState<string | null>(null);
  const [maxOverride, setMaxOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const loading = gala === undefined;
  const missing = gala === null;
  const date = dateOverride ?? gala?.tourDate ?? "";
  const name = nameOverride ?? gala?.tourName ?? "";
  const minText = minOverride ?? boundText(gala?.minAge ?? null);
  const maxText = maxOverride ?? boundText(gala?.maxAge ?? null);

  const dirty =
    !loading &&
    !missing &&
    date !== "" &&
    (date !== (gala?.tourDate ?? "") || name.trim() !== (gala?.tourName ?? ""));

  const parsedMin = parseBound(minText);
  const parsedMax = parseBound(maxText);
  const boundsValid = parsedMin !== "invalid" && parsedMax !== "invalid";
  const windowDirty =
    !loading &&
    !missing &&
    boundsValid &&
    (parsedMin !== (gala?.minAge ?? null) || parsedMax !== (gala?.maxAge ?? null));

  const today = new Date().toISOString().slice(0, 10);
  const inPast = !!gala?.tourDate && gala.tourDate < today;

  async function saveTour() {
    if (!dirty) return;
    setSaving(true);
    try {
      await notify.promise(
        setGalaTour({
          code,
          date,
          name: name.trim() === "" ? undefined : name.trim(),
        }),
        { loading: "Saving tour date…", success: `${GALA_FULL[code]} tour saved` },
      );
      setDateOverride(null);
      setNameOverride(null);
    } catch {
      /* notify.promise surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  async function saveWindow() {
    const minAge = parseBound(minText);
    const maxAge = parseBound(maxText);
    if (!windowDirty || minAge === "invalid" || maxAge === "invalid") return;
    setSavingWindow(true);
    try {
      await notify.promise(
        setGalaEligibility({ code, minAge, maxAge }),
        { loading: "Saving age range…", success: `${GALA_FULL[code]} age range saved` },
      );
      setMinOverride(null);
      setMaxOverride(null);
    } catch {
      /* notify.promise surfaces the server message */
    } finally {
      setSavingWindow(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <TierBadge gala={code} />
        <span className="text-xs text-ink-faint">
          {loading
            ? "…"
            : missing
              ? "Not set up"
              : gala.tourDate
                ? `Tour day ${formatShortDate(gala.tourDate)}`
                : "No date set"}
        </span>
      </header>

      <p className="text-xs text-ink-muted">
        {loading ? "…" : missing ? GALA_FULL[code] : gala.displayName}
      </p>

      {missing ? (
        <p className="text-xs text-ink-muted">
          This gala has no row yet — run the standards seed to create it.
        </p>
      ) : (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold text-ink-muted">
              Entry age range
              <span className="ml-1 font-normal text-ink-faint">
                ({windowLabel(gala?.minAge ?? null, gala?.maxAge ?? null)})
              </span>
            </legend>
            <div className="flex items-start gap-3">
              <Input
                label="Youngest"
                inputMode="numeric"
                placeholder="Any"
                value={minText}
                onChange={(e) => setMinOverride(e.target.value)}
                disabled={loading || savingWindow}
                error={parsedMin === "invalid" ? "Whole number or blank" : undefined}
              />
              <Input
                label="Oldest"
                inputMode="numeric"
                placeholder="Any"
                value={maxText}
                onChange={(e) => setMaxOverride(e.target.value)}
                disabled={loading || savingWindow}
                error={parsedMax === "invalid" ? "Whole number or blank" : undefined}
              />
            </div>
            <p className="text-2xs text-ink-faint">
              Leave a field blank for no limit. Swimmers outside the range are
              never shown as qualified for this gala.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={saveWindow}
              disabled={!windowDirty || savingWindow}
              loading={savingWindow}
            >
              Save age range
            </Button>
          </fieldset>

          <hr className="border-gray-200" />

          <Input
            label="Tour name"
            placeholder={`e.g. ${GALA_FULL[code]}`}
            value={name}
            onChange={(e) => setNameOverride(e.target.value)}
            disabled={loading || saving}
            hint="Optional — shown wherever the tour is referenced."
          />

          <DateField
            label="Tour date"
            aria-label={`${GALA_FULL[code]} tour date`}
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
              onClick={saveTour}
              disabled={!dirty || saving}
              loading={saving}
            >
              Save
            </Button>
            {gala?.tourDate && (
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
        </>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={`Clear the ${GALA_FULL[code]} tour date?`}
        description="Without a tour date, this gala goes back to judging each swimmer at their current age — gaps and qualification may change across the app."
        confirmLabel="Clear date"
        onConfirm={async () => {
          await notify.promise(clearGalaTour({ code }), {
            loading: "Clearing…",
            success: `${GALA_FULL[code]} tour date cleared`,
          });
          setDateOverride(null);
          setNameOverride(null);
        }}
      />
    </section>
  );
}
