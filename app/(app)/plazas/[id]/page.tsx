"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { assigneeSummary } from "@/lib/assignee-summary";
import { fmtDate, isOverdue } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { TaskTable, type PlazaTaskItem } from "@/components/task-table";
import {
  TaskFiltersBar,
  type AssigneeOption,
  type CategoryOption,
  type TaskFilters,
} from "@/components/task-filters";
import { TaskComposer } from "@/components/task-composer";
import { TaskDrawer } from "@/components/task-drawer";

const BOARD_COLUMNS = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const;

type PlazaStatus = "ACTIVE" | "ARCHIVED";

type PlazaDetail = {
  id: string;
  name: string;
  lengthKm?: number | null;
  active?: boolean;
  status?: PlazaStatus;
  project?: {
    id: string;
    name: string;
    acronym?: string | null;
    state?: string | null;
    piu?: string | null;
    ro?: string | null;
    company?: { id: string; name: string; code?: string | null } | null;
  } | null;
  projectId?: string;
  task?: { total: number; completed: number; blocked: number; overdue: number };
  progressPct?: number;
};

function plazaMeta(plaza: PlazaDetail): string {
  const parts: string[] = [];
  if (plaza.project?.name) parts.push(plaza.project.name);
  if (plaza.project?.company?.name) parts.push(plaza.project.company.name);
  if (plaza.project?.state) parts.push(plaza.project.state);
  if (typeof plaza.lengthKm === "number") parts.push(`${plaza.lengthKm} km`);
  if (plaza.project?.piu) parts.push(`PIU ${plaza.project.piu}`);
  if (plaza.project?.ro) parts.push(`RO ${plaza.project.ro}`);
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
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [view, setView] = useState<"table" | "board">("table");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/categories", {
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []) as CategoryOption[];
        setCategories(list.filter((category) => category.active !== false));
      } catch {
        // The category filter and composer field simply stay hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const params = new URLSearchParams({ plazaId, pageSize: "50" });
      if (filters.status?.[0]) params.set("status", filters.status[0]);
      if (filters.priority?.[0]) params.set("priority", filters.priority[0]);
      if (filters.categoryId) params.set("categoryId", filters.categoryId);
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
  }, [plazaId, filters.status, filters.priority, filters.categoryId, filters.assigneeId, filters.overdueOnly, q, notify]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Assignee options come from GET /api/assignees, already filtered by the
  // assignment ceiling. The task-derived list is the offline/failure fallback;
  // GET /api/users is admin-only and would 403 for site users.
  const [resolvedAssignees, setResolvedAssignees] =
    useState<AssigneeOption[] | null>(null);
  useEffect(() => {
    const projectId = plaza?.project?.id;
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ projectId, plazaId });
        const res = await fetch(`/api/assignees?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []) as {
          id: string;
          name: string;
        }[];
        setResolvedAssignees(list.map(({ id, name }) => ({ id, name })));
      } catch {
        // Fall through to the task-derived fallback below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plaza?.project?.id, plazaId]);

  const assignees: AssigneeOption[] = useMemo(() => {
    if (resolvedAssignees) return resolvedAssignees;
    const seen = new Map<string, string>();
    for (const t of tasks) {
      for (const person of t.assignees ?? []) {
        if (person.id && person.name) seen.set(person.id, person.name);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [resolvedAssignees, tasks]);

  const composerPlazas = useMemo(
    () =>
      plaza
        ? [
            {
              id: plaza.id,
              name: plaza.name,
              project: plaza.project
                ? { id: plaza.project.id, name: plaza.project.name }
                : null,
            },
          ]
        : [],
    [plaza],
  );

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
  const archived = plaza?.status === "ARCHIVED" || plaza?.active === false;

  return (
    <>
      <div className="cockpit-plaza-filter sticky z-10 border-b border-[#CDD6CE] bg-[#F5F5EF]/95 px-4 py-2 backdrop-blur md:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <TaskFiltersBar
              filters={filters}
              onChange={setFilters}
              assignees={assignees}
              categories={categories}
            />
          </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <nav aria-label="Breadcrumb" className="font-mono text-xs text-[#66756D]">
            <Link href="/" className="hover:text-[#1C2824]">
              Dashboard
            </Link>
            {" / "}
            <Link href="/projects" className="hover:text-[#1C2824]">
              Projects
            </Link>
            {" / "}
            <span>{plaza?.project?.name ?? "…"}</span>
            {" / "}
            <span aria-current="page" className="text-[#1C2824]">
              {plaza?.name ?? "Plaza"}
            </span>
          </nav>

          {notice ? (
            <p
              role={notice.tone === "err" ? "alert" : "status"}
              className={`rounded-[6px] border px-3 py-2 font-body text-sm ${
                notice.tone === "ok"
                  ? "border-green-500/40 bg-[#E8F0DD] text-[#385A2B]"
                  : "border-red-500/40 bg-[#FBE8E4] text-[#991B1B]"
              }`}
            >
              {notice.msg}
            </p>
          ) : null}

          {denied ? (
            <section
              role="alert"
              className="rounded-[12px] border border-[#CDD6CE] bg-white p-8 text-center"
            >
              <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Access denied
              </h1>
              <p className="mt-2 font-body text-sm text-[#586760]">
                You are not mapped to this plaza. Ask your project lead for
                access.
              </p>
            </section>
          ) : plazaState === "missing" ? (
            <section
              role="alert"
              className="rounded-[12px] border border-[#CDD6CE] bg-white p-8 text-center"
            >
              <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Plaza not found
              </h1>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#1C2824]">
                    {plaza?.name ?? "Loading…"}
                  </h1>
                  <p className="font-body text-sm text-[#586760]">
                    {plaza ? plazaMeta(plaza) || "Loading plaza…" : "Loading plaza…"}
                  </p>
                </div>
                {plaza ? (
                  <span
                    className={`inline-flex min-h-[28px] items-center rounded-[6px] border px-2 font-mono text-xs font-medium uppercase tracking-wide ${
                      archived
                        ? "border-[#CDD6CE] bg-[#F5F5EF] text-[#586760]"
                        : "border-green-600/30 bg-[#E8F0DD] text-[#385A2B]"
                    }`}
                  >
                    {archived ? "Archived" : "Active"}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="View toggle"
                    className="flex rounded-[6px] border border-[#CDD6CE] bg-white p-1"
                  >
                    {(["table", "board"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={`min-h-[44px] rounded-[6px] px-4 font-body text-sm capitalize pst-transition ${
                          view === v
                            ? "bg-[#102D27] font-semibold text-white"
                            : "text-[#586760] hover:text-[#1C2824]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {plaza?.task ? (
                <div className="flex flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]">
                  <ProgressBar value={plaza.progressPct ?? 0} />
                  <p className="font-mono text-xs text-[#586760]">
                    {plaza.task.completed}/{plaza.task.total} complete ·{" "}
                    {plaza.task.blocked} blocked · {plaza.task.overdue} overdue
                  </p>
                </div>
              ) : null}

              <TaskComposer
                plazas={composerPlazas}
                fixedPlazaId={plazaId}
                assignees={assignees}
                categories={categories}
                variant="page"
                onCreated={() => void loadTasks()}
              />

              {loadingTasks ? (
                <p className="font-body text-sm text-[#586760]">
                  Loading tasks…
                </p>
              ) : view === "table" ? (
                <section aria-label={`Tasks (${total})`}>
                  <p className="mb-2 font-mono text-xs text-[#66756D]">
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
                      className="flex flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white p-3"
                    >
                      <h2 className="flex items-center justify-between font-display text-sm font-semibold text-[#1C2824]">
                        <StatusBadge status={col} />
                        <span className="font-mono text-xs text-[#66756D]">
                          {(board.get(col) ?? []).length}
                        </span>
                      </h2>
                      {(board.get(col) ?? []).map((task) => (
                        <article
                          key={task.id}
                          className="flex flex-col gap-2 rounded-[6px] border border-[#CDD6CE] bg-[#FAFBFC] p-3"
                        >
                          <button
                            type="button"
                            onClick={() => openTask(task.id)}
                            className="text-left font-body text-sm font-medium text-[#1C2824]"
                          >
                            {task.title}
                          </button>
                          <span
                            className={`font-mono text-xs ${isOverdue(task.dueDate, task.status) ? "font-medium text-[#8F2824]" : "text-[#586760]"}`}
                          >
                            {assigneeSummary(task.assignees)} · Due{" "}
                            {fmtDate(task.dueDate)}
                          </span>
                          <label className="flex items-center gap-2 font-mono text-xs text-[#586760]">
                            Move
                            <select
                              aria-label={`Move ${task.title} to status`}
                              disabled={
                                pendingId === task.id || task.status === "COMPLETED"
                              }
                              value={task.status}
                              onChange={(e) => void changeStatus(task, e.target.value)}
                              className="min-h-[44px] flex-1 rounded-[6px] border border-[#CDD6CE] bg-white px-2 font-body text-sm text-[#1C2824] disabled:opacity-60"
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
                        <p className="p-2 font-body text-sm text-[#66756D]">
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

      <TaskDrawer
        taskId={drawerTaskId}
        assignees={assignees}
        open={drawerTaskId !== null}
        onClose={closeTask}
        onChanged={loadTasks}
      />
    </>
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
