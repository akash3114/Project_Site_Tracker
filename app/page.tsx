"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { KpiRow } from "@/components/kpi-row";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { ProjectCard } from "@/components/project-card";
import { SpotlightTable } from "@/components/spotlight-table";
import { isOverdue } from "@/lib/format";
import type { ProjectSummary, SpotlightTask } from "@/lib/dashboard";

type ApiTaskItem = SpotlightTask & {
  completedAt?: string | null;
  updatedAt?: string | null;
  plaza?: SpotlightTask["plaza"] & { project?: { name?: string } };
};

type PlazaOption = { id: string; name: string; project?: { name?: string } };
type AssigneeOption = { id: string; name: string };
type Filter = "all" | "overdue" | "blocked";

function asProjectList(data: unknown): ProjectSummary[] | null {
  if (Array.isArray(data)) return data as ProjectSummary[];
  if (data && typeof data === "object" && Array.isArray((data as { projects?: unknown }).projects)) {
    return (data as { projects: ProjectSummary[] }).projects;
  }
  return null;
}

function asTaskList(data: unknown): ApiTaskItem[] | null {
  if (Array.isArray(data)) return data as ApiTaskItem[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: ApiTaskItem[] }).items;
  }
  return null;
}

function withProjectName(task: ApiTaskItem): SpotlightTask {
  const projectName = task.plaza.projectName ?? task.plaza?.project?.name ?? "—";
  return { ...task, plaza: { ...task.plaza, projectName } };
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function Home() {
  // null = loading (never render other users' data as a flash placeholder).
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [allTasks, setAllTasks] = useState<ApiTaskItem[]>([]);
  const [completedWeek, setCompletedWeek] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);

  // New-task flow: pick plaza first (dashboard has no plaza context).
  const [pickOpen, setPickOpen] = useState(false);
  const [plazaOptions, setPlazaOptions] = useState<PlazaOption[] | null>(null);
  const [chosenPlaza, setChosenPlaza] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAssignees, setDialogAssignees] = useState<AssigneeOption[]>([]);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const notify = useCallback((tone: "ok" | "err", msg: string) => {
    setNotice({ tone, msg });
    window.setTimeout(() => setNotice((n) => (n?.msg === msg ? null : n)), 4000);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [projRes, taskRes] = await Promise.all([
        fetch("/api/projects", { credentials: "same-origin" }),
        fetch("/api/tasks?pageSize=100", { credentials: "same-origin" }),
      ]);
      if (projRes.status === 401 || taskRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!projRes.ok || !taskRes.ok) throw new Error(`API ${projRes.status}/${taskRes.status}`);
      const projList = asProjectList(await projRes.json());
      const taskList = asTaskList(await taskRes.json());
      if (!projList || !taskList) throw new Error("Unexpected API shape");
      setProjects(projList);
      setAllTasks(taskList);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      setCompletedWeek(
        taskList.filter((t) => {
          if (t.status !== "COMPLETED") return false;
          const stamp = t.completedAt ?? t.updatedAt;
          return stamp ? new Date(stamp).getTime() >= weekAgo : false;
        }).length,
      );
    } catch {
      setError("Failed to load dashboard. Retry.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPicker = useCallback(async () => {
    setPickOpen(true);
    setPlazaOptions(null);
    try {
      const res = await fetch("/api/plazas", { credentials: "same-origin" });
      if (!res.ok) {
        notify("err", `Cannot list plazas (${res.status})`);
        setPickOpen(false);
        return;
      }
      const data = await res.json();
      const list: PlazaOption[] = Array.isArray(data) ? data : (data.plazas ?? data.items ?? []);
      setPlazaOptions(list);
      if (list.length === 1) {
        setChosenPlaza(list[0].id);
      }
    } catch {
      notify("err", "Cannot list plazas");
      setPickOpen(false);
    }
  }, [notify]);

  const confirmPlaza = useCallback(async () => {
    if (!chosenPlaza) return;
    try {
      // Assignees = members visible via this plaza's tasks (site-safe, no /api/users needed).
      const res = await fetch(`/api/tasks?plazaId=${chosenPlaza}&pageSize=100`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : { items: [] };
      const items = (data.items ?? []) as { assignee?: { id: string; name: string } | null }[];
      const seen = new Map<string, string>();
      for (const t of items) {
        if (t.assignee?.id) seen.set(t.assignee.id, t.assignee.name);
      }
      setDialogAssignees(Array.from(seen, ([id, name]) => ({ id, name })));
    } catch {
      setDialogAssignees([]);
    }
    setPickOpen(false);
    setDialogOpen(true);
  }, [chosenPlaza]);

  const query = dq.trim().toLowerCase();
  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (filter === "overdue" && p.task.overdue === 0) return false;
      if (filter === "blocked" && p.task.blocked === 0) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [projects, filter, query]);

  const spotlight = useMemo(() => {
    const rows = allTasks
      .map(withProjectName)
      .filter((t) => t.status !== "COMPLETED" && (t.status === "BLOCKED" || isOverdue(t.dueDate, t.status)));
    const filtered = rows.filter((t) => {
      if (filter === "overdue" && !isOverdue(t.dueDate, t.status)) return false;
      if (filter === "blocked" && t.status !== "BLOCKED") return false;
      if (query) {
        const hay = `${t.title} ${t.plaza.name} ${t.plaza.projectName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return filtered
      .sort((a, b) => {
        const ao = isOverdue(a.dueDate, a.status) ? 0 : 1;
        const bo = isOverdue(b.dueDate, b.status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? ""));
      })
      .slice(0, 20);
  }, [allTasks, filter, query]);

  const kpis = useMemo(() => {
    const src = projects ?? [];
    const open = src.reduce((n, p) => n + (p.task.total - p.task.completed), 0);
    const overdue = src.reduce((n, p) => n + p.task.overdue, 0);
    const blocked = src.reduce((n, p) => n + p.task.blocked, 0);
    return [
      { label: "Open", value: String(open), hint: `across ${src.length} projects` },
      { label: "Overdue", value: String(overdue), tone: "overdue" as const, hint: "due date passed" },
      { label: "Blocked", value: String(blocked), tone: "blocked" as const, hint: "flagged on site" },
      { label: "Completed this week", value: String(completedWeek), tone: "completed" as const, hint: "last 7 days" },
    ];
  }, [projects, completedWeek]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All projects" },
    { key: "overdue", label: "Overdue only" },
    { key: "blocked", label: "Blocked only" },
  ];

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] font-body text-[#17222C]">
      <AppSidebar active="Dashboard" />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-[64px] items-center gap-3 border-b border-[rgba(23,34,44,0.08)] bg-white px-4">
          <p className="font-display text-base font-semibold tracking-[-0.02em] md:hidden">
            Site Tracker
          </p>
          <div className="hidden min-h-[44px] flex-1 items-center gap-2 rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-[#FAFBFC] px-3 text-sm md:flex md:max-w-xl">
            <input
              aria-label="Search tasks and projects"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks / plazas / projects"
              className="w-full bg-transparent text-[#17222C] outline-none placeholder:text-[#8A97A3]"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="min-h-[44px] px-2 font-mono text-xs text-[#8A97A3] hover:text-[#17222C]"
              >
                ✕
              </button>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-[6px] border border-green-500/40 bg-[#DCFCE7] px-2 py-1 font-mono text-xs text-[#166534]">
              [live]
            </span>
          </div>
        </header>

        <div className="sticky top-[64px] z-10 border-b border-[rgba(23,34,44,0.08)] bg-[#F4F5F7]/95 px-4 py-2 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-[44px] rounded-[6px] border px-3 font-body text-sm pst-transition ${
                  filter === f.key
                    ? "border-[#5E6AD2] bg-white font-medium text-[#17222C]"
                    : "border-[rgba(23,34,44,0.08)] bg-white text-[#5C6F7E] hover:text-[#17222C]"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto hidden font-mono text-xs text-[#8A97A3] sm:inline">
              {projects === null ? "syncing…" : `${spotlight.length} in spotlight`}
            </span>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
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

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#17222C]">
                Global Dashboard
              </h1>
              <p className="font-body text-sm text-[#5C6F7E]">
                All projects and field tasks at a glance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openPicker()}
              className="ml-auto min-h-[44px] rounded-[6px] bg-[#5E6AD2] px-5 font-body text-sm font-semibold text-white pst-transition hover:brightness-110"
            >
              + New Task
            </button>
          </div>

          {projects === null && !error ? (
            <section aria-label="Loading" className="flex flex-col gap-4">
              <div className="h-20 animate-pulse rounded-[12px] bg-white" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-40 animate-pulse rounded-[12px] bg-white" />
                ))}
              </div>
            </section>
          ) : error ? (
            <section role="alert" className="rounded-[12px] border bg-white p-8 text-center">
              <p className="font-body text-sm text-[#991B1B]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 min-h-[44px] rounded-[6px] bg-[#0E121B] px-5 font-body text-sm font-semibold text-white"
              >
                Retry
              </button>
            </section>
          ) : (
            <>
              <KpiRow items={kpis} />
              <section aria-label="Projects">
                <h2 className="mb-3 font-display text-lg font-semibold tracking-[-0.02em] text-[#17222C]">
                  Projects ({visibleProjects.length})
                </h2>
                {visibleProjects.length === 0 ? (
                  <p className="font-body text-sm text-[#5C6F7E]">
                    No projects match this filter.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visibleProjects.map((p) => (
                      <a key={p.id} href={`/projects/${p.id}`} className="block">
                        <ProjectCard
                          name={p.name}
                          status={p.status}
                          plazaCount={p.plazaCount}
                          progressPct={p.progressPct}
                          openCount={p.task.total - p.task.completed}
                          blockedCount={p.task.blocked}
                          overdueCount={p.task.overdue}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </section>
              <section
                aria-label="Overdue and blocked spotlight"
                className="rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[rgba(23,34,44,0.08)] p-4">
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#17222C]">
                    Overdue + Blocked spotlight (top 20)
                  </h2>
                  <span className="font-mono text-xs text-[#8A97A3]">{spotlight.length} rows</span>
                </div>
                <SpotlightTable tasks={spotlight} />
              </section>
            </>
          )}
        </main>
      </div>

      {pickOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose plaza"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setPickOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col gap-4 rounded-t-[12px] bg-white p-6 sm:rounded-[12px]"
          >
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
              New task — choose plaza
            </h2>
            {plazaOptions === null ? (
              <p className="font-body text-sm text-[#5C6F7E]">Loading plazas…</p>
            ) : plazaOptions.length === 0 ? (
              <p className="font-body text-sm text-[#5C6F7E]">No plazas visible to you.</p>
            ) : (
              <>
                <select
                  aria-label="Plaza"
                  value={chosenPlaza}
                  onChange={(e) => setChosenPlaza(e.target.value)}
                  className="min-h-[44px] w-full rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm"
                >
                  <option value="">Select plaza…</option>
                  {plazaOptions.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}{z.project?.name ? ` — ${z.project.name}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!chosenPlaza}
                  onClick={() => void confirmPlaza()}
                  className="min-h-[44px] rounded-[6px] bg-[#5E6AD2] px-4 font-body text-sm font-semibold text-white disabled:opacity-60"
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {dialogOpen && chosenPlaza ? (
        <NewTaskDialog
          plazaId={chosenPlaza}
          assignees={dialogAssignees}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            notify("ok", "Task created");
            setChosenPlaza("");
            void load();
          }}
          onError={(msg) => notify("err", msg)}
        />
      ) : null}
    </div>
  );
}
