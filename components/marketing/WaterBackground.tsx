"use client";

import { useEffect, useState } from "react";

import Ferrofluid from "./Ferrofluid";

/*
  The water backdrop for the public front door (landing / login / sign-up). Wraps
  the Ferrofluid WebGL surface with a fixed palette of blue "water" shades and
  sensible motion. Decorative only (aria-hidden) and absolutely filling — drop it
  into a `relative` container over a deep-ocean background colour. Honours
  prefers-reduced-motion by freezing the surface (speed 0) and dropping the
  cursor interaction, so it never animates for users who opt out.
*/

// Module-level constant so the reference is stable — otherwise Ferrofluid's
// effect (which lists `colors` as a dep) would tear down and rebuild WebGL on
// every render.
const WATER_COLORS = ["#e3f4ff", "#4bb4f2", "#0b4f96"];

export function WaterBackground({ className = "" }: { className?: string }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div aria-hidden className={`absolute inset-0 ${className}`}>
      <Ferrofluid
        colors={WATER_COLORS}
        speed={reduced ? 0 : 0.14}
        scale={2.6}
        turbulence={0.75}
        fluidity={0.1}
        rimWidth={0.24}
        sharpness={3}
        shimmer={0.8}
        glow={1.1}
        flowDirection="up"
        opacity={1}
        mouseInteraction={!reduced}
        mouseStrength={0.25}
        mouseRadius={0.16}
      />
    </div>
  );
}
