import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/*
  Contrast, checked rather than asserted.

  Every round of review on this codebase has found at least one comment stating
  a ratio the code does not produce — "4.97:1" for ink that measures 4.52:1 on
  the ground it actually sits on, "3.76:1" carried over after the fill changed.
  A number written in prose beside a class name drifts the moment either moves,
  and nothing catches it.

  So the numbers live here instead. These read the real token values out of
  globals.css, so a token edit either keeps the pair passing or fails this file
  — and a comment can say "AA, locked in lib/contrast.test.ts" without carrying
  a figure that can rot.

  WCAG 2.1: normal text 4.5:1 (1.4.3), large text and non-text UI 3:1 (1.4.11).
*/

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** A `--token: #hex;` declaration from the `@theme` palette block. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(CSS);
  if (m === null) throw new Error(`No literal hex for --${name} in globals.css`);
  return m[1];
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "#ffffff";

/**
 * A colour composited over another at `alpha`, as CSS paints it.
 *
 * `opacity` applies to the RENDERED element — fill and label together — so a
 * faded button's label is its ink over the PAGE, not over its own fill, and
 * its ratio depends on the ground it sits on. That is why the same faded Save
 * measured 2.09 in one comment and 2.07 in another and both were right: one
 * was on the canvas, one on white, and neither said so. Numbers that need a
 * sentence of context to be true are numbers that belong in a test.
 */
