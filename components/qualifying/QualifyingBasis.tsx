import { formatShortDate } from "@/lib/format";
import { GALA_MEDIUM, GALA_ORDER, type GalaCode } from "@/lib/galas";

/*
  The one sentence every qualifying surface says about ITSELF.

  Qualification is judged on a swimmer's QUALIFYING time — their fastest official
  meet swim inside the gala's window (§4.9) — not on their all-time personal
  best. Those two numbers legitimately differ, and the difference is visible: a
  coach can read a 0.42s gap here and a faster PB on the PB board two screens
  away. Without a stated basis that looks like a bug in the app rather than the
  rule it is.

  Deliberately ONE line, and deliberately not a per-cell badge: a lapsed
  qualification is shown as simply not met, everywhere. This says what the screen
  measured; it never annotates individual swimmers.

  Renders nothing when no gala carries a window — with none set the surfaces
  judge on all-time bests, which is the behaviour that needs no explaining.
*/

/** A gala's window as the queries return it. */
export type QualifyingWindow = {
  qualifyingFrom: string | null;
  qualifyingTo: string | null;
};

export type QualifyingWindowsByGala = Partial<Record<GalaCode, QualifyingWindow>>;

/** "1 Jun 2026 – 21 Mar 2027", or a half-open form when only one end is set. */
export function windowLabel(window: QualifyingWindow): string {
  const { qualifyingFrom: from, qualifyingTo: to } = window;
  if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
  if (from) return `${formatShortDate(from)} onwards`;
  if (to) return `up to ${formatShortDate(to)}`;
  return "";
}

/** Two windows are the same window. */
function sameWindow(a: QualifyingWindow, b: QualifyingWindow): boolean {
  return a.qualifyingFrom === b.qualifyingFrom && a.qualifyingTo === b.qualifyingTo;
}

/**
 * The basis line for a set of galas.
 *
 * When every gala with a window shares it — the normal case, and what the 2026-27
 * season looks like — the sentence names the dates once. Where they differ it
 * says so per gala rather than picking one and misdescribing the rest.
 */
export function QualifyingBasis({
  windows,
  className,
}: {
  windows: QualifyingWindowsByGala;
  className?: string;
}) {
  const present = GALA_ORDER.filter((code) => {
    const w = windows[code];
    return w !== undefined && (w.qualifyingFrom !== null || w.qualifyingTo !== null);
  });
  if (present.length === 0) return null;

  const first = windows[present[0]]!;
  const uniform = present.every((code) => sameWindow(windows[code]!, first));

  return (
    <p
      className={`rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-muted ${className ?? ""}`}
    >
      {uniform ? (
        <>
          Qualifying on meet times from{" "}
          <span className="font-medium text-ink">{windowLabel(first)}</span>.
          Personal bests set outside that window still show on the PB board, but
          cannot qualify a swimmer.
        </>
      ) : (
        <>
          Qualifying on meet times from{" "}
          {present
            .map((code) => `${GALA_MEDIUM[code]} ${windowLabel(windows[code]!)}`)
            .join("; ")}
          . Personal bests set outside a gala&rsquo;s window still show on the PB
          board, but cannot qualify a swimmer for it.
        </>
      )}
    </p>
  );
}
