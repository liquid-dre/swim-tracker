"use client";

import { useCallback, useEffect, useRef } from "react";

import { formatTime, type Tier } from "@/lib/swim";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/useMediaQuery";

/*
  The qualification / PB celebration moment (swimmer & parent register). Unlike
  the rest of the app's calm coach voice, this is deliberately energetic — the
  one place the product cheers. It celebrates a REAL achievement: the proudest
  qualified cut derived from the swimmer's headline meet PBs (never fabricated).

  - The medal is tinted by the actual tier (gold SANJ / purple L3 / sky L2) so
    the tier's meaning is reinforced, never masked by a generic gold.
  - Colour is never the only signal: the tier is named in the heading and chip.
  - Motion is opt-in to the viewer's system setting: confetti auto-plays ONCE on
    mount and can be replayed; under prefers-reduced-motion it never fires and
    the Replay control is withheld (the card still reads perfectly, static).
*/

type Props = {
  tier: Tier;
  /** Human event label, e.g. "50 Fly". */
  eventLabel: string;
  /** Headline LCM meet PB for the event, in integer ms. */
  timeMs: number;
};

const TIER_FULL: Record<Tier, string> = {
  LEVEL_2: "Level 2",
  LEVEL_3: "Level 3",
  SANJ: "SANJ",
};

// The tier's own colour (DESIGN.md §3) — reused so the medal reads as that tier.
const TIER_COLOR: Record<Tier, string> = {
  LEVEL_2: "var(--color-tier-l2)",
  LEVEL_3: "var(--color-tier-l3)",
  SANJ: "var(--color-tier-sanj)",
};

// Celebration palette: the water accent plus the two colours that already MEAN
// success — gold (top tier) and green (qualified) — so nothing decorative steals
// a signal. Brand indigo and white round it out.
const CONFETTI = ["#06b6d4", "#22d3ee", "#f79009", "#12b76a", "#465fff", "#ffffff"];

export function QualifyCelebration({ tier, eventLabel, timeMs }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  // SSR-safe: false on the server, real value after mount — no setState-in-effect.
  const motionOk = !useMediaQuery("(prefers-reduced-motion: reduce)");

  const burst = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parts = Array.from({ length: 72 }, () => ({
      x: canvas.width / 2,
      y: 46,
      vx: (Math.random() - 0.5) * 7,
      vy: Math.random() * -7 - 2,
      g: 0.18 + Math.random() * 0.12,
      r: 3 + Math.random() * 4,
      c: CONFETTI[(Math.random() * CONFETTI.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
      max: 70 + Math.random() * 40,
    }));

    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        if (p.life > p.max) continue;
        alive = true;
        p.life += 1;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      }
      if (alive) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    frame();
  }, []);

  // Auto-play the confetti ONCE on mount, unless the viewer prefers reduced motion.
  useEffect(() => {
    if (!motionOk) return;
    const t = window.setTimeout(burst, 350);
    return () => {
      window.clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [burst, motionOk]);

  const onShare = useCallback(async () => {
    const summary = `${eventLabel} — ${formatTime(timeMs)} · qualified for ${TIER_FULL[tier]}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Swim Tracker", text: summary });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
        notify.success("Result copied");
        return;
      }
      notify.info(summary);
    } catch {
      // User dismissed the share sheet — not an error worth surfacing.
    }
  }, [eventLabel, timeMs, tier]);

  return (
    <div
      ref={hostRef}
      className="celebrate-pop relative overflow-hidden rounded-2xl px-6 py-6 text-center text-white shadow-theme-md"
      style={{
        background:
          "radial-gradient(120% 140% at 50% 0%, var(--color-brand-500) 0%, var(--color-water-2) 46%, var(--color-water-3) 100%)",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <span className="celebrate-shimmer relative z-[1] mx-auto mb-1 block h-16 w-16 overflow-hidden rounded-full">
        <Medal color={TIER_COLOR[tier]} />
      </span>

      <span className="tnum relative z-[1] block text-3xl font-extrabold tracking-tight">
        {formatTime(timeMs)}
      </span>
      <h2 className="relative z-[1] mt-1 text-lg font-extrabold tracking-tight">
        You qualified for {TIER_FULL[tier]}!
      </h2>
      <p className="relative z-[1] mx-auto mt-1 max-w-[42ch] text-sm text-white/80">
        {eventLabel} · long course · your fastest meet time clears the cut.
      </p>

      <div className="relative z-[1] mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onShare}
          className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-brand-700 outline-none transition-transform [transition-duration:var(--dur-1)] hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
        >
          Share result
        </button>
        {motionOk && (
          <button
            type="button"
            onClick={burst}
            className="rounded-lg bg-white/15 px-4 py-2 text-xs font-semibold text-white outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Replay
          </button>
        )}
      </div>
    </div>
  );
}

/** A tier-tinted award medal built from plain geometry (no sketchy paths). */
function Medal({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className="h-full w-full">
      {/* Ribbon (aqua, the water accent) tucked behind the disc. */}
      <path d="M24 40 20 60l12-6 12 6-4-20" fill="var(--color-aqua-deep)" />
      <circle cx="32" cy="26" r="19" fill={color} />
      <circle cx="32" cy="26" r="19" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="32" cy="26" r="12" fill="#ffffff" fillOpacity="0.28" />
      <path
        d="M32 17.5 34 22l4.8.4-3.6 3.1 1.1 4.7L32 27.6 27.7 30.2l1.1-4.7-3.6-3.1 4.8-.4Z"
        fill="#ffffff"
      />
    </svg>
  );
}
