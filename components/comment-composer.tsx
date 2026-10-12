"use client";

import { useState } from "react";

/** Comment composer, pinned to the drawer bottom. Comments are allowed even on COMPLETED tasks (API 201). */
export function CommentComposer({
  taskId,
  onPosted,
  onError,
}: {
  taskId: string;
  onPosted: () => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function post() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(
          (data as { error?: string } | null)?.error ??
            `Comment failed (${res.status})`,
        );
        return;
      }
      setText("");
      onPosted();
    } catch {
      onError("Network error posting comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sticky bottom-0 border-t border-[rgba(23,34,44,0.08)] bg-white pt-3">
      <label htmlFor="task-comment" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="task-comment"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment…"
        className="min-h-[44px] w-full rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-[#FAFBFC] px-3 py-2 font-body text-sm text-[#17222C] placeholder:text-[#8A97A3]"
      />
      <button
        type="button"
        onClick={post}
        disabled={saving || text.trim().length === 0}
        className="mt-2 min-h-[44px] w-full rounded-[6px] bg-[#5E6AD2] px-4 font-body text-sm font-semibold text-white pst-transition hover:brightness-110 disabled:opacity-60"
      >
        {saving ? "Posting…" : "Post comment"}
      </button>
    </div>
  );
}
