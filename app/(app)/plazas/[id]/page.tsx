"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { fmtDate, isOverdue } from "@/lib/format";
import { AppSidebar } from "@/components/app-sidebar";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { TaskTable, type PlazaTaskItem } from "@/components/task-table";
import {
  TaskFiltersBar,
  type AssigneeOption,
  type TaskFilters,
} from "@/components/task-filters";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { TaskDrawer } from "@/components/task-drawer";

const BOARD_COLUMNS = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const;

type PlazaDetail = {
  id: string;
  name: string;
  chainage?: string | null;
  highway?: string | null;
  location?: string | null;
  lengthKm?: number | null;
  state?: string | null;
  piu?: string | null;
  ro?: string | null;
  status?: string;
  project?: { id: string; name: string } | null;
  projectId?: string;
  task?: { total: number; completed: number; blocked: number; overdue: number };
  progressPct?: number;
};

function plazaMeta(plaza: PlazaDetail): string {
  const parts: string[] = [];
  if (plaza.project?.name) parts.push(plaza.project.name);
  if (plaza.state) parts.push(plaza.state);
  if (typeof plaza.lengthKm === "number") parts.push(`${plaza.lengthKm} km`);
  if (plaza.piu) parts.push(`PIU ${plaza.piu}`);
  if (plaza.ro) parts.push(`RO ${plaza.ro}`);
  return parts.join(" · ");
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Plaza tasks page (T-024 + drawer host for T-025).
 * Page-local shell mirrors app/page.tsx (no shared (app) shell exists).
 * Row click → ?task=<id> opens TaskDrawer; filters map 1:1 to
 * GET /api/tasks query params.
 */
function PlazaTasksInner({ plazaId }: { plazaId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawerTaskId = searchParams.get("task");

  const [plaza, setPlaza] = useState<PlazaDetail | null>(null);
  const [plazaState, setPlazaState] = useState<"loading" | "ok" | "denied" | "missing" | "error">("loading");
  const [tasks, setTasks] = useState<PlazaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [view, setView] = useState<"table" | "board">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const q = useDebounced(filters.q ?? "", 350);

  const notify = useCallback((tone: "ok" | "err", msg: string) => {
    setNotice({ tone, msg });
    window.setTimeout(() => {
      setNotice((n) => (n?.msg === msg ? null : n));
    }, 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/plazas/${plazaId}`, {
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (res.status === 403) {
          setPlazaState("denied");
          return;
        }
        if (res.status === 404) {
          setPlazaState("missing");
          return;
        }
        if (!res.ok) {
          setPlazaState("error");
          return;
        }
        setPlaza(await res.json());
        setPlazaState("ok");
      } catch {
        if (!cancelled) setPlazaState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plazaId]);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const params = new URLSearchParams({ plazaId, pageSize: "50" });
      if (filters.status?.[0]) params.set("status", filters.status[0]);
      if (filters.priority?.[0]) params.set("priority", filters.priority[0]);
      if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters.overdueOnly) params.set("overdue", "true");
      if (q) params.set("q", q);
      const res = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (res.status === 403) {
        setPlazaState("denied");
        return;
      }
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setTasks(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      notify("err", "Failed to load tasks");
    } finally {
      setLoadingTasks(false);
    }
  }, [plazaId, filters.status, filters.priority, filters.assigneeId, filters.overdueOnly, q, notify]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Assignee options: prefer the user directory (admin/lead), otherwise
  // derive from assignees already visible on this plaza's tasks —
  // GET /api/users and GET /api/access?plazaId= both 403 for site users.
  const [directory, setDirectory] = useState<AssigneeOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = (Array.isArray(data) ? data : data.items ?? []) as {
          id: string;
          name: string;
          plazaIds?: string[];
        }[];
        setDirectory(
          list
            .filter((u) => !u.plazaIds || u.plazaIds.includes(plazaId))
            .map((u) => ({ id: u.id, name: u.name })),
        );
      } catch {
        // Fall through to the task-derived fallback below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plazaId]);

  const assignees: AssigneeOption[] = useMemo(() => {
    if (directory) return directory;
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.assignee?.id && t.assignee?.name) seen.set(t.assignee.id, t.assignee.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [directory, tasks]);

  function openTask(id: string) {
    router.push(`${pathname}?task=${id}`);
  }
  function closeTask() {
    router.push(pathname);
  }

  async function changeStatus(task: PlazaTaskItem, to: string) {
    setPendingId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify("err", (data as { error?: string } | null)?.error ?? `Status change failed (${res.status})`);
        return;
      }
      notify("ok", `Status → ${to}`);
      await loadTasks();
    } catch {
      notify("err", "Network error changing status");
    } finally {
      setPendingId(null);
    }
  }

  const board = useMemo(() => {
    const groups = new Map<string, PlazaTaskItem[]>();
    for (const c of BOARD_COLUMNS) groups.set(c, []);
    for (const t of tasks) {
      const bucket = groups.get(t.status) ?? groups.get("TODO")!;
      bucket.push(t);
    }
    return groups;
  }, [tasks]);

  const denied = plazaState === "denied";

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] font-body text-[#17222C]">
      <AppSidebar active="Projects" />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-[64px] items-center gap-3 border-b border-[rgba(23,34,44,0.08)] bg-white px-4">
          <p className="font-display text-base font-semibold tracking-[-0.02em] md:hidden">
            Site Tracker
          </p>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#0E121B] font-display text-sm font-semibold text-white">
              OP
            </span>
          </div>
        </header>

        <div className="sticky top-[64px] z-10 border-b border-[rgba(23,34,44,0.08)] bg-[#F4F5F7]/95 px-4 py-2 backdrop-blur md:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <TaskFiltersBar
              filters={filters}
              onChange={setFilters}
              assignees={assignees}
            />
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <nav aria-label="Breadcrumb" className="font-mono text-xs text-[#8A97A3]">
            <a href="/" className="hover:text-[#17222C]">
              Dashboard
            </a>
            {" / "}
            <a href="/projects" className="hover:text-[#17222C]">
              Projects
            </a>
            {" / "}
            <span>{plaza?.project?.name ?? "…"}</span>
            {" / "}
            <span aria-current="page" className="text-[#17222C]">
              {plaza?.name ?? "Plaza"}
            </span>
          </nav>

          {notice ? (
            <p
              role={notice.tone === "err" ? "alert" : "status"}
              className={`rounded-[6px] border px-3 py-2 font-body text-sm ${
                notice.tone === "ok"
                  ? "border-green-500/40 bg-[#DCFCE7] text-[#166534]"
                  : "border-red-500/40 bg-[#FEE2E2] text-[#991B1B]"
              }`}
            >
              {notice.msg}
            </p>
          ) : null}

          {denied ? (
            <section
              role="alert"
              className="rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-8 text-center"
            >
              <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Access denied
              </h1>
              <p className="mt-2 font-body text-sm text-[#5C6F7E]">
                You are not mapped to this plaza. Ask your project lead for
                access.
              </p>
            </section>
          ) : plazaState === "missing" ? (
            <section
              role="alert"
              className="rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-8 text-center"
            >
              <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Plaza not found
              </h1>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#17222C]">
                    {plaza?.name ?? "Loading…"}
                  </h1>
                  <p className="font-body text-sm text-[#5C6F7E]">
                    {plaza ? plazaMeta(plaza) || "Loading plaza…" : "Loading plaza…"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="View toggle"
                    className="flex rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white p-1"
                  >
                    {(["table", "board"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={`min-h-[44px] rounded-[6px] px-4 font-body text-sm capitalize pst-transition ${
                          view === v
                            ? "bg-[#0E121B] font-semibold text-white"
                            : "text-[#5C6F7E] hover:text-[#17222C]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="min-h-[44px] rounded-[6px] bg-[#5E6AD2] px-5 font-body text-sm font-semibold text-white pst-transition hover:brightness-110"
                  >
                    + New Task
                  </button>
                </div>
              </div>

              {plaza?.task ? (
                <div className="flex flex-col gap-2 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]">
                  <ProgressBar value={plaza.progressPct ?? 0} />
                  <p className="font-mono text-xs text-[#5C6F7E]">
                    {plaza.task.completed}/{plaza.task.total} complete ·{" "}
                    {plaza.task.blocked} blocked · {plaza.task.overdue} overdue
                  </p>
                </div>
              ) : null}

              {loadingTasks ? (
                <p className="font-body text-sm text-[#5C6F7E]">
                  Loading tasks…
                </p>
              ) : view === "table" ? (
                <section aria-label={`Tasks (${total})`}>
                  <p className="mb-2 font-mono text-xs text-[#8A97A3]">
                    {total} task{total === 1 ? "" : "s"}
                  </p>
                  <TaskTable tasks={tasks} onSelect={openTask} />
                </section>
              ) : (
                <section
                  aria-label="Task board"
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
                >
                  {BOARD_COLUMNS.map((col) => (
                    <div
                      key={col}
                      className="flex flex-col gap-2 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-3"
                    >
                      <h2 className="flex items-center justify-between font-display text-sm font-semibold text-[#17222C]">
                        <StatusBadge status={col} />
                        <span className="font-mono text-xs text-[#8A97A3]">
                          {(board.get(col) ?? []).length}
                        </span>
                      </h2>
                      {(board.get(col) ?? []).map((task) => (
                        <article
                          key={task.id}
                          className="flex flex-col gap-2 rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-[#FAFBFC] p-3"
                        >
                          <button
                            type="button"
                            onClick={() => openTask(task.id)}
                            className="text-left font-body text-sm font-medium text-[#17222C]"
                          >
                            {task.title}
                          </button>
                          <span
                            className={`font-mono text-xs ${isOverdue(task.dueDate, task.status) ? "font-medium text-[#DC2626]" : "text-[#5C6F7E]"}`}
                          >
                            {task.assignee?.name ?? "Unassigned"} · Due{" "}
                            {fmtDate(task.dueDate)}
                          </span>
                          <label className="flex items-center gap-2 font-mono text-xs text-[#5C6F7E]">
                            Move
                            <select
                              aria-label={`Move ${task.title} to status`}
                              disabled={
                                pendingId === task.id || task.status === "COMPLETED"
                              }
                              value={task.status}
                              onChange={(e) => void changeStatus(task, e.target.value)}
                              className="min-h-[44px] flex-1 rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-2 font-body text-sm text-[#17222C] disabled:opacity-60"
                            >
                              {BOARD_COLUMNS.map((s) => (
                                <option key={s} value={s}>
                                  {s.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>
                        </article>
                      ))}
                      {(board.get(col) ?? []).length === 0 ? (
                        <p className="p-2 font-body text-sm text-[#8A97A3]">
                          No tasks.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <NewTaskDialog
        plazaId={plazaId}
        assignees={assignees}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          notify("ok", "Task created");
          void loadTasks();
        }}
        onError={(msg) => notify("err", msg)}
      />
      <TaskDrawer
        taskId={drawerTaskId}
        assignees={assignees}
        open={drawerTaskId !== null}
        onClose={closeTask}
        onChanged={loadTasks}
      />
    </div>
  );
}

export default function PlazaTasksPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={<p className="p-6 font-body text-sm">Loading plaza…</p>}
    >
      <PlazaTasksInner plazaId={params.id} />
    </Suspense>
  );
}
