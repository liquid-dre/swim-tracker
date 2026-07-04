import type { ReactNode } from "react";
import Link from "next/link";
import { Droplets } from "lucide-react";

import { WaterBackground } from "./WaterBackground";

/*
  Shared layout for the sign-in / sign-up screens: a deep-ocean water panel
  beside the form. The panel reflows from a slim top strip on mobile to a full
  left column on desktop — it's ONE element (not two responsive copies), so only
  a single WebGL surface ever mounts. The form column keeps the light, calm
  design-system card vocabulary; the water is the one expressive note.
*/

// Deep ocean navy behind the water (never pure black — DESIGN.md).
const OCEAN = "#04142e";

export function BrandMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <Link
      href="/"
      className={
        "inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/60 " +
        (light ? "text-white" : "text-gray-900")
      }
    >
      <span
        className={
          "flex size-9 items-center justify-center rounded-xl " +
          (light
            ? "bg-white/10 text-white ring-1 ring-inset ring-white/25"
            : "bg-brand-50 text-brand-500")
        }
      >
        <Droplets className="size-5" strokeWidth={2} />
      </span>
      <span className="text-lg font-semibold tracking-tight">Swim Tracker</span>
    </Link>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-white lg:flex-row">
      {/* Water panel: top strip on mobile, left column on desktop. */}
      <aside
        className="relative h-40 shrink-0 overflow-hidden sm:h-48 lg:h-auto lg:min-h-screen lg:w-[52%]"
        style={{ backgroundColor: OCEAN }}
      >
        <WaterBackground />
        {/* Flat contrast scrim (not a gradient); pointer-events-none keeps the
            cursor spike alive under it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#04142e]/35" />
        <div className="relative z-10 flex h-full flex-col justify-between p-6 text-white lg:p-10 xl:p-14">
          <BrandMark tone="light" />
          <div className="hidden max-w-md lg:block">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              Every race time, read at a glance.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Personal bests, progression, and readiness against every qualifying
              cut — for the whole squad, without a spreadsheet.
            </p>
          </div>
          <p className="hidden text-xs uppercase tracking-[0.2em] text-white/40 lg:block">
            Precise · legible · unshowy
          </p>
        </div>
      </aside>

      {/* Form column. */}
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-7 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {title}
            </h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
          {children}
          {footer && (
            <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}
