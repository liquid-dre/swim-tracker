import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/*
  DESIGN.md's ban list, enforced.

  The colour half of that document is already checked by `lib/contrast.test.ts`,
  and that guard has caught real drift four times. The rest of the list — no
  card-in-card, no gradients, no glassmorphism, no pure black — was enforced by
  nothing, and a review found a card-in-card on a file that had simply never
  been measured against it. A rule the codebase states and does not check is a
  rule that holds until someone adds a file.

  These are structural greps, so they are blunt by construction: they read
  class strings, not a rendered tree. Where a ban is deliberately broken the
  exception is listed here WITH its reason, so the next one has to be argued
  rather than merely added.
*/

/** Every component file, walked rather than globbed so `tsc` is happy too. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : e.name.endsWith(".tsx")
        ? [join(dir, e.name)]
        : [],
  );
}

const FILES: string[] = walk("components").sort();

function read(f: string): string {
  return readFileSync(f, "utf8");
}

/** Every `className="…"` / `className={"…"}` string literal in a file, in order. */
function classStrings(source: string): { at: number; value: string }[] {
  const out: { at: number; value: string }[] = [];
  const re = /className=\{?["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ at: source.slice(0, m.index).split("\n").length, value: m[1] });
  }
  return out;
}

describe("no card-in-card (DESIGN.md: one card, sections divided by a hairline)", () => {
  /*
    A "card" here is the house spelling: a radius, a gray-200 border, and a
    shadow. Nesting is judged by INDENTATION, which is exact for this
    codebase's formatting and is why the check reports the lines rather than
    just a count — a false positive should be visible at a glance.
  */
  const isCard = (c: string) =>
    /\brounded-(?:xl|2xl)\b/.test(c) &&
    /\bborder-gray-200\b/.test(c) &&
    /\bshadow-theme-/.test(c);

  /*
    The INNER test drops the shadow requirement. DESIGN.md bans a second
    bordered, rounded panel inside a card — "one card, internal sections
    divided by border-gray-100" — and a shadowless `rounded-xl border
    border-gray-200` list is exactly that second panel, which is how the one
    real instance in this codebase read.
  */
  const isPanel = (c: string) =>
    /\brounded-(?:lg|xl|2xl)\b/.test(c) && /\bborder-gray-200\b/.test(c);

  /*
    LEXICAL nesting only. A panel that renders inside a card through a
    component boundary — `<Card><EventList /></Card>`, where EventList's own
    root carries the border — is invisible to an indentation check, and that
    is exactly how the one real instance in this codebase read. So the
    composed case is checked separately below, by name.
  */
  test.each(FILES)("%s nests no card inside another", (file: string) => {
    const source = read(file);
    const lines = source.split("\n");
    const all = classStrings(source);
    const cards = all
      .filter((c) => isCard(c.value) || isPanel(c.value))
      .map((c) => ({
        line: c.at,
        source: c.value,
        indent: (lines[c.at - 1] ?? "").search(/\S/),
      }));

    /*
      B is inside A when it is indented deeper AND nothing between them
      dedents back to A's level. That second half is what separates nesting
      from sibling cards in one parent — without it this flagged nineteen
      files, every one of them a list of cards side by side.
    */
    const nested: string[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        if (cards[j].indent <= cards[i].indent) break;
        // Only a real CARD can be the container; a panel inside a panel is a
        // list inside a list, which the ban is not about.
        if (!isCard(cards[i].source)) continue;
        const between = lines
          .slice(cards[i].line, cards[j].line - 1)
          .filter((l) => l.trim() !== "")
          .map((l) => l.search(/\S/));
        if (between.some((n) => n <= cards[i].indent)) continue;
        nested.push(`line ${cards[j].line} inside line ${cards[i].line}`);
      }
    }
    expect({ file, nested }).toEqual({ file, nested: [] });
  });
});

describe("no gradients, glassmorphism or pure black", () => {
  /*
    Three deliberate exceptions, each argued rather than assumed:

    - Tabs.tsx: a scroll-edge fade. A gradient TO TRANSPARENT over the canvas
      is an affordance saying "there is more to the right", not decoration —
      it carries no colour of its own.
    - LogScreen.tsx: the sticky poolside action bar, which must stay legible
      over whatever scrolls under it.
    - sheet.tsx: Radix's own modal scrim, vendored.

    Anything else has to be added here with its reason, which is the point.
  */
  const ALLOWED: Record<string, RegExp> = {
    "components/ui/Tabs.tsx": /bg-gradient-to-[rl]/,
    "components/log/LogScreen.tsx": /backdrop-blur|bg-bg\//,
    "components/ui/sheet.tsx": /bg-black\/50/,
    // Radix's own modal scrim again, in the shared confirmation dialog.
    "components/ui/ConfirmDialog.tsx": /bg-black\/50/,
  };

  const BANNED = [
    { name: "gradient", re: /\bbg-gradient-to-\w+\b/ },
    { name: "glassmorphism", re: /\bbackdrop-blur\b/ },
    { name: "pure black", re: /\b(?:text|bg)-black\b/ },
  ];

  test.each(FILES)("%s uses none of them unargued", (file: string) => {
    const source = read(file);
    const allow = ALLOWED[file];
    const hits = BANNED.flatMap(({ name, re }) =>
      classStrings(source)
        .filter((c) => re.test(c.value) && !(allow && allow.test(c.value)))
        .map((c) => `${name} at line ${c.at}`),
    );
    expect({ file, hits }).toEqual({ file, hits: [] });
  });
});

describe("panels that render inside a card through a component boundary", () => {
  /*
    The lexical check above cannot see these, so each is named. A component
    listed here is rendered inside a card by at least one call site — CHECKED
    at that call site, never inferred from the name; the first draft of this
    list carried one that turned out to be a top-level card in both of its —
    and must therefore carry no border or radius of its own, dividing with a
    hairline instead. `SwimmerMeetsTab`'s EventList is why this exists: it sat
    inside a `rounded-2xl` card on one path and a `rounded-xl` Collapsible on
    the other, and no grep over its own file could tell.
  */
  const COMPOSED: { file: string; component: string }[] = [
    // Rendered inside a `rounded-2xl` card on one path and a `rounded-xl`
    // Collapsible on the other — both checked.
    { file: "components/swimmers/SwimmerMeetsTab.tsx", component: "EventList" },
  ];

  test.each(COMPOSED)("$component draws no card of its own", ({ file, component }) => {
    const source = read(file);
    const start = source.indexOf(`function ${component}(`);
    expect(start).toBeGreaterThan(-1);
    // Up to the next top-level `function`, which is this one's whole body.
    const rest = source.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    const body = end === -1 ? rest : rest.slice(0, end);

    const rootPanel = classStrings(body)
      .slice(0, 1)
      .filter((c) => /\bborder-gray-200\b/.test(c.value) && /\brounded-/.test(c.value));
    expect({ component, rootPanel: rootPanel.map((c) => c.value) }).toEqual({
      component,
      rootPanel: [],
    });
  });
});
