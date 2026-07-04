import Link from "next/link";
import { ArrowRight, Droplets } from "lucide-react";

import { WaterBackground } from "@/components/marketing/WaterBackground";

/*
  Public landing page (front-door overhaul). Reachable only when signed OUT —
  middleware redirects authenticated users to their app home. A deep-ocean water
  hero (the one expressive surface) over calm, specific copy; the product app
  stays on the minimalist system. Copy is plain and domain-true (PRODUCT.md).
*/

const OCEAN = "#04142e";

const POINTS = [
  {
    title: "Meet-only PBs",
    body: "The headline best is the fastest meet swim — trials and practice never inflate it.",
  },
  {
    title: "Exact-age cuts",
    body: "Readiness matched to the swimmer's single-year age and course, never interpolated.",
  },
  {
    title: "Progression you trust",
    body: "Every logged swim on one honest chart, with SCM and LCM kept strictly apart.",
  },
];

export default function LandingPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden text-white"
      style={{ backgroundColor: OCEAN }}
    >
      <WaterBackground />
      {/* Flat contrast scrim (not a gradient) so white copy stays legible over
          the brightest water rims; pointer-events-none keeps the cursor spike. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#04142e]/45" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-7 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/25">
              <Droplets className="size-5" strokeWidth={2} />
            </span>
            <span className="text-lg font-semibold tracking-tight">Swim Tracker</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Sign in
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              A coach&rsquo;s tool for qualifying times
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              A pile of race times,
              <br />
              read at a glance.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              Swim Tracker turns raw times into a clear read on each swimmer&rsquo;s
              personal bests, trajectory, and readiness against every qualifying cut
              — right course, right event, right age. Without a spreadsheet.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-gray-900 shadow-theme-sm outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Create account
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-xl border border-white/25 px-5 text-sm font-medium text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="bg-[#061a34]/85 p-5">
              <h3 className="text-sm font-semibold text-white">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{p.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-8 text-xs uppercase tracking-[0.2em] text-white/40">
          Precise · legible · unshowy
        </footer>
      </div>
    </main>
  );
}
