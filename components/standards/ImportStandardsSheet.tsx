"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { errorMessage, notify } from "@/lib/notify";
import { parseStandardsCsv, STANDARDS_CSV_COLUMNS } from "@/lib/swim";

type RejectLine = { line: number; reason: string };
type ImportResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  rejected: RejectLine[];
};

/*
  Bulk import from the coach's cleaned CSV (Step 9, §5.8, §11a). The CSV gives
  strings; `parseStandardsCsv` coerces distance/age to numbers and the two
  catch-all flags to REAL booleans (the "false"-is-truthy trap) before the
  mutation runs. Rows that can't be coerced, plus the server's own rejects
  (enum, coverage, unparseable time), all surface in one report by line number.
  Import is idempotent, so re-running a corrected file is safe.
*/
export function ImportStandardsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importStandards = useMutation(api.standards.importStandards);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parsed = useMemo(() => parseStandardsCsv(text), [text]);
  const hasInput = text.trim() !== "";

  function reset() {
    setText("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setResult(null);
  }

  async function onImport() {
    if (parsed.rows.length === 0 || importing) return;
    setImporting(true);
    try {
      const res = await importStandards({
        rows: parsed.rows.map((r) => r.row),
        replaceExisting: replace,
      });
      // Map the server's row-array indices back to CSV line numbers, then merge
      // with the client-side coercion rejects into one line-ordered report.
      const serverRejects: RejectLine[] = res.rejected.map((r) => ({
        line: parsed.rows[r.index]?.line ?? r.index + 1,
        reason: r.reason,
      }));
      const rejected = [...parsed.rejected, ...serverRejects].sort(
        (a, b) => a.line - b.line,
      );
      setResult({
        inserted: res.inserted,
        updated: res.updated,
        unchanged: res.unchanged,
        deleted: res.deleted,
        rejected,
      });
      const changed = res.inserted + res.updated;
      notify.success(
        rejected.length === 0
          ? `Imported ${res.acceptedCount} cut${res.acceptedCount === 1 ? "" : "s"}${
              res.deleted > 0 ? ` — replaced the previous ${res.deleted}` : ""
            }`
          : `Imported ${changed}, rejected ${rejected.length}`,
      );
    } catch (err) {
      notify.error(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const totalRejected = parsed.rejected.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>Import cuts from CSV</SheetTitle>
          <SheetDescription>
            Columns: {STANDARDS_CSV_COLUMNS.join(", ")}. Long course implied. Import
            is idempotent, so matching cuts are updated, not duplicated.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="sr-only"
              id="csv-file"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> Choose file
            </Button>
            {hasInput && (
              <button
                type="button"
                onClick={reset}
                className="rounded-md px-2 py-1 text-sm text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="csv-text" className="text-sm font-medium text-ink">
              …or paste CSV
            </label>
            <textarea
              id="csv-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              spellCheck={false}
              placeholder={"tier,gender,distance,stroke,age,isCatchAllYoung,isCatchAllOld,time\nLEVEL_2,F,100,FREE,10,true,false,1:15:00"}
              className="h-40 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] placeholder:text-ink-faint hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
            />
          </div>

          {/* Replace mode — the import becomes the COMPLETE set. This is how a
              new season's tables (or the first real import over sample data)
              retires every stale row instead of leaving it to keep resolving. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">Replace all existing cuts</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                Deletes every current cut first, so this file becomes the complete
                set. Use when loading a new season&rsquo;s tables or replacing
                sample data — old ages and catch-alls can&rsquo;t linger. Skipped
                automatically if the file imports nothing.
              </span>
            </span>
          </label>

          {/* Pre-import summary */}
          {hasInput && !result && (
            <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-sm">
              <p className="text-ink">
                <span className="font-medium tabular-nums">{parsed.rows.length}</span> row
                {parsed.rows.length === 1 ? "" : "s"} ready
                {totalRejected > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium tabular-nums text-warning-600">
                      {totalRejected}
                    </span>{" "}
                    malformed
                  </>
                )}
              </p>
              {totalRejected > 0 && (
                <RejectList rejects={parsed.rejected} className="mt-2" />
              )}
            </div>
          )}

          {/* Post-import result */}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2.5">
                {result.rejected.length === 0 ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success-600" />
                ) : (
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-500" />
                )}
                <div className="text-sm text-ink">
                  <p className="tabular-nums">
                    {result.inserted} new · {result.updated} updated · {result.unchanged}{" "}
                    unchanged
                    {result.deleted > 0 && ` · ${result.deleted} previous cuts replaced`}
                  </p>
                  <p className="mt-0.5 text-ink-muted">
                    {result.rejected.length === 0
                      ? "No rejected rows."
                      : `${result.rejected.length} row${result.rejected.length === 1 ? "" : "s"} rejected. Nothing was guessed.`}
                  </p>
                </div>
              </div>
              {result.rejected.length > 0 && <RejectList rejects={result.rejected} />}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={importing}
            disabled={parsed.rows.length === 0}
            onClick={onImport}
          >
            Import {parsed.rows.length > 0 ? parsed.rows.length : ""} row
            {parsed.rows.length === 1 ? "" : "s"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RejectList({
  rejects,
  className = "",
}: {
  rejects: RejectLine[];
  className?: string;
}) {
  return (
    <ul
      className={
        "max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white text-xs " +
        className
      }
    >
      {rejects.map((r, i) => (
        <li key={`${r.line}-${i}`} className="flex gap-2 px-3 py-1.5">
          <span className="shrink-0 font-medium tabular-nums text-ink-muted">
            line {r.line}
          </span>
          <span className="text-danger-ink">{r.reason}</span>
        </li>
      ))}
    </ul>
  );
}
