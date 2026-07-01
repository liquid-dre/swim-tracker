# Product

## Register

product

## Users

Swimming coaches and their swimmers/parents.

- **Coaches** (primary, edit): manage a squad of swimmers, log meet/time-trial/practice results, and read progression against qualifying standards. They work in focused sessions, often poolside or right after a meet, scanning many swimmers × many events quickly. Density and scannability beat hand-holding.
- **Viewers** (read-only): a swimmer or parent who sees only their linked swimmer(s). They check "where am I, and how close am I to the next cut?" occasionally, on phones as often as laptops.

The job to be done: **turn a pile of race times into a clear read on each swimmer's personal bests, trajectory, and readiness to qualify** — without a spreadsheet.

## Product Purpose

A coaching tool that tracks swimmers' personal bests, progression over time, and readiness against age-and-course-specific qualifying standards (SANJ / Level 3 / Level 2). Times are the raw material; the product's value is correct comparison: right course, right event, right exact-age cut, meet-only PBs. Success = a coach trusts the numbers enough to make squad decisions from this screen instead of a spreadsheet, and a swimmer can see their gap to the next tier at a glance.

## Brand Personality

Precise, calm, quietly authoritative. Three words: **exact, legible, unshowy.** The interface should feel like a well-kept logbook, not a dashboard demo. It never celebrates itself; the swimmer's data is the only thing that gets to be loud. Copy is plain and specific ("Fastest meet time", "0.42s to Level 3"), never motivational-poster.

## Anti-references

Do NOT look like:
- A generic SaaS analytics dashboard: identical card grids, hero-metric tiles with big gradient numbers, KPI confetti.
- A fitness/consumer app: rounded-square icon tiles above every heading, playful gradients, glassmorphism, emoji.
- A spreadsheet-with-a-skin: ungrouped grey grids with no hierarchy.

Specific banned patterns (also enforced in DESIGN.md): card-in-card, purple→blue gradients, glassmorphism without function, the rounded-square icon tile above every heading, grey text on coloured backgrounds, decorative motion.

## Design Principles

1. **Correctness is the feature.** Every visual decision serves reading the number right: course never blurs across SCM/LCM, tiers match exact age, meet-PBs are distinguished from practice. If a design choice could mislead, it loses.
2. **One anchor per screen.** Dense data, but a single clear focal point (the PB, the gap, the trend) — everything else is support. No screen competes with itself.
3. **Tabular truth.** Swim times are the protagonist; they always align in columns so the eye compares vertically without effort.
4. **Colour is meaning, never decoration.** Exactly one accent (teal) for action/focus; green only for qualified; the tier scale only for tiers, always paired with a label. A splash of colour must always mean something.
5. **Quiet by default.** Restraint over flourish. Motion only to reinforce hierarchy or confirm state. The tool disappears into the task.

## Accessibility & Inclusion

- Target WCAG 2.1 AA: body text ≥ 4.5:1, large text ≥ 3:1, visible focus rings on every interactive element, full keyboard operability.
- **Never rely on colour alone.** Tier and qualified/at-risk states always carry a text label and/or shape in addition to colour, so colour-blind users and greyscale printers read them correctly.
- Respect `prefers-reduced-motion`: all transitions degrade to instant/crossfade.
- Touch targets ≥ 44px for the viewer (mobile) experience.
