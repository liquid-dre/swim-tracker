"use client";

import { useEffect, useState } from "react";

/*
  Time-aware, personalised greeting for the two role landing screens
  (/dashboard, /me). The time-of-day band is computed from the USER'S LOCAL
  clock (client Date), never the server, so it matches where the person is:

    morning    < 12:00
    afternoon  12:00–16:59
    evening    >= 17:00

  The band is resolved in an effect AFTER mount (not during render), so the
  server render and the first client render agree — no hydration mismatch — then
  it refreshes on window focus / tab visibility so a tab left open past a
  boundary isn't stale. Until the band resolves, or when no name is known, it
  degrades to a neutral "Welcome back." — it never renders "undefined".
*/

export type GreetingBand = "morning" | "afternoon" | "evening";

const GREETING: Record<GreetingBand, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** The neutral fallback shown with no name or before the local band resolves. */
export const NEUTRAL_GREETING = "Welcome back.";

/**
 * Time-of-day band from a Date's LOCAL hours: morning < 12:00, afternoon
 * 12:00–16:59, evening >= 17:00 (so 11:59 → morning, 12:00 → afternoon,
 * 17:00 → evening).
 */
export function greetingBand(date: Date): GreetingBand {
  const h = date.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** First name from a full-name string; the whole name if it's a single token. */
export function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed === "") return null;
  return trimmed.split(/\s+/)[0];
}

/**
 * Compose the heading greeting.
 *   - "Good morning, Alex." when both the band and a usable name are known.
 *   - the neutral "Welcome back." when the band is null (not yet resolved) or
 *     no name is set (missing / blank) — never "undefined".
 */
export function composeGreeting(
  band: GreetingBand | null,
  name: string | null | undefined,
): string {
  const first = firstNameOf(name);
  if (band && first) return `${GREETING[band]}, ${first}.`;
  return NEUTRAL_GREETING;
}

export function useGreeting(name: string | null | undefined): string {
  // `null` until the client resolves its local time (post-mount), so SSR and
  // the first client render produce identical markup.
  const [band, setBand] = useState<GreetingBand | null>(null);

  useEffect(() => {
    const update = () => setBand(greetingBand(new Date()));
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return composeGreeting(band, name);
}
