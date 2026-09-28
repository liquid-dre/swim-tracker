/*
  Meet summaries (a coach's post-meet report) — the pure rules shared by the
  upload control and `convex/meetReports.ts`, so the browser refuses exactly
  what the server would.
*/

/** Big enough for a scanned multi-page report; small enough to open on a phone. */
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

/** A meet gets a report, maybe a revision or two — not an archive. */
export const MAX_REPORTS_PER_MEET = 20;

/** What a coach writes a report in. The `accept` list mirrors this. */
export const REPORT_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const REPORT_ACCEPT =
  ".pdf,.doc,.docx,.odt,.txt,.md,.png,.jpg,.jpeg,.webp," +
  REPORT_CONTENT_TYPES.join(",");

export function isAllowedReportType(contentType: string): boolean {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return (REPORT_CONTENT_TYPES as readonly string[]).includes(base);
}

/**
 * The content type to upload a file with. Browsers leave `File.type` empty for
 * some extensions (`.md` everywhere, `.docx` on some Android builds), so the
 * extension decides when the browser did not.
 */
export function reportContentType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return byExt[ext] ?? "application/octet-stream";
}

/** A file name as the list shows it: no path, bounded, never empty. */
export function cleanReportFileName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  const bounded = base.length > 120 ? `${base.slice(0, 117)}...` : base;
  return bounded || "Meet summary";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
