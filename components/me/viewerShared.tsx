"use client";

import type { ReactNode } from "react";
import { CalendarClock, Eye, UserRound } from "lucide-react";

import { formatShortDate } from "@/lib/format";

/*
  Shared presentational atoms for the viewer's compartmentalised experience
  (Step R6). Extracted from the old single-page viewer home so the four focused
  routes (/me, /me/progress, /me/road, /me/history) read identically.
*/

export function ReadOnlyChip({ tone = "default" }: { tone?: "default" | "onWater" }) {
  if (tone === "onWater") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-medium text-white/90">
        <Eye aria-hidden className="size-3.5 text-white/70" />
        Read-only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
      <Eye aria-hidden className="size-3.5 text-ink-faint" />
      Read-only
    </span>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <span aria-hidden className="h-3.5 w-px bg-border" />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-muted">
      <dt>{label}</dt>
      <dd className="tnum font-medium text-ink">{value}</dd>
    </div>
  );
}

/** The swimmer's identity row — name + age/gender/status/since/results. */
export function IdentityStrip({
  name,
  age,
  gender,
  active,
  inSystemSince,
  resultCount,
}: {
  name: string;
  age: number;
  gender: "M" | "F";
  active: boolean;
  inSystemSince: string;
  resultCount: number;
}) {
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Swimmer</dt>
        <dd className="text-base font-semibold text-ink">{name}</dd>
      </div>
      <Divider />
      <Stat label="Age" value={`${age}`} />
      <Divider />
      <Stat label="Gender" value={gender === "F" ? "Female" : "Male"} />
      <Divider />
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Status</dt>
        <dd>
          {active ? (
            <span className="inline-flex items-center gap-1.5 text-success-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-success" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" /> Inactive
            </span>
          )}
        </dd>
      </div>
      <Divider />
      <div className="flex items-center gap-1.5 text-ink-muted">
        <CalendarClock aria-hidden className="size-4 text-ink-faint" />
        <dt className="sr-only">In system since</dt>
        <dd>
          In system since{" "}
          <span className="text-ink">{formatShortDate(inSystemSince)}</span>
        </dd>
      </div>
      <Divider />
      <Stat label="Results" value={`${resultCount}`} />
    </dl>
  );
}

export function MiniEmpty({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

export function NoLinkState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-theme-sm">
      <UserRound aria-hidden className="size-7 text-ink-faint" strokeWidth={1.6} />
      <div className="space-y-1">
        <p className="text-base font-medium text-ink">No swimmer linked yet</p>
        <p className="mx-auto max-w-[46ch] text-sm text-ink-muted">
          Your account isn&rsquo;t linked to a swimmer. Ask your coach to link you
          with the email you signed up with, and your bests will appear here.
        </p>
      </div>
    </div>
  );
}

export function ViewerSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <div className="h-4 w-72 animate-pulse rounded-sm bg-surface-2" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      ))}
    </div>
  );
}
