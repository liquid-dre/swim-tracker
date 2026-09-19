import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/*
  DESIGN.md's structural rules, enforced.

  The colour half is checked by `lib/contrast.test.ts`, which has caught real
  drift repeatedly. The rest — no card-in-card, no gradients, no
  glassmorphism, no pure black, and the 44px floor restored wherever `lg:`
  releases it — was enforced by nothing, and a review found violations in files
  that had simply never been measured against a rule the project states three
  times.

  The first version of this file was written, its scope asserted, and then
  tested only against the shapes it had been designed for. A review walked past
  it four ways: `.ts` files were not read, `app/` was not read, any class string
  containing `&` or `!` was skipped by a "looks like a class string" filter, and
  a card whose classes arrived in two literals was invisible. Every count in its
  comments was also made up.

  So: no counts here that a test does not compute, the scope is stated as what
  is READ rather than as what is caught, and the known limits are listed at the
  bottom rather than left for the next review to find.
*/

/** Every source file whose class strings ship — `.ts` too, and `app/` too. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return [p];
  });
}

/*
  `components/charts/` is the bklit UI registry, vendored per CLAUDE.md — code
  this project did not author and does not restyle. It holds the only
  `backdrop-blur-md` in the tree, on a chart tooltip panel. Excluded by
  PROVENANCE, so the carve-out is one stated decision rather than a growing
  list of individual passes.
*/
const VENDORED = /^components[/\\]charts[/\\]/;
const ALL: string[] = [...walk("components"), ...walk("app")].sort();
const OURS: string[] = ALL.filter((f) => !VENDORED.test(f));

function read(f: string): string {
  return readFileSync(f, "utf8");
}

/**
 * The source with comments blanked, line lengths preserved.
 *
 * A class named in a comment does not ship, and these files discuss their own
 * class names constantly, in backticks — which a literal scan reads as strings.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
}

/**
 * Class strings grouped by the EXPRESSION that builds them, joined.
 *
 * `cn("rounded-xl border", "border-gray-200 shadow-theme-sm")` is one card, and
 * `"h-11 lg:h-7" + " touch:h-11"` is one restored control — reading literals
 * one at a time got both wrong, in opposite directions: it missed the split
 * card and it failed the correctly-restored control.
 *
 * A group is a `className={…}` expression, or a `;`-delimited statement
 * elsewhere (which is how `menu-styles.ts` and `callout.ts` build theirs).
 */
