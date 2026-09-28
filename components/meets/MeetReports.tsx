"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Lock, Trash2, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDateTime } from "@/lib/format";
import {
  MAX_REPORT_BYTES,
  REPORT_ACCEPT,
  formatFileSize,
  isAllowedReportType,
  reportContentType,
} from "@/lib/meetReports";
import { notify } from "@/lib/notify";

/*
  Meet summaries on the meet page — the coach's written report on how the club
  did (who swam, who won, who dropped time, talking points), uploaded as the
  file they wrote it in. Staff only: the meet page never mounts this for a
  viewer, and `convex/meetReports.ts` refuses a viewer regardless.

  Upload is Convex's two-step: a signed URL, a POST, then `addMeetReport`
  records it. The type and size checks here are a courtesy that saves a wasted
  upload; the server re-reads both from storage and is the one that decides.
*/

type Report = {
  _id: Id<"meetReports">;
  fileName: string;
  size: number;
  uploadedAt: number;
  uploadedByName: string | null;
  url: string | null;
};

export function MeetReports({ meetId }: { meetId: Id<"meets"> }) {
  const reports = useQuery(api.meetReports.listMeetReports, { meetId });
  const generateUploadUrl = useMutation(api.meetReports.generateUploadUrl);
  const addMeetReport = useMutation(api.meetReports.addMeetReport);
  const deleteMeetReport = useMutation(api.meetReports.deleteMeetReport);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<Report | null>(null);

  async function upload(file: File) {
    const contentType = reportContentType(file);
    if (!isAllowedReportType(contentType)) {
      notify.error("Upload a PDF, Word document, text file or image.");
      return;
    }
    if (file.size > MAX_REPORT_BYTES) {
      notify.error(`That file is over ${MAX_REPORT_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setUploading(true);
    try {
      await notify.promise(
        (async () => {
          const postUrl = await generateUploadUrl({});
          const res = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: file,
          });
          if (!res.ok) throw new Error("The upload failed. Try again.");
          const { storageId } = (await res.json()) as {
            storageId: Id<"_storage">;
          };
          const { error } = await addMeetReport({
            meetId,
            storageId,
            fileName: file.name,
          });
          // A refusal comes back rather than being thrown, so the server
          // could delete the rejected file in the same transaction.
          if (error !== null) throw new Error(error);
        })(),
        { loading: `Uploading ${file.name}…`, success: "Summary uploaded" },
      );
    } catch {
      // notify.promise has already shown the server's message.
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete() {
    if (!deleting) return;
    // ConfirmDialog shows a rejection itself, so only success is toasted.
    await deleteMeetReport({ reportId: deleting._id });
    notify.success("Summary removed");
  }

  return (
    <section
      aria-labelledby="meet-reports-heading"
      className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <h2
            id="meet-reports-heading"
            className="text-base font-semibold text-ink"
          >
            Meet summaries
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <Lock aria-hidden className="size-3.5 text-ink-faint" />
            Coaches in your club only. Swimmers and parents never see these.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={REPORT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {!uploading && <Upload className="size-4" aria-hidden />}
          Upload summary
        </Button>
      </header>

      {reports === undefined ? (
        <div className="px-5 py-4">
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        </div>
      ) : reports.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">
          No summary yet. Upload the gala report once results are in — a PDF,
          Word document or photo of it.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {reports.map((r) => (
            <li
              key={r._id}
              className="flex items-center gap-3 px-5 py-3"
            >
              <FileText
                aria-hidden
                className="size-5 shrink-0 text-ink-faint"
                strokeWidth={1.75}
              />
              <div className="min-w-0 flex-1">
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate rounded-sm text-sm font-medium text-brand-600 outline-none hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {r.fileName}
                  </a>
                ) : (
                  <span className="block truncate text-sm font-medium text-ink-muted">
                    {r.fileName} (file missing)
                  </span>
                )}
                <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                  {formatFileSize(r.size)} · {formatDateTime(r.uploadedAt)}
                  {r.uploadedByName && ` · ${r.uploadedByName}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${r.fileName}`}
                onClick={() => setDeleting(r)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this summary?"
        description={
          <>
            <span className="font-medium text-ink">{deleting?.fileName}</span>{" "}
            will be deleted for every coach in your club. This can&apos;t be
            undone.
          </>
        }
        confirmLabel="Remove summary"
        onConfirm={onDelete}
      />
    </section>
  );
}
