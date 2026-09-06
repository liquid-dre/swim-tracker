"use client";

// lib/pdfText.ts — turn a PDF file into the plain text `parseMeetProgramme`
// reads. The ONLY browser-coupled part of the meet import; everything after it
// is pure (lib/meetImport.ts), which is what the parser tests exercise.
//
// Why this is not two lines of pdf.js: a PDF has no notion of a "line". The HAS
// programme stores `Mixed 100 Freestyle` as SEVEN separate positioned fragments
// (`Mi`, `x`, `ed 100 `, `F`, `r`, `eest`, `y`, `le`) because kerning pairs are
// emitted individually. Concatenating pdf.js's items in document order gives
// mangled words; the text only reassembles once fragments are grouped by their
// baseline and ordered left-to-right within it. That is what this does.
//
// pdf.js is loaded LAZILY — `await import(...)` inside the call — so ~350 KB of
// parser never enters the bundle of a coach who only ever reads the calendar.

/** Fragments closer than this share a baseline (PDF units ≈ points). */
const LINE_TOLERANCE = 3;

/** A gap wider than this between fragments is a real space, not kerning. */
const SPACE_GAP = 1.2;

/** Refuse anything implausible before handing it to the parser. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 20;

type Fragment = { x: number; y: number; width: number; text: string };

/** What was read, and — the point of this shape — what was NOT. */
export type PdfText = {
  text: string;
  pagesRead: number;
  totalPages: number;
};

/**
 * Extract a PDF's text with layout preserved as newlines.
 *
 * Throws a human-readable message on anything the caller should show verbatim
 * (not a PDF, encrypted, image-only). A scanned programme yields no text at
 * all — we say so rather than returning an empty draft, because "we could not
 * read this file" and "this file has no events" are different facts.
 *
 * The page cap is REPORTED, never silent. A HY-TEK "Meet Program" (as opposed
 * to an event list) can run well past 20 pages, and returning its first 20 as
 * though they were the whole programme would be the one failure this module
 * exists to prevent — the caller surfaces `pagesRead < totalPages` as a warning.
 */
export async function extractPdfText(file: File): Promise<PdfText> {
  if (file.size > MAX_BYTES) {
    throw new Error("That PDF is larger than 8 MB — export just the event list.");
  }

  const pdfjs = await import("pdfjs-dist");
  // The worker ships beside the library; resolving it through the bundler keeps
  // it on our own origin (no CDN, and no CSP exception to justify).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());

  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch {
    throw new Error("That file could not be opened as a PDF.");
  }

  try {
    const pages: string[] = [];
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const fragments: Fragment[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str === "") continue;
        // transform = [a, b, c, d, e, f]; e/f are the device x/y of the run.
        const [, , , , x, y] = item.transform as number[];
        fragments.push({ x, y, width: item.width ?? 0, text: item.str });
      }
      pages.push(joinFragments(fragments));
      page.cleanup();
    }
    const text = pages.join("\n");
    if (text.trim() === "") {
      throw new Error(
        "No text in that PDF — it looks scanned. Paste the event list instead.",
      );
    }
    return { text, pagesRead: pageCount, totalPages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

/**
 * Fragments → lines. Group by baseline (y, descending — PDF y grows upward),
 * then order each line left-to-right and rejoin, inserting a space only where
 * the horizontal gap is wider than kerning.
 */
export function joinFragments(fragments: ReadonlyArray<Fragment>): string {
  const lines: { y: number; parts: Fragment[] }[] = [];

  for (const fragment of fragments) {
    const line = lines.find((l) => Math.abs(l.y - fragment.y) <= LINE_TOLERANCE);
    if (line) {
      line.parts.push(fragment);
    } else {
      lines.push({ y: fragment.y, parts: [fragment] });
    }
  }

  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((line) => {
      const parts = [...line.parts].sort((a, b) => a.x - b.x);
      let out = "";
      let cursor: number | null = null;
      for (const part of parts) {
        if (cursor !== null && part.x - cursor > SPACE_GAP && !/^\s/.test(part.text)) {
          out += " ";
        }
        out += part.text;
        cursor = part.x + part.width;
      }
      return out.replace(/\s+/g, " ").trim();
    })
    .filter((line) => line !== "")
    .join("\n");
}
