# Swim Tracker — Build Prompts

Operational build plan for the app described in [`swim-tracker-BRD.md`](./swim-tracker-BRD.md).
Work **one step at a time**; do not scaffold ahead. Each step is prompted individually; this
file records the standing rules plus the prompts as they are issued.

---

## Standing rules (apply to every step)

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + Convex + Recharts. No other major
  library without asking.
- **One step only.** Build only what the current step covers — no screens, functions, or schema
  fields belonging to a later step. If a task seems to need later work, say so instead of building it.
- **Server trust.** Every Convex query and mutation validates inputs server-side and (from Step 15)
  enforces role-based access. Never trust the client.
- **Times.** Integer milliseconds internally; canonical text `m:ss:hh`. Swim times always render
  with tabular/monospaced figures so columns align. Never store formatted strings as the source of
  truth. Bulletproof parser: 2 groups means `ss:hh` (`59:09` = 59.09 s); the last group is always
  hundredths.
- **Event whitelist** (BRD §4.3, incl. 800/1500 Free) is authoritative. 100 IM is SCM-only; there is
  no 50 IM; 400 is Free/IM only. Reject anything off the whitelist.
- **Course.** SCM and LCM PBs are separate; never merge or compare across course.
- **Headline PB = fastest MEET time only.** Time trials and practice never count toward the PB.
- **Qualifying standards** are LCM only, never shown on SCM. Tier order hardest→easiest is
  **SANJ > LEVEL_3 > LEVEL_2**. Cuts match a swimmer's **exact single-year age**, not the two-year
  display band. Respect §4.9 coverage (no 50m at L3/SANJ; no L2 above 200m) — render no line where no
  cut exists; never interpolate.
- **Roles.** Coaches edit; viewers are read-only and see only their linked swimmer(s), enforced
  server-side in every query and mutation.
- **Design is gated (PRODUCT mode).** Use the committed design skills in `.claude/skills/`
  (impeccable, minimalist-ui, emil-design-eng, ui-ux-pro-max, full-output-enforcement) and the tokens
  in [`../DESIGN.md`](../DESIGN.md). After Step 1.5, **every UI step must pass
  `/impeccable critique <screen>` at ≥ 35/40** before it is "done" (fix flagged issues, do not
  suppress). Only DESIGN.md tokens — no ad-hoc hex, no new font families, no card-in-card, no
  gratuitous gradients or glassmorphism.
- **Per-step report:** (a) files created/changed, (b) commands to run, (c) how to verify,
  (d) for UI steps, the impeccable critique score.

When in doubt, the BRD wins over any assumption.

---

## Steps

### Step 1 — Project scaffold and authentication
Init Next.js (App Router) + TS + Tailwind; add Convex + Recharts. Convex Auth with the Password
provider (email + password); minimal `/login` and `/signup` and a sign-out control. `profiles` table
per BRD §7 (`authId`, `name`, `email`, `role`); on first sign-in create the profile defaulting to
`VIEWER`. Internal one-off `promoteToCoach(email)` for the dashboard (temporary admin tooling).
`useCurrentProfile()` hook/query. Gate the app: signed-out → `/login`; signed-in → placeholder home
showing name and role. (If we later switch to Clerk, only auth wiring and identity lookups change —
keep the `profiles` table and role model identical.) Login/signup kept clean and unstyled-minimal
until the design system exists.

### Step 1.5 — Establish the design system with Impeccable (before feature UI)
Run `/impeccable init` in PRODUCT mode. Capture the direction in PRODUCT.md / DESIGN.md: modern
minimalist coaching tool; OKLCH semantic tokens (no raw hex in components); cool slate neutrals on
soft off-white, near-ink text; exactly one deep-teal accent; one clear green for qualified only; a
tier token scale `--tier-sanj` (gold) → `--tier-l3` → `--tier-l2` → `--tier-none` that is never
colour-only (badges carry a label/shape); standard amber/red for warning/error, sparing; one legible
family with tabular figures for swim times; 8px grid; minimal motion. Ban: card-in-card, purple→blue
gradients, glassmorphism without function, the icon-tile-above-every-heading, grey-on-colour text,
generic SaaS card grids. Produce the living tokens plus a one-screen component preview (`/preview`):
buttons, inputs, a data-table row with a swim time, the full tier badge set, and a chart card. Run
`/impeccable decoration discipline` then `/impeccable critique` and iterate to ≥ 35/40.

### Step 1.6 — Make the repo self-contained
Commit the project's design skills at repo level under `.claude/skills/` (impeccable, minimalist-ui,
emil-design-eng, ui-ux-pro-max, full-output-enforcement). Add the impeccable hook to the **committed**
`.claude/settings.json` (not the gitignored `settings.local.json`) so it travels. Keep CLAUDE.md at
the repo root (names the skills, the ≥ 35/40 design gate, the tokens, and the non-negotiable domain
invariants). Put the BRD and these build prompts under `docs/` and reference them from CLAUDE.md.
`.gitignore` commits `.claude/skills/`, `.claude/settings.json`, CLAUDE.md, and DESIGN.md, ignoring
only machine-local files (`.claude/settings.local.json`, `.claude/*.local.json`, `.env*`).

---

_Later steps (swimmers, squads, logging, profile, comparison, progression, qualification matrix,
standards management, viewer experience, etc. per BRD §5 and §10) are appended here as they are
issued._
