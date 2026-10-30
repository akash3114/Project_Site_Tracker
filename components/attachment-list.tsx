"use client";

import { useId, useRef, useState } from "react";

import { fmtDateTimeIST } from "@/lib/format";

export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  activityId?: string | null;
  uploadedBy?: { id: string; name: string } | null;
  createdAt?: string | null;
};

export type UploadedAttachment = AttachmentItem;

/** Mirrors ATTACHMENT_MIME_TYPES / ATTACHMENT_MAX_BYTES in lib/validations. */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side mirror of the server rules, so users get instant feedback. */
export function validateAttachment(file: File): string | null {
  if (file.size > MAX_BYTES) {
    return `${file.name} is larger than 10 MB.`;
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return "Only JPG, PNG, WebP or PDF files are allowed.";
  }
  return null;
}

function readError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

/**
 * Upload one file to POST /api/tasks/:id/attachments with real progress.
 * `silent` skips the ATTACHMENT feed row so the file can be linked to the
 * comment that is posted straight after (attachmentIds on the comment).
 */
export function uploadAttachment(
  taskId: string,
  file: File,
  options: { silent?: boolean; onProgress?: (percent: number) => void } = {},
): Promise<UploadedAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/tasks/${encodeURIComponent(taskId)}/attachments${
        options.silent ? "?silent=1" : ""
      }`,
    );
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText) as unknown;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        options.onProgress?.(100);
        resolve(payload as UploadedAttachment);
        return;
      }
      reject(
        new Error(
          readError(payload, `Upload failed (${xhr.status || "network"})`),
        ),
      );
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

function attachmentKind(attachment: AttachmentItem): string {
  if (attachment.mimeType === "application/pdf") return "PDF";
  if (attachment.mimeType.startsWith("image/")) return "IMG";
  const ext = attachment.fileName.split(".").pop();
  return ext ? ext.toUpperCase().slice(0, 4) : "FILE";
}

/**
 * File picker + upload progress. Used for task-level attachments (visible
 * feed row) and inside the comment composer (silent; linked to the comment).
 */
export function AttachmentUploader({
  taskId,
  silent = false,
  onUploaded,
  onError,
  onBusyChange,
  label = "Attach a file",
  disabled = false,
}: {
  taskId: string;
  silent?: boolean;
  onUploaded: (attachment: UploadedAttachment) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const invalid = validateAttachment(file);
    if (invalid) {
      onError(invalid);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    onBusyChange?.(true);
    setProgress(0);
    try {
      const uploaded = await uploadAttachment(taskId, file, {
        silent,
        onProgress: setProgress,
      });
      onUploaded(uploaded);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      onBusyChange?.(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        aria-label={label}
        aria-describedby={hintId}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        aria-describedby={hintId}
        className="min-h-[44px] rounded-[6px] border border-dashed border-[#CDD6CE] bg-white px-3 font-body text-sm text-[#1C2824] pst-transition hover:border-[#173B33] disabled:opacity-60"
      >
        {uploading ? `Uploading… ${progress}%` : label}
      </button>
      {uploading ? (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#E4E9E4]"
        >
          <span
            className="block h-full bg-[#173B33] pst-transition"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <p id={hintId} className="font-mono text-[11px] text-[#66756D]">
        JPG, PNG, WebP or PDF · up to 10 MB
      </p>
    </div>
  );
}

/** Read-only attachment list with optional delete for uploader/admin. */
export function AttachmentList({
  attachments,
  currentUserId,
  canDeleteAny = false,
  onChanged,
  onError,
  emptyText = "No attachments yet.",
}: {
  attachments: AttachmentItem[];
  currentUserId?: string | null;
  /** permissions.canAdminDelete (Admin). Uploaders may always delete their own. */
  canDeleteAny?: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
  emptyText?: string;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(attachment: AttachmentItem) {
    if (!window.confirm(`Delete “${attachment.fileName}”?`)) return;
    setDeleting(attachment.id);
    try {
      const res = await fetch(
        `/api/attachments/${encodeURIComponent(attachment.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        onError(readError(payload, `Delete failed (${res.status})`));
        return;
      }
      onChanged();
    } catch {
      onError("Network error deleting attachment.");
    } finally {
      setDeleting(null);
    }
  }

  if (attachments.length === 0) {
    return (
      <p className="rounded-[6px] bg-[#FAFBFC] px-3 py-2 font-body text-sm text-[#586760]">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Task attachments">
      {attachments.map((attachment) => {
        const canDelete =
          canDeleteAny ||
          (Boolean(currentUserId) &&
            attachment.uploadedBy?.id === currentUserId);
        return (
          <li
            key={attachment.id}
            className="flex flex-wrap items-center gap-2 rounded-[6px] border border-[#CDD6CE] bg-white p-2"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFBFC] font-mono text-[10px] font-medium text-[#586760]"
            >
              {attachmentKind(attachment)}
            </span>
            <span className="min-w-0 flex-1">
              <a
                href={`/api/attachments/${encodeURIComponent(attachment.id)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${attachment.fileName}`}
                className="block truncate font-body text-sm text-[#173B33] underline-offset-2 hover:underline"
              >
                {attachment.fileName}
              </a>
              <span className="block font-mono text-[11px] text-[#66756D]">
                {formatBytes(attachment.sizeBytes)}
                {attachment.uploadedBy
                  ? ` · ${attachment.uploadedBy.name}`
                  : ""}
                {attachment.createdAt
                  ? ` · ${fmtDateTimeIST(attachment.createdAt)}`
                  : ""}
              </span>
            </span>
            {canDelete ? (
              <button
                type="button"
                onClick={() => void remove(attachment)}
                disabled={deleting === attachment.id}
                aria-label={`Delete ${attachment.fileName}`}
                className="min-h-[44px] rounded-[6px] border border-[#8F2824]/40 px-2 font-body text-xs text-[#8F2824] pst-transition hover:bg-[#FBE8E4] disabled:opacity-60"
              >
                {deleting === attachment.id ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
