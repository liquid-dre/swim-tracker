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

/*
  `components/charts/` is the bklit UI registry, vendored per CLAUDE.md — code
  this project did not author and does not restyle. It carries the one
  `backdrop-blur-md` in the tree (a chart tooltip panel). Excluded by
  PROVENANCE rather than listed file by file, so the carve-out is one stated
  decision instead of a growing list of individual passes.
*/
const VENDORED = /^components[/\\]charts[/\\]/;
const OURS: string[] = FILES.filter((f) => !VENDORED.test(f));

function read(f: string): string {
  return readFileSync(f, "utf8");
}

/**
 * Every class string in a file, with the line of the JSX TAG that owns it.
 *
 * Two things the first version of this got wrong, both of which made the guard
 * look like it was working while it read almost nothing:
 *
 *  - It matched only `className="…"`. 183 of this repo's 2,501 className
 *    attributes are `className={cn(…)}`, including every shared primitive and
 *    the one live `backdrop-blur-md` in the tree, so 7.3% of the codebase —
 *    and two of this file's own three listed exceptions — were invisible. It
 *    now collects every string literal inside a balanced `{…}`.
 *
 *  - It reported the line the `className` sits on. Prettier puts a container's
 *    className on its own line as soon as the tag carries a second attribute,
 *    which shifts its apparent indent to the attribute level and made 19 of
 *    the repo's 121 cards immune to the nesting check in both directions. The
 *    owning tag is found by scanning back to the nearest `<Tag`.
 */
function classStrings(source: string): { at: number; value: string }[] {
  const lines = source.split("\n");
  const out: { at: number; value: string }[] = [];

  /** The line of the `<Tag` that opens the element this attribute belongs to. */
  function ownerLine(charIndex: number): number {
    const upto = source.slice(0, charIndex).split("\n");
    for (let i = upto.length - 1; i >= 0; i -= 1) {
      if (/<[A-Za-z]/.test(lines[i] ?? "")) return i + 1;
    }
    return upto.length;
  }

  const re = /className=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const at = ownerLine(m.index);
    let i = m.index + m[0].length;

    if (source[i] === "{") {
      // Walk the balanced braces, then take every string literal inside.
      let depth = 0;
      const start = i;
      for (; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const expr = source.slice(start, i + 1);
      for (const lit of expr.match(/["'`]([^"'`]*)["'`]/g) ?? []) {
        out.push({ at, value: lit.slice(1, -1) });
      }
    } else {
      const lit = /^["'`]([^"'`]*)["'`]/.exec(source.slice(i));
      if (lit !== null) out.push({ at, value: lit[1] });
    }
  }
  return out;
}

/**
 * Every string literal in a file that looks like a Tailwind class string.
 *
 * The nesting check above needs attributes, because it needs the owning tag.
 * The BAN checks do not, and scoping them to attributes missed the one live
 * `backdrop-blur-md` in the tree: it lives in `const panelClassName = cn(…)`
 * and reaches `className` through a variable, which no attribute scan can
 * follow. A ban is about what ships, not about how it got there.
 */
function classLiterals(source: string): { at: number; value: string }[] {
  const out: { at: number; value: string }[] = [];
  /*
    Comments blanked first, line lengths preserved so the reported line stays
    right. A comment naming a class does not ship it — and these files discuss
    their own class names constantly, in backticks, which this scan would
    otherwise read as string literals. The first version of this flagged a
    DateField comment explaining why `lg:size-7` had been REMOVED.
  */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
  const re = /["'`]([^"'`\n]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    // A class string, not prose: hyphenated tokens and no sentence spacing.
    if (!/^[\w\-:/[\]().,%\s]+$/.test(m[1])) continue;
    if (!/[a-z]+-[a-z0-9]/.test(m[1])) continue;
    out.push({ at: code.slice(0, m.index).split("\n").length, value: m[1] });
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
          // Blank lines, and lines that are pure JSX punctuation, are not a
          // dedent: a multi-attribute tag closes its own `>` back at the tag's
          // indent, which made every card written that way immune.
          .filter((l) => l.trim() !== "" && !/^[>/{}(),\s]+$/.test(l.trim()))
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
  const ALLOWED: Record<string, Record<string, RegExp>> = {
    // Per BAN, not per file. A single file-wide regex exempted whatever it
    // matched from ALL THREE checks — so one argued gradient in Tabs.tsx would
    // have licensed a blur and a pure black in the same class string. That is
    // the same widening that made LogScreen's dead `bg-bg/` alternative worth
    // removing; it deserved fixing in the mechanism, not just the entry.
    "components/ui/Tabs.tsx": { gradient: /bg-gradient-to-[rl]\b/ },
    "components/log/LogScreen.tsx": { glassmorphism: /backdrop-blur/ },
    "components/ui/sheet.tsx": { "pure black": /bg-black\/50/ },
    "components/ui/ConfirmDialog.tsx": { "pure black": /bg-black\/50/ },
  };

  const BANNED = [
    { name: "gradient", re: /\bbg-gradient-to-\w+\b/ },
    { name: "glassmorphism", re: /\bbackdrop-blur\b/ },
    { name: "pure black", re: /\b(?:text|bg)-black\b/ },
  ];

  test.each(OURS)("%s uses none of them unargued", (file: string) => {
    const source = read(file);
    const allow = ALLOWED[file] ?? {};
    const hits = BANNED.flatMap(({ name, re }) =>
      classLiterals(source)
        .filter((c) => re.test(c.value) && !allow[name]?.test(c.value))
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

    // The WHOLE body, not its first class string: that was the early-return
    // empty state, so restoring the border on the list below it passed green.
    const rootPanel = classStrings(body).filter(
      (c) => /\bborder-gray-200\b/.test(c.value) && /\brounded-/.test(c.value),
    );
    expect({ component, rootPanel: rootPanel.map((c) => c.value) }).toEqual({
      component,
      rootPanel: [],
    });
  });
});

describe("the 44px floor is restored wherever `lg:` releases it", () => {
  /*
    `globals.css` states the rule this branch exists for: an iPad in landscape
    is a COARSE pointer over 1024px, so it clears `lg` and takes whatever
    compact size `lg:` set. Every `lg:h-*` / `lg:size-*` therefore needs a
    `touch:` partner putting 44px back.

    The branch introduced the variant, wrote the rule down, and swept the
    shared primitives — leaving eight controls behind, one of them at 28px
    beside 44px siblings. That is the rule outliving its own sweep, which is
    exactly what a test is for. This one reads the class strings, so a ninth
    cannot be added quietly.
  */
  const RELEASES = /\blg:(?:h|size)-(\d+)\b/;

  test.each(OURS)("%s restores every size it releases", (file: string) => {
    const unrestored = classLiterals(read(file))
      .filter((c) => RELEASES.test(c.value) && !/\btouch:(?:h|size|min-h)-/.test(c.value))
      .map((c) => `line ${c.at}: ${RELEASES.exec(c.value)?.[0]}`);
    expect({ file, unrestored }).toEqual({ file, unrestored: [] });
  });
});
