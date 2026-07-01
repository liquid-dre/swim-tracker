# Swim Tracker — Project Guide (CLAUDE.md)

A coach tool for tracking swimmers' personal bests, progression, and readiness against
qualifying standards. **Source of truth:** `docs/swim-tracker-BRD.md`. **Build steps:**
`docs/swim-tracker-build-prompts.md`. Build one step at a time; do not scaffold ahead.

## Stack
Next.js (App Router) · TypeScript · Tailwind · Convex · Recharts. Times stored as integer milliseconds.

## Design skills — always use these for UI (they live in `.claude/skills/`)
- **impeccable** — product-mode design + anti-slop. **Every UI screen must pass
  `/impeccable critique` at ≥ 35/40** (fix the flagged issues, do not suppress them) before it is
  "done". Also use `/impeccable polish`, `audit`, `distill`, `decoration discipline`.
- **minimalist-ui** — the aesthetic direction (modern minimalist). One aesthetic base only.
- **emil-design-eng** — interaction/motion craft (charts, transitions); subordinate to impeccable's restraint.
- **ui-ux-pro-max** — UX patterns for dense screens (status matrix, filters, tables).
- **full-output-enforcement** — no truncated or half-finished output.

**Do NOT use** for this project: `industrial-brutalist-ui`, `brandkit`, `redesign-existing-projects`,
`imagegen-frontend-web`, `imagegen-frontend-mobile`, `image-to-code`, `gpt-taste`,
`stitch-design-taste`, `design-taste-frontend`, `high-end-visual-design`. They conflict with the
minimalist product direction or bloat context.

## Design system (product mode)
Tokens live in `DESIGN.md`. Cool near-monochrome neutrals on soft off-white; exactly **one** deep-teal
accent; a semantic tier scale `--tier-sanj` (gold) → `--tier-l3` → `--tier-l2` → `--tier-none`, which is
**never colour-only** (always paired with a text label). **Tabular figures** for all swim times. 8px
spacing grid. Minimal motion (hierarchy only). Banned: card-in-card, purple→blue gradients,
glassmorphism without function, the rounded-square icon tile above every heading, grey-on-colour text.

## Non-negotiable domain invariants (do not drift, even across sessions or after compaction)
- **Events:** 50/100/200/400/800/1500 per the whitelist. 100 IM is **SCM-only**; there is no 50 IM;
  400 is Free/IM only. Reject anything off the whitelist.
- **Course:** SCM and LCM PBs are **separate**; never merge or compare across course.
- **Headline PB = fastest MEET time only.** Time trials and practice never count toward the PB.
- **Times:** integer ms internally; canonical text `m:ss:hh`. Bulletproof parser — 2 groups means
  `ss:hh` (so `59:09` = 59.09 s, never 59 minutes); the last group is always hundredths.
- **Qualifying standards:** **LCM only**; tier order **SANJ > LEVEL_3 > LEVEL_2** (hardest → easiest);
  match a swimmer's **exact single-year age**, not the two-year display band; respect coverage
  (no 50m at L3/SANJ, no L2 above 200m) — render no line where no cut exists, never interpolate.
- **Roles:** coaches edit; viewers are read-only and see only their linked swimmer(s), enforced
  server-side in every query and mutation.

## Workflow
Every UI step ends with the impeccable ≥ 35/40 gate. Prefer tables over card grids on data screens.
When in doubt, the BRD wins over any assumption.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
