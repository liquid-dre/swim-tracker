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
  Galas (super-user only; docs/access-control.md). Three things per gala, all
  global reference data every other screen reads:

  TOUR DATE — setting one switches EVERY qualifying surface to judge swimmers
  against the cut for the age they'll be on tour day (the birthday rule);
  clearing it reverts that gala to judging at the swimmer's current age (§4.9).

  ENTRY WINDOW — the inclusive age range the gala accepts. Outside it there is no
  cut to chase even though rows exist. SSA publishes these OUTSIDE the cut
  tables, and SANY's real window is not yet confirmed, so a coach must be able to
  correct them here rather than waiting on a deploy.

  QUALIFYING WINDOW — the inclusive dates between which a swim can qualify a
  swimmer for this gala. Swimmers qualify on THIS SEASON's racing, not on a
  lifetime best, so a time swum before the window opened buys them nothing
  however fast it was. Per gala, because the federation publishes a period per
  championship; editable here for the same reason the entry window is. Clearing
  both ends reverts the gala to judging on all-time personal bests.

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
  qualifyingFrom: string | null;
  qualifyingTo: string | null;
};

export function AdminGalasScreen() {
  const galas = useQuery(api.galas.listGalas, {});
  const byCode = useMemo(
    () => new Map((galas ?? []).map((g) => [g.code as GalaCode, g as Gala])),
    [galas],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Galas"
        breadcrumb={trailForHref("/admin/galas")}
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

/**
 * "1 Jun 2026 – 21 Mar 2027", or a half-open / absent form — never a bare pair
 * of ISO strings. "All-time" is the honest name for no window: it is the state
 * the app was in before windows existed, not a missing setting.
 */
function qualifyingRangeLabel(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from && !to) return "All-time";
  if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
  if (from) return `${formatShortDate(from)} onwards`;
  return `Up to ${formatShortDate(to!)}`;
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
  const setGalaQualifyingWindow = useMutation(api.galas.setGalaQualifyingWindow);

  // Local overrides only (null = show the live server value); a successful save
  // clears them so the fields re-sync — same pattern as SeasonStartEditor.
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [minOverride, setMinOverride] = useState<string | null>(null);
  const [maxOverride, setMaxOverride] = useState<string | null>(null);
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);
  const [savingQualifying, setSavingQualifying] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearQualifying, setConfirmClearQualifying] = useState(false);

  const loading = gala === undefined;
  const missing = gala === null;
  const date = dateOverride ?? gala?.tourDate ?? "";
  const name = nameOverride ?? gala?.tourName ?? "";
  const minText = minOverride ?? boundText(gala?.minAge ?? null);
  const maxText = maxOverride ?? boundText(gala?.maxAge ?? null);
  const qualFrom = fromOverride ?? gala?.qualifyingFrom ?? "";
  const qualTo = toOverride ?? gala?.qualifyingTo ?? "";

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

  // The window is saved as a PAIR, so one Save covers both ends: the only
  // cross-field rule (end not before start) needs both values, and saving them
  // separately would make the invalid intermediate state reachable.
  const qualifyingInverted =
    qualFrom !== "" && qualTo !== "" && qualTo < qualFrom;
  const qualifyingDirty =
    !loading &&
    !missing &&
    !qualifyingInverted &&
    (qualFrom !== (gala?.qualifyingFrom ?? "") ||
      qualTo !== (gala?.qualifyingTo ?? ""));
  const hasQualifying = !!gala?.qualifyingFrom || !!gala?.qualifyingTo;

  const today = new Date().toISOString().slice(0, 10);
  const inPast = !!gala?.tourDate && gala.tourDate < today;
  // A window that closed is worth flagging: nothing swum from here on can
  // qualify anyone for this gala until next season's dates are entered.
  const qualifyingClosed = !!gala?.qualifyingTo && gala.qualifyingTo < today;

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

  async function saveQualifying() {
    if (!qualifyingDirty) return;
    setSavingQualifying(true);
    try {
      await notify.promise(
        setGalaQualifyingWindow({
          code,
          qualifyingFrom: qualFrom === "" ? null : qualFrom,
          qualifyingTo: qualTo === "" ? null : qualTo,
        }),
        {
          loading: "Saving qualifying window…",
          success: `${GALA_FULL[code]} qualifying window saved`,
        },
      );
      setFromOverride(null);
      setToOverride(null);
    } catch {
      /* notify.promise surfaces the server message */
    } finally {
      setSavingQualifying(false);
    }
  }

  return (
    // min-w-0: a grid item defaults to min-width:auto, so without it a wide
    // child stretches the card past its track instead of being contained by it.
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm">
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

      {/* The qualifying window sits in the header too: it decides which swims
          this gala will even look at, so it is the first thing worth seeing. */}
      {!loading && !missing && (
        <p className="text-xs text-ink-muted">
          Qualifying on{" "}
          <span className="font-medium text-ink">
            {qualifyingRangeLabel(gala.qualifyingFrom, gala.qualifyingTo)}
          </span>
        </p>
      )}

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
            {/* Two equal columns rather than a flex row: the bounds are a pair
                and should stay the same width as each other, and grid tracks
                divide the card instead of adding up to more than it. */}
            <div className="grid grid-cols-2 items-start gap-3">
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
            {/* self-start, or the flex-col stretches it edge to edge while the
                Save / Clear pair below sits at its natural width. */}
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={saveWindow}
              disabled={!windowDirty || savingWindow}
              loading={savingWindow}
            >
              Save age range
            </Button>
          </fieldset>

          <hr className="border-gray-200" />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold text-ink-muted">
              Qualifying window
              <span className="ml-1 font-normal text-ink-faint">
                ({qualifyingRangeLabel(gala?.qualifyingFrom, gala?.qualifyingTo)}
                )
              </span>
            </legend>
            {/* Same two-track grid as the age range above: a pair of bounds
                that belong together and should stay equal width. */}
            <div className="grid grid-cols-2 items-start gap-3">
              <DateField
                label="Opens"
                aria-label={`${GALA_FULL[code]} qualifying window opens`}
                value={qualFrom}
                onChange={(iso) => setFromOverride(iso)}
                disabled={loading || savingQualifying}
              />
              <DateField
                label="Closes"
                aria-label={`${GALA_FULL[code]} qualifying window closes`}
                value={qualTo}
                onChange={(iso) => setToOverride(iso)}
                disabled={loading || savingQualifying}
                hint={
                  qualifyingInverted
                    ? "Must be on or after the opening date."
                    : qualifyingClosed && toOverride === null
                      ? "This window has closed — enter next season's dates."
                      : undefined
                }
              />
            </div>
            {/* `text-xs text-ink-muted`, not `2xs`/faint: globals.css
                documents 2xs for "micro-labels only: chart annotations", and
                this is three sentences of the most consequential rule in the
                product, above the two inputs that change it. QualifyingBasis
                sets the same content at `text-sm text-ink-muted` on every
                coach surface. */}
            <p className="text-xs text-ink-muted">
              Only official meet times swum between these dates can qualify a
              swimmer for this gala. Time trials, practice and school-gala times
              never count. Leave both blank to judge on all-time personal bests.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={saveQualifying}
                disabled={!qualifyingDirty || savingQualifying}
                loading={savingQualifying}
              >
                Save window
              </Button>
              {hasQualifying && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClearQualifying(true)}
                  disabled={savingQualifying}
                >
                  Clear
                </Button>
              )}
            </div>
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

      <ConfirmDialog
        open={confirmClearQualifying}
        onOpenChange={setConfirmClearQualifying}
        title={`Clear the ${GALA_FULL[code]} qualifying window?`}
        description="Without a window, this gala goes back to judging every swimmer on their all-time personal best — swimmers whose fastest swim predates this season will start reading as qualified again."
        confirmLabel="Clear window"
        onConfirm={async () => {
          await notify.promise(
            setGalaQualifyingWindow({
              code,
              qualifyingFrom: null,
              qualifyingTo: null,
            }),
            {
              loading: "Clearing…",
              success: `${GALA_FULL[code]} qualifying window cleared`,
            },
          );
          setFromOverride(null);
          setToOverride(null);
        }}
      />
    </section>
  );
}