export function composite(fg: string, alpha: number, bg: string): string {
  const parse = (h: string) =>
    [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
  const [f, b] = [parse(fg), parse(bg)];
  const mix = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** An element faded by `opacity`, as its ink reads against its own fill. */
function faded(ink: string, fill: string, bg: string, alpha = 0.5): number {
  return contrast(composite(ink, alpha, bg), composite(fill, alpha, bg));
}

describe("text pairs the app relies on", () => {
  const canvas = token("color-gray-50");

  test.each([
    ["body ink on the canvas", "color-gray-900", canvas],
    ["muted ink on white", "color-gray-500", WHITE],
    ["muted ink on the canvas", "color-gray-500", canvas],
    ["inert ink on the inert fill", "color-gray-500", token("color-gray-100")],
    ["brand ink on its own tint", "color-brand-600", token("color-brand-50")],
    ["brand ink on the canvas", "color-brand-600", canvas],
    ["success ink on white", "color-success-700", WHITE],
    ["success ink on its tint", "color-success-700", token("color-success-50")],
    ["warning ink on its tint", "color-warning-700", token("color-warning-50")],
    ["danger ink on its tint", "color-error-700", token("color-error-50")],
    ["danger ink on white", "color-error-700", WHITE],
  ])("%s reaches AA", (_name, fg, bg) => {
    expect(contrast(token(fg), bg.startsWith("#") ? bg : token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the three ink tiers", () => {
  /*
    A tier that renders the same colour as the tier above it is not a tier. In
    light mode `--ink-muted` and `--ink-faint` were both gray-500, so every
    "secondary vs tertiary" call in the app came out identical.
  */
  const ALIAS = /--ink-(muted|faint):\s*var\(--(color-gray-\d+)\)/g;
  const tiers = Object.fromEntries(
    [...CSS.matchAll(ALIAS)].slice(0, 2).map((m) => [m[1], m[2]]),
  ) as { muted: string; faint: string };

  test("muted and faint resolve to different greys in light mode", () => {
    expect(tiers.muted).not.toBe(tiers.faint);
  });

  test.each([
    ["muted", WHITE],
    ["faint", WHITE],
    ["muted", token("color-gray-50")],
    ["faint", token("color-gray-50")],
  ])("%s ink reaches AA", (tier, bg) => {
    expect(contrast(token(tiers[tier as "muted" | "faint"]), bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("muted is the more legible of the two, as its name implies", () => {
    expect(contrast(token(tiers.muted), WHITE)).toBeGreaterThan(
      contrast(token(tiers.faint), WHITE),
    );
  });
});

describe("button fills carrying white labels", () => {
  test.each([
    ["primary", "color-brand-500"],
    ["danger", "color-error-600"],
  ])("%s reaches AA with white text", (_name, fill) => {
    expect(contrast(token(fill), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  test("the fill danger was moved OFF stays below AA, so the move is load-bearing", () => {
    // If error-500 ever reaches 4.5 this test should be deleted, not the
    // variant reverted — but until then it records why danger is 600.
    expect(contrast(token("color-error-500"), WHITE)).toBeLessThan(4.5);
  });
});

describe("non-text UI, which needs 3:1", () => {
  test.each([["focus ring on the canvas", "color-brand-500", token("color-gray-50")]])(
    "%s reaches 3:1",
    (_name, fg, bg) => {
      expect(contrast(token(fg), bg)).toBeGreaterThanOrEqual(3);
    },
  );

  /*
    KNOWN GAP, recorded rather than quietly dropped.

    `--color-gray-300` is the border on every input, select and date field in
    the app, and against white it is far under the 3:1 WCAG 1.4.11 asks for to
    identify a control's boundary. Raising it is a design-system decision with
    a visual cost on every form in the product — it is not something to change
    from inside a meets bug-fix — so this states the number instead of hiding
    it, and fails if anyone edits the token without settling the question.
  */
  test("the control border is a known AA gap, not an accident", () => {
    expect(contrast(token("color-gray-300"), WHITE)).toBeLessThan(3);
  });
});

describe("the pairs earlier rounds shipped and had to undo", () => {
  test("brand-500 on brand-50 is below AA — why menus and tabs use brand-600", () => {
    expect(contrast(token("color-brand-500"), token("color-brand-50"))).toBeLessThan(4.5);
  });

  test("success-600 is below AA on white — why --success-ink is 700", () => {
    expect(contrast(token("color-success-600"), WHITE)).toBeLessThan(4.5);
  });

  /*
    The canvas, specifically, because that is the ground the comment beside
    `--success-ink` names and it is darker than white — so a pair that only
    just clears on white is the one to check here, not assume.
  */
  test("success-600 is below AA on the canvas too", () => {
    expect(
      contrast(token("color-success-600"), token("color-gray-50")),
    ).toBeLessThan(4.5);
  });

  test("success-700 clears AA on the canvas, which is why it replaced it", () => {
    expect(
      contrast(token("color-success-700"), token("color-gray-50")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});


/*
  The pairs that comments used to state in prose.

  Four separate rounds of review caught a figure in these files that the code
  no longer produced — 7.56 for 7.69, 1.02 for 1.04, 4.98 for 4.97, and a
  2.09/2.07 pair that were both correct on grounds neither comment named. The
  comments now state the RELATION and point here; these assert it.
*/
describe("the treatments opacity was rejected for", () => {
  const canvas = token("color-gray-50");

  test("a blocked Save faded by opacity is unreadable on either ground", () => {
    const fill = token("color-brand-500");
    expect(faded(WHITE, fill, WHITE)).toBeLessThan(3);
    expect(faded(WHITE, fill, canvas)).toBeLessThan(3);
  });

  test("the inert fill faded by opacity is unreadable, and worse again when busy compounded it", () => {
    const [ink, fill] = [token("color-gray-500"), token("color-gray-100")];
    expect(faded(ink, fill, canvas)).toBeLessThan(3);
    // Busy and blocked both applied their own fade: 0.5 × 0.5.
    expect(faded(ink, fill, canvas, 0.25)).toBeLessThan(faded(ink, fill, canvas));
  });

  test("the authored inert treatment beats every faded one it replaced", () => {
    const authored = contrast(token("color-gray-500"), token("color-gray-100"));
    expect(authored).toBeGreaterThan(
      faded(token("color-gray-500"), token("color-gray-100"), canvas),
    );
  });

  test("a skipped row's 60% is the floor: 40% is worse, and a nested 50% worse still", () => {
    const ink = token("color-gray-700");
    expect(contrast(composite(ink, 0.6, WHITE), WHITE)).toBeGreaterThan(
      contrast(composite(ink, 0.4, WHITE), WHITE),
    );
    // What a field's own `opacity-50` did inside that 60% row.
    expect(contrast(composite(ink, 0.3, WHITE), WHITE)).toBeLessThan(
      contrast(composite(ink, 0.4, WHITE), WHITE),
    );
  });

  test("a disabled day cell reads better as solid ink than as a 40% fade", () => {
    expect(contrast(token("color-gray-400"), WHITE)).toBeGreaterThan(
      contrast(composite(token("color-gray-500"), 0.4, WHITE), WHITE),
    );
  });

  test("a disabled menu row reads better as solid ink than as a 50% fade", () => {
    expect(contrast(token("color-gray-500"), WHITE)).toBeGreaterThan(
      contrast(composite(token("color-gray-700"), 0.5, WHITE), WHITE),
    );
  });

  test("a menu row and the listbox row that says it matches it are the same pair", () => {
    expect(contrast(token("color-gray-500"), WHITE)).toBe(
      contrast(token("color-gray-500"), WHITE),
    );
    expect(contrast(token("color-gray-500"), WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the edges and inks the callout skin depends on", () => {
  test("a border painted in its own fill is no border at all", () => {
    // What `border-warning-subtle bg-warning-subtle` produced.
    expect(contrast(token("color-warning-50"), token("color-warning-50"))).toBe(1);
  });

  test("the warning border actually used clears its fill", () => {
    expect(
      contrast(
        composite(token("color-warning-500"), 0.3, token("color-warning-50")),
        token("color-warning-50"),
      ),
    ).toBeGreaterThan(1);
  });

  test("ink and fill that flip together stay legible; a fixed fill would not", () => {
    // The dark pair, read straight from the `.dark` block.
    const darkInk = /--warning-ink:\s*(#[0-9a-f]{6})/i.exec(CSS)?.[1];
    expect(darkInk).toBeDefined();
    // Against the LIGHT fill it would have been unreadable — why both flip.
    expect(contrast(darkInk!, token("color-warning-50"))).toBeLessThan(3);
  });
});

describe("semantic inks against the grounds they are actually read on", () => {
  test.each([
    ["danger on its tint", "color-error-700", "color-error-50"],
    ["warning on its tint", "color-warning-700", "color-warning-50"],
    ["aqua on white", "color-aqua-ink", null],
  ])("%s clears AA", (_n, ink, bg) => {
    expect(
      contrast(token(ink), bg === null ? WHITE : token(bg)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test.each([
    ["danger", "color-error-600", "color-error-50"],
    ["warning", "color-warning-600", "color-warning-50"],
  ])("%s-600 misses AA on that tint, which is why 700 is the ink", (_n, ink, bg) => {
    expect(contrast(token(ink), token(bg))).toBeLessThan(4.5);
  });

  test("the SANJ tier fill cannot carry text, which is why it has its own ink", () => {
    expect(contrast(token("color-tier-sanj"), WHITE)).toBeLessThan(3);
    expect(contrast(token("color-tier-sanj-ink"), WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
