"use client";

import { useId, useState } from "react";

import {
  AttachmentUploader,
  formatBytes,
  type UploadedAttachment,
} from "./attachment-list";

/**
 * Comment composer pinned to the drawer bottom. Comments (and their photos /
 * PDFs) stay available on COMPLETED tasks; the API allows that by design.
 *
 * Files upload first with `?silent=1` so no ATTACHMENT feed row is created,
 * then the comment is posted with `attachmentIds` to link them to the bubble.
 */
export function CommentComposer({
  taskId,
  canComment = true,
  onPosted,
  onError,
}: {
  taskId: string;
  canComment?: boolean;
  onPosted: () => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<UploadedAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textId = useId();

  function addUploaded(attachment: UploadedAttachment) {
    setLocalError(null);
    setPending((rows) =>
      rows.some((row) => row.id === attachment.id)
        ? rows
        : [...rows, attachment],
    );
  }

  async function removePending(attachment: UploadedAttachment) {
    setPending((rows) => rows.filter((row) => row.id !== attachment.id));
    try {
      // The upload was silent, so an unlinked file would otherwise linger.
      await fetch(`/api/attachments/${encodeURIComponent(attachment.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      // Best effort: the file remains attached to the task.
    }
  }

  async function post() {
    const value = text.trim();
    if ((!value && pending.length === 0) || saving || uploading) return;
    setSaving(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          text: value,
          ...(pending.length > 0
            ? { attachmentIds: pending.map((row) => row.id) }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const message =
          data &&
          typeof data === "object" &&
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Comment failed (${res.status})`;
        onError(message);
        return;
      }
      setText("");
      setPending([]);
      onPosted();
    } catch {
      onError("Network error posting comment");
    } finally {
      setSaving(false);
    }
  }

  if (!canComment) {
    return (
      <p className="border-t border-[#CDD6CE] pt-3 font-body text-sm text-[#586760]">
        You cannot comment on this task.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[#CDD6CE] bg-white pt-3">
      <label htmlFor={textId} className="sr-only">
        Add a comment
      </label>
      <textarea
        id={textId}
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Add a comment…"
        className="min-h-[44px] w-full rounded-[6px] border border-[#CDD6CE] bg-[#FAFBFC] px-3 py-2 font-body text-sm text-[#1C2824] placeholder:text-[#66756D]"
      />

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Files to attach">
          {pending.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-[6px] border border-[#CDD6CE] bg-[#FAFBFC] px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate font-body text-xs text-[#1C2824]">
                {attachment.fileName}
              </span>
              <span className="font-mono text-[11px] text-[#66756D]">
                {formatBytes(attachment.sizeBytes)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.fileName}`}
                onClick={() => void removePending(attachment)}
                className="min-h-[44px] min-w-[44px] rounded-[6px] font-body text-xs text-[#586760] pst-transition hover:text-[#8F2824]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {localError ? (
        <p role="alert" className="font-body text-xs text-[#8F2824]">
          {localError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[9rem] flex-1">
          <AttachmentUploader
            taskId={taskId}
            silent
            label="Add photo / PDF"
            disabled={saving}
            onUploaded={addUploaded}
            onError={(message) => setLocalError(message)}
            onBusyChange={setUploading}
          />
        </div>
        <button
          type="button"
          onClick={() => void post()}
          disabled={saving || uploading || (text.trim().length === 0 && pending.length === 0)}
          className="min-h-[44px] flex-1 rounded-[6px] bg-[#173B33] px-4 font-body text-sm font-semibold text-white pst-transition hover:brightness-110 disabled:opacity-60 sm:flex-none"
        >
          {saving ? "Posting…" : "Post comment"}
        </button>
      </div>
      {pending.length > 0 && text.trim().length === 0 ? (
        <p className="font-mono text-[11px] text-[#66756D]">
          Files only — the comment will post with the photo/PDF and no note.
        </p>
      ) : null}
    </div>
  );
}
