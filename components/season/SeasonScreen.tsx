"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, RotateCcw, TrendingUp } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Course, Stroke } from "@/lib/swim";
import { formatTime } from "@/lib/swim";
import { formatSeconds, formatShortDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { EventPicker, type EventValue } from "@/components/analysis/EventPicker";
import { trailForHref } from "@/lib/nav";

/*
  Season improvement ranking (Step 13, BRD §5.12). "Who is responding to
  training." Two modes over MEET times only (§4.6):

    • By event — pick one event (distance + stroke + course; course never mixed,
      §4.2) and rank swimmers by the drop between their FIRST in-season meet time
      and their fastest in-season meet time.
    • Overall — rank swimmers by their AVERAGE % improvement across every event
      they've raced this season.

  The ranking is the anchor: an ordered list of horizontal bars in the one brand
  accent, tabular deltas alongside. The season window is the coach's editable
  season-start app-setting (default rolling 12 months); changing it re-computes
  the whole board reactively. Swimmers with a single in-season meet time can't
  have a drop measured — they're listed separately as "insufficient data", never
  as 0% (§5.12).
*/

type Mode = "event" | "overall";

type EventBlock = {
  count: number;
  firstMs: number;
  firstDate: string;
  currentMs: number;
  currentDate: string;
  improvedMs: number | null;
  improvedPct: number | null;
};

type OverallBlock = {
  eventsInSeason: number;
  eventsMeasured: number;
  avgImprovedPct: number | null;
  totalImprovedMs: number | null;
  bestLabel: string | null;
  bestImprovedPct: number | null;
};

type SeasonRow = {
  swimmerId: string;
  name: string;
  gender: "M" | "F";
  age: number;
  active: boolean;
  insufficient: boolean;
  event: EventBlock | null;
  overall: OverallBlock | null;
};

export type SeasonData = {
  mode: Mode;
  seasonStart: string;
  source: "explicit" | "custom" | "rolling";
  event: { label: string } | null;
  rows: SeasonRow[];
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SeasonScreen() {
  const events = useQuery(api.events.listActiveEvents, {});
  const settings = useQuery(api.settings.getAppSettings, {});

  const [mode, setMode] = useState<Mode>("event");
  const [event, setEvent] = useState<EventValue>({
    distance: null,
    stroke: null,
    course: null,
  });

  const complete =
    event.distance !== null && event.stroke !== null && event.course !== null;

  const data = useQuery(
    api.analysis.getSeasonImprovement,
    mode === "overall"
      ? { mode: "overall" }
      : complete
        ? {
            mode: "event",
            distance: event.distance as 50 | 100 | 200 | 400 | 800 | 1500,
            stroke: event.stroke as Stroke,
            course: event.course as Course,
          }
        : "skip",
  ) as SeasonData | undefined;

  const waitingForEvent = mode === "event" && !complete;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Season improvement"
        breadcrumb={trailForHref("/season")}
        description="Who's dropping the most time this season. Ranked by improvement between each swimmer's first in-season meet time and their fastest since — by a single event, or averaged across every event. Meet times only; trials and practice never count."
      />

      <SeasonControls
        mode={mode}
        onMode={setMode}
        events={events?.map((e) => ({
          distance: e.distance,
          stroke: e.stroke as Stroke,
          allowedCourses: e.allowedCourses as Course[],
        }))}
        event={event}
        onEvent={setEvent}
      />

      <SeasonStartEditor settings={settings} />

      {waitingForEvent ? (
        <EmptyState
          title="Pick an event"
          body="Choose a distance, stroke and course above to rank swimmers by the time they've dropped in that event this season."
        />
      ) : data === undefined ? (
        <SeasonSkeleton />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="No meet times this season"
          body={
            mode === "event"
              ? "No swimmer has a long- or short-course meet time in this event since the season start. Try another event or move the season start back."
              : "No swimmer has a meet time since the season start. Log meet results, or move the season start back to widen the window."
          }
        />
      ) : (
        <SeasonResults data={data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls — mode toggle + (event mode) the event picker
// ---------------------------------------------------------------------------

function SeasonControls({
  mode,
  onMode,
  events,
  event,
  onEvent,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  events:
    | { distance: number; stroke: Stroke; allowedCourses: Course[] }[]
    | undefined;
  event: EventValue;
  onEvent: (v: EventValue) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-ink">Rank by</h2>
        <p className="text-xs text-ink-muted">
          One event, or the average across every event a swimmer has raced.
        </p>
      </div>
      <div className="mt-3">
        <Segmented
          ariaLabel="Ranking mode"
          value={mode}
          onChange={(v) => onMode(v as Mode)}
          options={[
            { value: "event", label: "By event" },
            { value: "overall", label: "Overall" },
          ]}
        />
      </div>

      {mode === "event" && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <EventPicker events={events} value={event} onChange={onEvent} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Season-start editor (the app-setting)
// ---------------------------------------------------------------------------

type Settings = {
  seasonStart: string | null;
  effectiveSeasonStart: string;
  source: "custom" | "rolling";
};

function SeasonStartEditor({ settings }: { settings: Settings | undefined }) {
  const setSeasonStart = useMutation(api.settings.setSeasonStart);
  // The input tracks only the coach's local override (null = show the live
  // effective start). No effect needed: the displayed value is derived, and a
  // successful save clears the override so it re-syncs to the server value.
  const [override, setOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isCustom = settings?.source === "custom";
  const value = override ?? settings?.effectiveSeasonStart ?? "";
  const dirty = !!settings && override !== null && value !== "" && value !== settings.seasonStart;
  const invalid = value !== "" && value > today;

  async function save() {
    if (!dirty || invalid) return;
    setSaving(true);
    try {
      await notify.promise(setSeasonStart({ seasonStart: value }), {
        loading: "Saving season start…",
        success: "Season start updated",
      });
      setOverride(null); // re-sync the input to the new server value
    } catch {
      /* notify.promise surfaces the server message */
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      await notify.promise(setSeasonStart({ seasonStart: null }), {
        loading: "Reverting…",
        success: "Reverted to a rolling 12 months",
      });
      setOverride(null);
    } catch {
      /* handled by notify */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays
              aria-hidden
              className="size-4 text-ink-faint"
              strokeWidth={1.75}
            />
            <h2 className="text-sm font-semibold text-ink">Season start</h2>
          </div>
          <p className="mt-0.5 max-w-[52ch] text-xs text-ink-muted">
            The window every ranking measures over. Currently{" "}
            <span className="font-medium text-ink">
              {settings ? formatShortDate(settings.effectiveSeasonStart) : "…"}
            </span>{" "}
            {settings?.source === "rolling"
              ? "— the default rolling 12 months. Set a fixed date to pin the season."
              : "— a fixed season start you set."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-muted">Start date</span>
            <input
              type="date"
              value={value}
              max={today}
              onChange={(e) => setOverride(e.target.value)}
              disabled={!settings || saving}
              aria-label="Season start date"
              aria-invalid={invalid || undefined}
              className={
                "time h-9 rounded-lg border bg-white px-3 text-base text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] focus:border-brand-300 focus:shadow-focus-ring disabled:opacity-50 " +
                (invalid
                  ? "border-error-500 bg-error-50"
                  : "border-gray-300 hover:border-gray-400")
              }
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={!dirty || invalid}
            loading={saving && dirty}
          >
            Save
          </Button>
          {isCustom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={saving}
              title="Revert to a rolling 12-month window"
            >
              <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
              Rolling 12 months
            </Button>
          )}
        </div>
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-danger-ink">
          Season start cannot be in the future.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Results — presentational (fed by the query, or by the preview harness)
// ---------------------------------------------------------------------------

export function SeasonResults({ data }: { data: SeasonData }) {
  const pctOf = (r: SeasonRow) =>
    data.mode === "event"
      ? (r.event?.improvedPct ?? null)
      : (r.overall?.avgImprovedPct ?? null);

  const ranked = useMemo(
    () => data.rows.filter((r) => !r.insufficient),
    [data.rows],
  );
  const insufficient = useMemo(
    () => data.rows.filter((r) => r.insufficient),
    [data.rows],
  );

  // Bars normalise against the biggest drop, so the top improver fills the track
  // and everyone reads relative to them. A floor keeps a real (tiny) drop visible.
  const maxPct = useMemo(
    () => ranked.reduce((m, r) => Math.max(m, pctOf(r) ?? 0), 0),
    [ranked], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex flex-col gap-5">
      <SummaryBar
        mode={data.mode}
        eventLabel={data.event?.label ?? null}
        seasonStart={data.seasonStart}
        source={data.source}
        ranked={ranked.length}
        insufficient={insufficient.length}
      />

      <section className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">
            {data.mode === "event"
              ? "Ranked by time dropped"
              : "Ranked by average improvement"}
          </h2>
          <p className="text-xs text-ink-faint">
            Longer bar = more time dropped
          </p>
        </div>

        {ranked.length > 0 ? (
          <ol className="flex flex-col divide-y divide-gray-100">
            {ranked.map((r, i) => (
              <RankRow
                key={r.swimmerId}
                rank={i + 1}
                row={r}
                mode={data.mode}
                pct={pctOf(r) ?? 0}
                maxPct={maxPct}
              />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">
            No swimmer has two meet times to compare in this window yet. Everyone
            below has a single in-season time.
          </p>
        )}

        {insufficient.length > 0 && (
          <InsufficientGroup rows={insufficient} mode={data.mode} />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function SummaryBar({
  mode,
  eventLabel,
  seasonStart,
  source,
  ranked,
  insufficient,
}: {
  mode: Mode;
  eventLabel: string | null;
  seasonStart: string;
  source: "explicit" | "custom" | "rolling";
  ranked: number;
  insufficient: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-theme-sm">
      <div className="flex items-center gap-2">
        <TrendingUp aria-hidden className="size-4 text-brand-500" strokeWidth={2} />
        <span className="font-medium text-ink">
          {mode === "event" ? (eventLabel ?? "Event") : "All events"}
        </span>
      </div>
      <span aria-hidden className="h-3.5 w-px bg-border" />
      <Stat label="Since" value={formatShortDate(seasonStart)} />
      <Stat
        label="Window"
        value={source === "rolling" ? "Rolling 12mo" : "Fixed"}
        muted={source === "rolling"}
      />
      <Stat label="Ranked" value={String(ranked)} />
      <Stat label="Insufficient" value={String(insufficient)} muted />
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-muted">{label}</span>
      <span
        className={
          "font-medium tabular-nums " + (muted ? "text-ink-faint" : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A ranked row (one measured swimmer)
// ---------------------------------------------------------------------------

function RankRow({
  rank,
  row,
  mode,
  pct,
  maxPct,
}: {
  rank: number;
  row: SeasonRow;
  mode: Mode;
  pct: number;
  maxPct: number;
}) {
  const width = maxPct > 0 ? Math.max(3, (pct / maxPct) * 100) : 3;
  const droppedMs =
    mode === "event"
      ? (row.event?.improvedMs ?? 0)
      : (row.overall?.totalImprovedMs ?? 0);

  return (
    <li className="flex items-center gap-4 py-3">
      <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-ink-faint">
        {rank}
      </span>

      <div className="w-28 shrink-0 sm:w-40">
        <div className="truncate font-medium text-ink">
          {row.name}
          <span className="ml-1 text-xs font-normal tabular-nums text-ink-faint">
            · {row.age}
          </span>
          {!row.active && (
            <span className="ml-1 text-xs font-normal text-ink-faint">
              · inactive
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-ink-faint">
          {mode === "event" ? (
            <span className="time tnum">
              {formatTime(row.event!.firstMs)} → {formatTime(row.event!.currentMs)}
            </span>
          ) : (
            <span className="tabular-nums">
              {row.overall!.eventsMeasured} of {row.overall!.eventsInSeason} event
              {row.overall!.eventsInSeason === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div
        className="hidden h-2 flex-1 overflow-hidden rounded-full bg-gray-100 sm:block"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] [transition-duration:var(--dur-2)]"
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="w-24 shrink-0 text-right sm:w-28">
        <div className="font-medium tabular-nums text-ink">
          −{pct.toFixed(1)}%
        </div>
        <div className="tabular-nums text-xs text-ink-faint">
          {mode === "event"
            ? `−${formatSeconds(droppedMs)}s`
            : row.overall!.bestLabel
              ? `best ${row.overall!.bestLabel}`
              : "—"}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insufficient-data group (single in-season meet time)
// ---------------------------------------------------------------------------

function InsufficientGroup({
  rows,
  mode,
}: {
  rows: SeasonRow[];
  mode: Mode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Insufficient data
        </h3>
        <span className="text-xs tabular-nums text-ink-faint">{rows.length}</span>
      </div>
      <p className="text-xs text-ink-faint">
        Only one meet time this season — a drop needs at least two to measure.
      </p>
      <ul className="flex flex-col divide-y divide-gray-100">
        {rows.map((r) => (
          <li
            key={r.swimmerId}
            className="flex items-center justify-between gap-4 py-2.5"
          >
            <span className="font-medium text-ink-muted">
              {r.name}
              <span className="ml-1 text-xs font-normal tabular-nums text-ink-faint">
                · {r.age}
              </span>
              {!r.active && (
                <span className="ml-1 text-xs font-normal text-ink-faint">
                  · inactive
                </span>
              )}
            </span>
            <span className="text-xs text-ink-faint">
              {mode === "event" && r.event ? (
                <span className="time tnum">
                  {formatTime(r.event.currentMs)} ·{" "}
                  {formatShortDate(r.event.currentDate)}
                </span>
              ) : (
                <span className="tabular-nums">
                  {r.overall?.eventsInSeason ?? 0} event
                  {(r.overall?.eventsInSeason ?? 0) === 1 ? "" : "s"}, none twice
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <TrendingUp aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function SeasonSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-14 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
