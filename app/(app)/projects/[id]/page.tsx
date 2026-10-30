"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { assigneeSummary } from "@/lib/assignee-summary";
import { fmtDate, isOverdue } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/task-table";
import { TaskDrawer } from "@/components/task-drawer";
import type { AssigneeOption } from "@/components/task-filters";

type CompanyRef = { id: string; name: string; code: string };

type ProjectDetail = {
  id: string;
  name: string;
  description?: string | null;
  acronym?: string | null;
  state?: string | null;
  round?: string | null;
  lengthKm?: number | null;
  piu?: string | null;
  ro?: string | null;
  active: boolean;
  status: string;
  company?: CompanyRef | null;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

type PlazaRow = {
  id: string;
  name: string;
  lengthKm?: number | null;
  active: boolean;
  status: string;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

type ProjectTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  category?: { id: string; name: string } | null;
  assignees?: Array<{ id: string; name: string }>;
  plaza?: { id: string; name: string } | null;
};

function roundLabel(round: string | null | undefined): string {
  if (!round) return "—";
  return round.replace(/^ROUND_/, "Round ");
}

function plazaRowMeta(
  z: PlazaRow,
  project: ProjectDetail | null,
): string {
  const parts: string[] = [];
  if (project?.state) parts.push(project.state);
  if (typeof z.lengthKm === "number") parts.push(`${z.lengthKm} km`);
  if (project?.piu) parts.push(`PIU ${project.piu}`);
  if (project?.ro) parts.push(`RO ${project.ro}`);
  return parts.join(" · ");
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-[#66756D]">
        {label}
      </dt>
      <dd className="font-body text-sm text-[#1C2824]">{value || "—"}</dd>
    </div>
  );
}

/** Project detail (T-031): company/project metadata + plazas + project-level tasks. */
export default function ProjectPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : "";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [plazas, setPlazas] = useState<PlazaRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "missing" | "error">("loading");
  const [projectTasks, setProjectTasks] = useState<ProjectTask[] | null>(null);
  const [tasksError, setTasksError] = useState(false);
  const [tasksRefresh, setTasksRefresh] = useState(0);
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const [pr, lr] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { credentials: "same-origin" }),
          fetch(`/api/plazas?projectId=${projectId}`, { credentials: "same-origin" }),
        ]);
        if (pr.status === 403) return void (!cancelled && setState("denied"));
        if (pr.status === 404) return void (!cancelled && setState("missing"));
        if (!pr.ok || !lr.ok) return void (!cancelled && setState("error"));
        const p = (await pr.json()) as ProjectDetail;
        const l = await lr.json();
        if (cancelled) return;
        setProject(p);
        setPlazas(Array.isArray(l) ? l : (l.plazas ?? l.items ?? []));
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, projectRefresh]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/tasks?projectId=${projectId}&pageSize=100`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (!cancelled) {
            setProjectTasks([]);
            setTasksError(true);
          }
          return;
        }
        const data = await res.json();
        const items: ProjectTask[] = Array.isArray(data)
          ? data
          : (data.items ?? []);
        if (!cancelled) {
          setProjectTasks(items.filter((t) => t.plaza === null));
          setTasksError(false);
        }
      } catch {
        if (!cancelled) {
          setProjectTasks([]);
          setTasksError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tasksRefresh]);

  const drawerAssignees: AssigneeOption[] = [];
  {
    const seen = new Set<string>();
    for (const task of projectTasks ?? []) {
      for (const person of task.assignees ?? []) {
        if (!seen.has(person.id)) {
          seen.add(person.id);
          drawerAssignees.push({ id: person.id, name: person.name });
        }
      }
    }
  }

  function refreshTasks() {
    setTasksRefresh((v) => v + 1);
    setProjectRefresh((v) => v + 1);
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <nav aria-label="Breadcrumb" className="font-mono text-xs text-[#66756D]">
          <Link href="/" className="hover:text-[#1C2824]">Dashboard</Link>
          {" / "}
          <Link href="/projects" className="hover:text-[#1C2824]">Projects</Link>
          {" / "}
          <span aria-current="page" className="text-[#1C2824]">{project?.name ?? "…"}</span>
        </nav>

        {state === "loading" ? (
          <p className="text-sm text-[#586760]">Loading…</p>
        ) : state === "denied" ? (
          <p role="alert" className="rounded-md border border-[#F3C2C2] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
            You don&apos;t have access to this project.
          </p>
        ) : state === "missing" ? (
          <p role="alert" className="rounded-md border p-4 text-sm">Project not found.</p>
        ) : state === "error" ? (
          <p role="alert" className="rounded-md border p-4 text-sm">Failed to load. Retry.</p>
        ) : project ? (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#102D27]">
                {project.acronym ? `${project.acronym} · ` : ""}{project.name}
              </h1>
              <p className="font-mono text-xs text-[#66756D]">
                {project.company
                  ? `${project.company.code} · ${project.company.name}`
                  : "No company assigned"}
              </p>
              <div className="mt-3 max-w-md">
                <ProgressBar value={project.progressPct} />
                <p className="mt-1 font-mono text-xs text-[#586760]">
                  {project.progressPct}% · {project.task.completed}/{project.task.total} done ·{" "}
                  {project.task.blocked} blocked · {project.task.overdue} overdue
                </p>
              </div>
            </div>

            <section
              aria-label="Project details"
              className="rounded-[12px] border border-[#CDD6CE] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                <div className="col-span-2">
                  <dt className="font-mono text-[11px] uppercase tracking-wide text-[#66756D]">
                    Company
                  </dt>
                  <dd className="font-body text-sm text-[#1C2824]">
                    {project.company ? (
                      <>
                        <span className="mr-2 rounded-[4px] border border-[#CDD6CE] bg-[#F5F5EF] px-1.5 py-0.5 font-mono text-[11px] text-[#173B33]">
                          {project.company.code}
                        </span>
                        {project.company.name}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <Meta label="Project code" value={project.acronym ?? "—"} />
                <Meta label="Round" value={roundLabel(project.round)} />
                <Meta label="State" value={project.state ?? "—"} />
                <Meta
                  label="Length"
                  value={
                    typeof project.lengthKm === "number"
                      ? `${project.lengthKm} km`
                      : "—"
                  }
                />
                <Meta label="PIU" value={project.piu ?? "—"} />
                <Meta label="RO" value={project.ro ?? "—"} />
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wide text-[#66756D]">
                    Status
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex min-h-[28px] items-center rounded-[6px] border px-2 py-1 font-mono text-xs font-medium ${
                        project.active
                          ? "border-green-500/40 bg-[#E8F0DD] text-[#385A2B]"
                          : "border-[#CDD6CE] bg-[#F5F5EF] text-[#586760]"
                      }`}
                    >
                      {project.active ? "Active" : "Archived"}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-label="Plazas" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#102D27]">
                  Plazas
                </h2>
                <span className="font-mono text-xs text-[#66756D]">
                  {plazas.length} shown · {project.plazaCount} total
                </span>
              </div>
              {plazas.map((z) => (
                <a
                  key={z.id}
                  href={`/plazas/${z.id}`}
                  className={`flex min-h-[44px] flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white p-4 pst-transition hover:border-[#173B33]/40 ${
                    z.active ? "" : "opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-base font-semibold text-[#102D27]">
                      {z.name}
                    </span>
                    {!z.active ? (
                      <span className="rounded-[4px] border border-[#CDD6CE] bg-[#F5F5EF] px-1.5 py-0.5 font-mono text-[11px] text-[#586760]">
                        Archived
                      </span>
                    ) : null}
                    {plazaRowMeta(z, project) ? (
                      <span className="font-mono text-xs text-[#66756D]">{plazaRowMeta(z, project)}</span>
                    ) : null}
                    <span className="ml-auto font-mono text-xs text-[#586760]">
                      {z.task.completed}/{z.task.total}
                      {z.task.overdue > 0 ? (
                        <span className="text-[#8F2824]"> · {z.task.overdue} overdue</span>
                      ) : null}
                      {z.task.blocked > 0 ? (
                        <span className="text-[#704900]"> · {z.task.blocked} blocked</span>
                      ) : null}
                    </span>
                  </div>
                  <ProgressBar value={z.progressPct} />
                </a>
              ))}
              {plazas.length === 0 ? (
                <p className="text-sm text-[#586760]">No plazas visible in this project.</p>
              ) : null}
            </section>

            <section aria-label="Project-level tasks" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#102D27]">
                  Project-level tasks
                </h2>
                <span className="font-mono text-xs text-[#66756D]">
                  {projectTasks === null
                    ? "Loading…"
                    : `${projectTasks.length} not tied to a plaza`}
                </span>
              </div>
              {projectTasks === null ? (
                <p className="text-sm text-[#586760]">Loading tasks…</p>
              ) : tasksError ? (
                <p role="alert" className="rounded-md border p-4 text-sm text-[#991B1B]">
                  Project-level tasks could not be loaded.
                </p>
              ) : projectTasks.length === 0 ? (
                <p className="rounded-[12px] border border-[#CDD6CE] bg-white p-4 text-sm text-[#586760]">
                  No project-level tasks yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {projectTasks.map((task) => {
                    const overdue = isOverdue(task.dueDate, task.status);
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => setDrawerTaskId(task.id)}
                          className="flex w-full min-h-[44px] flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white p-4 text-left pst-transition hover:border-[#173B33]/40"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={task.status} />
                            <span className="rounded-[4px] border border-[#CDD6CE] bg-[#F5F5EF] px-1.5 py-0.5 font-mono text-[11px] text-[#586760]">
                              Project-level
                            </span>
                            <span className="font-display text-base font-semibold tracking-[-0.02em] text-[#102D27]">
                              {task.title}
                            </span>
                            <span className="ml-auto">
                              <PriorityBadge priority={task.priority} />
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#586760]">
                            <span>{assigneeSummary(task.assignees)}</span>
                            <span className={overdue ? "font-medium text-[#8F2824]" : undefined}>
                              Due {fmtDate(task.dueDate)}
                              {overdue ? " · overdue" : ""}
                            </span>
                            {task.category?.name ? <span>{task.category.name}</span> : null}
                            <span className="ml-auto text-[#173B33]">Open →</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </main>

      <TaskDrawer
        taskId={drawerTaskId}
        assignees={drawerAssignees}
        open={drawerTaskId !== null}
        onClose={() => {
          setDrawerTaskId(null);
          refreshTasks();
        }}
        onChanged={refreshTasks}
      />
    </>
  );
}
