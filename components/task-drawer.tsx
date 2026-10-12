"use client";

import { useCallback, useEffect, useState } from "react";
import type { TaskStatus } from "@prisma/client";

import { fmtDate, isOverdue } from "@/lib/format";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";
import { PriorityBadge } from "./task-table";
import type { AssigneeOption } from "./task-filters";
import { StatusStepper } from "./status-stepper";
import { ActivityFeed, type FeedEvent } from "./activity-feed";
import { CommentComposer } from "./comment-composer";

type TaskDetail = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: string;
  dueDate?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  plaza?: { id: string; name: string; project?: { name?: string } } | null;
  assignee?: { id: string; name: string } | null;
};

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 50,
  BLOCKED: 50,
  COMPLETED: 100,
};

function toastClass(tone: "ok" | "err") {
  return tone === "ok"
    ? "border-green-500/40 bg-[#DCFCE7] text-[#166534]"
    : "border-red-500/40 bg-[#FEE2E2] text-[#991B1B]";
}

/**
 * Task drawer (Sheet). Fetches GET /api/tasks/:id, runs
 * status/assign/reopen mutations with refetch invalidation.
 * COMPLETED locks inputs; Reopen is always rendered (API enforces 403
 * for site users, surfaced as an error toast on denial).
 */
export function TaskDrawer({
  taskId,
  assignees,
  open,
  onClose,
  onChanged,
}: {
  taskId: string | null;
  assignees: AssigneeOption[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [reopenText, setReopenText] = useState("");

  const notify = useCallback((tone: "ok" | "err", msg: string) => {
    setNotice({ tone, msg });
    window.setTimeout(() => {
      setNotice((n) => (n?.msg === msg ? null : n));
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        notify("err", res.status === 403 ? "Access denied" : `Load failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setTask((data.task ?? data) as TaskDetail);
      setEvents((data.events ?? data.task?.events ?? []) as FeedEvent[]);
    } catch {
      notify("err", "Network error loading task");
    } finally {
      setLoading(false);
    }
  }, [taskId, notify]);

  useEffect(() => {
    if (open && taskId) {
      setTask(null);
      setEvents([]);
      void load();
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !taskId) return null;

  async function mutate(
    path: string,
    body: unknown,
    okMsg: string,
  ): Promise<boolean> {
    setPending(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify(
          "err",
          (data as { error?: string } | null)?.error ?? `Failed (${res.status})`,
        );
        return false;
      }
      notify("ok", okMsg);
      await load();
      onChanged();
      return true;
    } catch {
      notify("err", "Network error");
      return false;
    } finally {
      setPending(false);
    }
  }

  const completed = task?.status === "COMPLETED";
  const overdue = task ? isOverdue(task.dueDate, task.status) : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Task details"
      className="fixed inset-0 z-40 bg-black/40"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex min-h-[64px] items-center gap-3 border-b border-[rgba(23,34,44,0.08)] px-4">
          <h2 className="truncate font-display text-base font-semibold tracking-[-0.02em] text-[#17222C]">
            {task?.title ?? "Loading…"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task drawer"
            className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] font-body text-sm text-[#5C6F7E] pst-transition hover:bg-[#FAFBFC] hover:text-[#17222C]"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {notice ? (
            <p
              role={notice.tone === "err" ? "alert" : "status"}
              className={`rounded-[6px] border px-3 py-2 font-body text-sm ${toastClass(notice.tone)}`}
            >
              {notice.msg}
            </p>
          ) : null}

          {loading || !task ? (
            <p className="font-body text-sm text-[#5C6F7E]">Loading task…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <span
                  className={`font-mono text-xs ${overdue ? "font-medium text-[#DC2626]" : "text-[#5C6F7E]"}`}
                >
                  Due {fmtDate(task.dueDate)}
                  {overdue ? " · overdue" : ""}
                </span>
              </div>
              <ProgressBar value={STATUS_PROGRESS[task.status] ?? 0} />
              {task.description ? (
                <p className="font-body text-sm text-[#17222C]">
                  {task.description}
                </p>
              ) : null}
              <p className="font-mono text-xs text-[#8A97A3]">
                {task.plaza?.project?.name ?? ""} · {task.plaza?.name ?? ""} ·
                Assignee: {task.assignee?.name ?? "Unassigned"}
              </p>

              <section aria-label="Status" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#17222C]">
                  Status
                </h3>
                <StatusStepper
                  from={task.status}
                  disabled={completed}
                  pending={pending}
                  onChange={(to) =>
                    void mutate(`/api/tasks/${task.id}/status`, { to }, `Status → ${to}`)
                  }
                />
              </section>

              <section aria-label="Assignee" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#17222C]">
                  Assignee
                </h3>
                <select
                  aria-label="Reassign task"
                  disabled={completed || pending}
                  value={task.assignee?.id ?? ""}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    void mutate(
                      `/api/tasks/${task.id}/assign`,
                      { assigneeId: e.target.value },
                      "Assignee updated",
                    );
                  }}
                  className="min-h-[44px] rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm text-[#17222C] disabled:opacity-60"
                >
                  <option value="">Select assignee…</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </section>

              <section aria-label="Reopen" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#17222C]">
                  Reopen
                </h3>
                <input
                  aria-label="Reopen note (optional)"
                  placeholder="Reopen note (optional)"
                  value={reopenText}
                  onChange={(e) => setReopenText(e.target.value)}
                  className="min-h-[44px] rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm text-[#17222C] placeholder:text-[#8A97A3]"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void mutate(
                      `/api/tasks/${task.id}/reopen`,
                      reopenText.trim() ? { text: reopenText.trim() } : {},
                      "Task reopened",
                    ).then((ok) => {
                      if (ok) setReopenText("");
                    })
                  }
                  className="min-h-[44px] rounded-[6px] border border-[rgba(23,34,44,0.08)] px-4 font-body text-sm text-[#17222C] pst-transition hover:border-[#5E6AD2] disabled:opacity-60"
                >
                  Reopen task
                </button>
              </section>

              <section aria-label="Activity" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#17222C]">
                  Activity ({events.length})
                </h3>
                <ActivityFeed events={events} />
              </section>
            </>
          )}
        </div>

        {taskId ? (
          <div className="px-4 pb-4">
            <CommentComposer
              taskId={taskId}
              onPosted={() => {
                notify("ok", "Comment posted");
                void load();
                onChanged();
              }}
              onError={(msg) => notify("err", msg)}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
