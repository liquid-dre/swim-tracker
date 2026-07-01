---
target: "Step 3.5 global UI: toasts + breadcrumbs"
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T11-09-56Z
slug: p-layout-tsx-step-3-5-global-ui-toasts-breadcrumbs
---
# Critique — Step 3.5 global UI (Sonner toasts + shadcn breadcrumb / PageHeader)

Register: product. Targets: `components/ui/sonner.tsx`, `lib/notify.ts`,
`components/ui/breadcrumb.tsx`, `components/ui/AppBreadcrumb.tsx`,
`components/ui/PageHeader.tsx`, mounted once in `app/layout.tsx`, exercised on `/preview`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | notify.promise drives loading→success/error; toasts announce via aria-live; breadcrumb shows location |
| 2 | Match System / Real World | 4 | Plain past-tense success ("Time saved"); server message verbatim on error; crumbs use real names, not `[id]` |
| 3 | User Control and Freedom | 4 | Close button on every toast, ~4s auto-dismiss, breadcrumb links back up the trail |
| 4 | Consistency and Standards | 4 | shadcn primitives + single `notify` voice + tokens throughout; PageHeader is the one page-top for every screen |
| 5 | Error Prevention | 3 | Little to prevent at this layer; error path defaults to the server's own message rather than a guessed string |
| 6 | Recognition Rather Than Recall | 4 | Breadcrumb trail + semantic icon paired with distinct shape (check/!/i) so type never reads by colour alone |
| 7 | Flexibility and Efficiency | 3 | Responsive placement (bottom-right desktop / top mobile); relies on Sonner's built-in keyboard focus, none added |
| 8 | Aesthetic and Minimalist Design | 4 | Neutral --surface toast, one radius, hairline border; the ONLY colour is the status icon. No rich-colour rainbow |
| 9 | Error Recovery | 3 | Error toast surfaces the cause; no inline retry action wired in the demo (notify supports actionButton) |
| 10 | Help and Documentation | 3 | notify.ts documents the copy contract; breadcrumb teaches location; not a user-facing help surface |
| **Total** | | **36/40** | **Strong — ships** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI slop. This is the restrained, earned-familiar
product register done right. The toast is a neutral card with a hairline border, one
radius, and a soft popover shadow (no border+heavy-shadow ghost-card pairing). Semantic
colour is confined to a single status glyph — success green, error red, warning amber,
info teal — each paired with a distinct shape, so it reads in greyscale and under
colour-blindness. No rich-colour backgrounds, no bouncing, no emoji. The breadcrumb is
small, muted, one line, with the current page as the only emphasised crumb. Nothing here
would make a user fluent in Linear/Stripe pause.

**Deterministic scan**: `detect.mjs --json` over all five component files plus the layout
returned `[]` (exit 0) — zero findings. No side-stripe borders, no gradient text, no
ghost-card border+shadow, no over-rounding, no eyebrow scaffolding.

**Visual overlays**: Not injected. Verified instead by direct browser screenshots
(Chromium/Playwright) of the live `/preview` build: breadcrumb trail, the loading→success
promise transition, and the error/info icon colours.

## Overall Impression

Both surfaces are production-ready and on-brand. The toast system's discipline — colour
only in the icon, neutral surface everywhere else — is exactly what DESIGN.md's "accent +
semantic under 10% of any screen" asks for, and it will stay quiet across hundreds of
firings. The breadcrumb + PageHeader give every future screen a single, consistent top
without any per-page reinvention. Biggest opportunity is small: wire a retry affordance
into the error path so recovery is one click, not a re-navigation.

## What's Working

- **Colour restraint by construction.** The toast surface is tokenised neutral; the only
  hue is the semantic icon. This is the single most important decision for a component that
  appears everywhere, and it's correct.
- **One voice.** `notify` (not raw `toast`) centralises copy rules — past-tense success,
  server message on error — so 50 future call sites can't drift.
- **Accessibility baked in.** aria-current on the last crumb, separators aria-hidden,
  icon+shape pairing, SSR-safe responsive placement via useSyncExternalStore (no hydration
  flip, no setState-in-effect).

## Priority Issues

- **[P2] Error recovery is navigate-away, not retry.** The error toast states the cause but
  offers no action. For a failed save the fastest recovery is a "Retry" button in the toast.
  **Fix**: expose an optional `action: { label, onClick }` on `notify.error` / `notify.promise`
  mapping to Sonner's `action`. **Command**: `$impeccable harden`.
- **[P3] `info` icon shares the brand-accent teal.** The info glyph uses `accent-strong`,
  the same hue as primary actions. It's disambiguated by the `i` shape and its position, so
  it's not a real confusion, but a slightly cooler/greyer info tone would separate "status"
  from "action". **Fix**: optional dedicated info token. **Command**: `$impeccable colorize`.
- **[P3] Reduced-motion relies on the global override.** Sonner's enter/exit is neutralised
  by the app-wide `*{transition-duration}` reduce rule rather than a Sonner-specific opt-out.
  It works (verified), but is implicit. **Fix**: leave as-is, or document the dependency.

## Persona Red Flags

**Coach (power user, poolside)**: Toasts auto-dismiss at ~4s and never block the table;
bottom-right keeps them out of the data. No red flag. A "Retry" in the error toast would
save a re-tap after a flaky-network save.

**Parent/Viewer (first-timer, mobile)**: Top-centre placement on mobile is thumb-reachable
and clears the keyboard; close button is present. Breadcrumb resolves real swimmer names, so
"where am I" is answered. No jargon in copy. No red flag.

## Minor Observations

- Long server error strings wrap cleanly inside the toast width — verified with a
  full-sentence error.
- Breadcrumb collapses gracefully; separator chevron is decorative (aria-hidden), so its
  lower contrast is acceptable.
- PageHeader keeps title + actions on one row on wide screens and wraps on narrow — good.

## Questions to Consider

- Should `notify.promise` expose the resolved value to the success builder at call sites
  (it does) — worth a shared helper for the common "Saved / server-message" pair?
- Is a single global toast duration right, or should destructive-confirmation toasts persist
  until dismissed?