function styleGroups(source: string): { at: number; value: string }[] {
  const src = code(source);
  const lines = src.split("\n");
  const groups: { at: number; value: string }[] = [];
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;

  /** The line of the `<Tag` opening the element an attribute belongs to. */
  function ownerLine(charIndex: number): number {
    const upto = lineOf(charIndex);
    for (let i = upto - 1; i >= 0; i -= 1) {
      if (/<[A-Za-z]/.test(lines[i] ?? "")) return i + 1;
    }
    return upto;
  }

  const literals = (text: string) =>
    (text.match(/["'`]([^"'`\n]*)["'`]/g) ?? [])
      .map((l) => l.slice(1, -1))
      .join(" ");

  const covered: [number, number][] = [];
  const re = /className=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    const start = i;
    if (src[i] === "{") {
      let depth = 0;
      for (; i < src.length; i += 1) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
    } else {
      const lit = /^["'`][^"'`\n]*["'`]/.exec(src.slice(i));
      i = lit === null ? i : i + lit[0].length - 1;
    }
    covered.push([start, i]);
    groups.push({ at: ownerLine(m.index), value: literals(src.slice(start, i + 1)) });
  }

  // Everything else, per statement — where a `.ts` styles module lives.
  let cursor = 0;
  for (const chunk of src.split(";")) {
    const start = cursor;
    cursor += chunk.length + 1;
    if (covered.some(([a, b]) => a >= start && b <= cursor)) continue;
    const value = literals(chunk);
    if (value !== "") groups.push({ at: lineOf(start), value });
  }
  return groups;
}

describe("no card-in-card (DESIGN.md: one card, sections divided by a hairline)", () => {
  /*
    A card is the house spelling: a radius, a gray-200 border and a shadow.
    Nesting is judged by the indentation of the OWNING TAG — not of the
    `className`, which prettier moves onto its own line as soon as a tag takes
    a second attribute, and which made cards written that way immune.
  */
  const isCard = (c: string) =>
    /\brounded-(?:xl|2xl)\b/.test(c) &&
    /\bborder-gray-200\b/.test(c) &&
    /\bshadow-theme-/.test(c);

  /*
    The INNER test drops the shadow: DESIGN.md bans a second bordered, rounded
    panel inside a card, and a shadowless `rounded-xl border border-gray-200`
    list is exactly that second panel.
  */
  const isPanel = (c: string) =>
    /\brounded-(?:xl|2xl)\b/.test(c) &&
    /\bborder-gray-200\b/.test(c) &&
    // Not a CONTROL. `rounded-lg` is the control radius in this system (cards
    // are 2xl), and a fixed height is what a button or field has and a panel
    // does not — without this, every bordered toggle inside a card read as a
    // nested panel. A previous review predicted this exact false positive
    // would surface once the scan could see concatenated class strings, and
    // it did, on the first run.
    !/\b(?:h|size)-\d/.test(c);

  test.each(OURS)("%s nests no card inside another", (file: string) => {
    const source = read(file);
    const lines = code(source).split("\n");
    const cards = styleGroups(source)
      .filter((c) => isCard(c.value) || isPanel(c.value))
      .map((c) => ({
        line: c.at,
        value: c.value,
        indent: (lines[c.at - 1] ?? "").search(/\S/),
      }));

    const nested: string[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      if (!isCard(cards[i].value)) continue; // only a card can be a container
      for (let j = i + 1; j < cards.length; j += 1) {
        if (cards[j].indent <= cards[i].indent) break;
        const between = lines
          .slice(cards[i].line, cards[j].line - 1)
          // Blank lines and pure JSX punctuation are not a dedent: a
          // multi-attribute tag closes its own `>` back at the tag's indent.
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
  const BANNED = [
    { name: "gradient", re: /\bbg-gradient-to-\w+\b/ },
    { name: "glassmorphism", re: /\bbackdrop-blur\b/ },
    { name: "pure black", re: /\b(?:text|bg)-black\b/ },
  ];

  /*
    Per BAN, not per file: a single file-wide regex exempted whatever it
    matched from ALL THREE checks, so one argued gradient would have licensed
    a blur and a pure black in the same class string.

    Four exceptions, each with its reason:
  */
  const ALLOWED: Record<string, Record<string, RegExp>> = {
    // A scroll-edge fade TO TRANSPARENT over the canvas: an affordance saying
    // "there is more to the right", carrying no colour of its own.
    "components/ui/Tabs.tsx": { gradient: /bg-gradient-to-[rl]\b/ },
    // The sticky poolside action bar, which must stay legible over whatever
    // scrolls beneath it.
    "components/log/LogScreen.tsx": { glassmorphism: /backdrop-blur/ },
    // Radix's own modal scrim, vendored, in the two components that use it.
    "components/ui/sheet.tsx": { "pure black": /bg-black\/50/ },
    "components/ui/ConfirmDialog.tsx": { "pure black": /bg-black\/50/ },
  };

  test.each(OURS)("%s uses none of them unargued", (file: string) => {
    // EVERY string literal, not only those a "looks like a class string"
    // filter admitted — that filter rejected any string containing `&` or
    // `!`, which is the arbitrary-variant spelling this codebase uses
    // constantly, and it let a blur through simply for having `[&_svg]:` in
    // the same string.
    const all = (code(read(file)).match(/["'`][^"'`\n]*["'`]/g) ?? []).map((l) => ({
      value: l.slice(1, -1),
      at: 0,
    }));
    const allow = ALLOWED[file] ?? {};
    const hits = BANNED.flatMap(({ name, re }) =>
      all
        .filter((c) => re.test(c.value) && !allow[name]?.test(c.value))
        .map(() => name),
    );
    expect({ file, hits }).toEqual({ file, hits: [] });
  });
});

describe("panels that render inside a card through a component boundary", () => {
  /*
    The lexical check cannot see these, so each is named. A component listed
    here is rendered inside a card by at least one call site — CHECKED at that
    call site, never inferred from the name; an earlier draft carried one that
    turned out to be a top-level card in both of its — and must therefore
    carry no border or radius of its own, dividing with a hairline instead.
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
    const rest = source.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    const body = end === -1 ? rest : rest.slice(0, end);

    // The WHOLE body, not its first class string: that was the early-return
    // empty state, so restoring the border on the list below it passed green.
    const rootPanel = styleGroups(body)
      .filter((c) => /\bborder-gray-200\b/.test(c.value) && /\brounded-/.test(c.value))
      .map((c) => c.value);
    expect({ component, rootPanel }).toEqual({ component, rootPanel: [] });
  });
});

describe("the 44px floor is restored wherever `lg:` releases it", () => {
  /*
    `globals.css` states the rule this branch exists for: an iPad in landscape
    is a COARSE pointer over 1024px, so it clears `lg` and takes whatever
    compact size `lg:` set. Every release therefore needs a `touch:` partner.

    `min-h` is in the pattern because `min-h-11 lg:min-h-0 touch:min-h-11` is
    the floor idiom globals.css documents — and the first version of this
    check, which matched only `h-` and `size-`, missed that whole family.
  */
  /*
    A NUMERIC release only, and only of a height. `lg:h-auto` on a layout
    column is not a control being compacted, and a column's `lg:w-[52%]` is
    not a touch target — the first version of this pattern matched both and
    reported a marketing page's two-pane split as an unrestored control.
  */
  const RELEASES = /\blg:(?:h|size|min-h)-\d/;
  const RESTORES = /\btouch:(?:h|size|min-h)-/;

  test.each(OURS)("%s restores every size it releases", (file: string) => {
    const unrestored = styleGroups(read(file))
      .filter((c) => RELEASES.test(c.value) && !RESTORES.test(c.value))
      .map((c) => `line ${c.at}: ${RELEASES.exec(c.value)?.[0]}`);
    expect({ file, unrestored }).toEqual({ file, unrestored: [] });
  });
});

/*
  KNOWN LIMITS, stated rather than left to be discovered.

  - A size built by interpolation (`` `h-11 lg:h-${n}` ``) cannot be read from
    source, and nothing here pretends to.
  - A class assembled across separate statements — built in one `const` and
    spread into another file — is grouped per statement, so the two halves are
    judged apart.
  - Card nesting is lexical plus the named list above; a panel reaching a card
    through a prop is invisible to both.
  - A control that is under 44px WITHOUT ever releasing at `lg:` is not a
    release and is not checked here. A repo-wide audit of those is a separate
    job from this rule.
*/
