"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Plane } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StandardsMissing } from "@/components/ui/StandardsMissing";
import { TierBadge } from "@/components/ui/TierBadge";
import { trailForHref } from "@/lib/nav";
import { swimmerProfileBase } from "@/lib/swimmerHref";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useNewKeys } from "@/lib/useNewKeys";
import { formatShortDate } from "@/lib/format";
import { formatSeconds } from "@/lib/format";
import { formatTime, GALA_FULL, GALA_ORDER } from "@/lib/swim";

/*
  Gala qualification — which gala each swimmer is going to. Each swimmer appears
  once, under the HIGHEST gala they qualify for (GALA_ORDER: SANS > SANY > SANJ >
  L3 > L2), with the events that got them there. Either course can qualify them;
  trials and practice never count. Cuts follow the tour rule: a gala with a tour
  date judges at each swimmer's age ON TOUR DAY; a gala without one judges each PB
  at the swimmer's current age (§4.9). Coach-only — a cross-roster planning
  surface.
*/

export function QualificationScreen() {
  const pathname = usePathname();
  const swimmerBase = swimmerProfileBase(pathname);
  const data = useQuery(api.tours.getTourQualification, {});

  // Only the super-user can set tour dates; the fallback caption links there
  // for them and stays plain text for a coach.
  const profile = useCurrentProfile();
  const isSuperUser = profile != null && profile.role === "SUPER_USER";
  // The same screen serves /qualification (coach: whole roster) and
  // /me/qualification (viewer: only their linked swimmer(s), scoped
  // server-side) — copy adapts, judgement never does.
  const isViewer = profile != null && profile.role === "VIEWER";

  // Convex pushes changes live: a swimmer who qualifies while this screen is
  // open appears with a one-shot background fade so the change is seen, not
  // silently reshuffled. Keyed per gala so moving UP a tour also flashes.
  const newKeys = useNewKeys(
    (data?.galas ?? []).flatMap((g) =>
      g.swimmers.map((s) => `${g.gala}|${s.swimmerId}`),
    ),
    data !== undefined,
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Gala qualification"
        breadcrumb={trailForHref(pathname)}
        description={
          isViewer
            ? "Which tour your swimmer(s) currently qualify for — the highest gala their meet times meet, in either course. Trials and practice never count."
            : "Who is going where. Each swimmer appears under the highest tour they qualify for, with the meet times that got them there. Either course can qualify them; trials and practice never count."
        }
      />

      {data === undefined ? (
        <QualSkeleton />
      ) : !data.hasStandards ? (
        <StandardsMissing isStaff={!isViewer} />
      ) : !data.hasSwimmers ? (
        isViewer ? (
          <EmptyState
            title="No swimmer linked yet"
            body="Once a coach links you to your swimmer (or approves your request), their tour qualification appears here."
          />
        ) : (
          <EmptyState
            title="No active swimmers yet"
            body="Add swimmers to the roster and log their meet times — qualification fills in from there."
          />
        )
      ) : (
        data.galas.map(({ gala, displayName, tour, swimmers }) => (
          <section key={gala} className="flex flex-col gap-3">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <TierBadge gala={gala} />
                <h2 className="text-sm font-semibold text-ink">
                  {tour?.name ?? displayName}
                </h2>
              </div>
              <p className="text-xs text-ink-muted">
                {tour ? (
                  <>
                    {formatShortDate(tour.date)} — judged at each swimmer&rsquo;s
                    age on tour day
                  </>
                ) : (
                  <>
                    no tour date set — judged at each swimmer&rsquo;s current age
                    {isSuperUser && (
                      <>
                        {" · "}
                        <Link
                          href="/admin/galas"
                          className="rounded-sm font-medium text-brand-500 outline-none hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          set a date
                        </Link>
                      </>
                    )}
                  </>
                )}
                {swimmers.length > 0 && (
                  <span className="tabular-nums">
                    {" · "}
                    {swimmers.length} {swimmers.length === 1 ? "swimmer" : "swimmers"}
                  </span>
                )}
              </p>
            </header>

            {swimmers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center shadow-theme-sm">
                <p className="text-sm text-ink-muted">
                  {/* "Highest tour only": someone may well meet this gala's
                      cuts but be listed above — never claim nobody has. */}
                  {isViewer ? (
                    <>
                      No {GALA_FULL[gala]} qualification yet
                      {gala !== GALA_ORDER[0] &&
                        " — a swimmer qualifying higher is listed under that tour"}
                      .
                    </>
                  ) : (
                    <>
                      No one&rsquo;s highest tour is {GALA_FULL[gala]} yet
                      {gala !== GALA_ORDER[0] &&
                        " — swimmers who qualify higher are listed under that tour"}
                      .
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
                <div className="relative overflow-x-auto custom-scrollbar">
                  <table className="w-full text-base">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                          Swimmer
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          {tour ? "Age on tour day" : "Age"}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                          Qualifying events
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {swimmers.map((s) => (
                        <tr
                          key={s.swimmerId}
                          className={
                            "border-t border-border align-top transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2" +
                            (newKeys.has(`${gala}|${s.swimmerId}`)
                              ? " animate-row-flash"
                              : "")
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-ink sm:px-6">
                            <Link
                              href={`${swimmerBase}/${s.swimmerId}`}
                              className="rounded-sm outline-none hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {s.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-ink-muted tabular-nums">
                            {s.age}
                          </td>
                          <td className="px-4 py-3 sm:px-6">
                            <ul className="flex flex-wrap gap-1.5">
                              {s.events.map((e) => (
                                <li
                                  key={e.label}
                                  className="inline-flex items-baseline gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-sm"
                                >
                                  <span className="text-ink">{e.label}</span>
                                  <span className="time tnum font-medium text-ink">
                                    {formatTime(e.pbMs)}
                                  </span>
                                  {/* The cut is visible (not hover-only) and the
                                      margin speaks the app's delta vocabulary. */}
                                  <span className="tnum text-xs text-success-ink">
                                    {e.marginMs === 0
                                      ? "on the cut"
                                      : `${formatSeconds(e.marginMs)}s under`}
                                  </span>
                                  <span className="time tnum text-xs text-ink-faint">
                                    cut {formatTime(e.cutMs)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Plane aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function QualSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-5 w-48 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      ))}
    </div>
  );
}
