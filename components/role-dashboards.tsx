"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskComposer } from "@/components/task-composer";
import { PageHeader } from "@/components/page-header";
import type { PlazaTaskItem } from "@/components/task-table";
import type { ProjectSummary } from "@/lib/dashboard";
import { fmtDate, isOverdue } from "@/lib/format";

type View = "management" | "manager";
type Status = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
type RoundKey = "ROUND_1" | "ROUND_2" | "ROUND_3" | "ROUND_4";
type StatusCounts = Record<Status, number>;

type CompanySummary = {
  id: string;
  name: string;
  code?: string | null;
  projectCount: number;
  taskCounts: StatusCounts;
};

type Snapshot = {
  projectCount: number;
  plazaCount: number;
  companyCount: number;
  kpis: { open: number; overdue: number; blocked: number; completedWeek: number };
  statusCounts: StatusCounts;
  rounds: { round: RoundKey; projectCount: number; taskCounts: StatusCounts }[];
  companies: CompanySummary[];
};

type PlazaSummary = {
  id: string;
  projectId: string;
  name: string;
  state?: string | null;
  lengthKm?: number | null;
  project?: { id: string; name: string } | null;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

type DashboardTask = PlazaTaskItem & {
  completedAt?: string | null;
  createdAt?: string | null;
};

type TaskResponse = { items: DashboardTask[]; total: number; page: number; pageSize: number };

const STATUS_LABELS: Record<Status, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};
const STATUS_CLASS: Record<Status, string> = {
  TODO: "todo",
  IN_PROGRESS: "inprogress",
  BLOCKED: "blocked",
  COMPLETED: "completed",
};
const ROUND_LABELS: Record<RoundKey, string> = {
  ROUND_1: "Round 1",
  ROUND_2: "Round 2",
  ROUND_3: "Round 3",
  ROUND_4: "Round 4",
};
const ROUND_NUM: Record<RoundKey, string> = {
  ROUND_1: "1",
  ROUND_2: "2",
  ROUND_3: "3",
  ROUND_4: "4",
};

/** Round scope for the header, e.g. "Rounds 1–4", derived from the loaded snapshot. */
function roundScopeLabel(rounds?: Snapshot["rounds"]): string {
  const active = (rounds ?? []).filter((entry) => entry.projectCount > 0);
  if (active.length === 0) return "All rounds";
  if (active.length === 1) return `Round ${ROUND_NUM[active[0].round]}`;
  return `Rounds ${ROUND_NUM[active[0].round]}–${ROUND_NUM[active[active.length - 1].round]}`;
}

async function apiJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

async function loadAllTasks(): Promise<DashboardTask[]> {
  const pageSize = 100;
  const first = await apiJson<TaskResponse>(`/api/tasks?page=1&pageSize=${pageSize}`);
  const pageCount = Math.ceil(first.total / pageSize);
  if (pageCount <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      apiJson<TaskResponse>(`/api/tasks?page=${index + 2}&pageSize=${pageSize}`),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <main className="cockpit-main">{children}</main>;
}

function Metric({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: string }) {
  return (
    <div className="cockpit-metric">
      <span>{label}</span>
      <strong className={tone}>{value.toLocaleString()}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const key = (status in STATUS_CLASS ? status : "TODO") as Status;
  return <span className={`cockpit-status ${STATUS_CLASS[key]}`}>{STATUS_LABELS[key]}</span>;
}

function StatusDonut({ counts }: { counts: StatusCounts }) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = (["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[]).map((status) => {
    const length = total ? (counts[status] / total) * circumference : 0;
    const segment = { status, length, offset };
    offset += length;
    return segment;
  });
  const description = (["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[])
    .map((status) => `${STATUS_LABELS[status]} ${counts[status]}`)
    .join(", ");

  return (
    <div className="cockpit-donut-layout">
      <svg className="cockpit-donut" viewBox="0 0 100 100" role="img" aria-label={`${total} tasks: ${description}`}>
        <circle className="track" cx="50" cy="50" r={radius} />
        <g transform="rotate(-90 50 50)">
          {segments.map(({ status, length, offset: segmentOffset }) => (
            <circle
              key={status}
              className={`segment ${STATUS_CLASS[status]}`}
              cx="50"
              cy="50"
              r={radius}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-segmentOffset}
            />
          ))}
        </g>
        <text className="total" x="50" y="49">{total}</text>
        <text className="caption" x="50" y="59">TOTAL TASKS</text>
      </svg>
      <div className="cockpit-status-legend" aria-label="Task status counts">
        {(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[]).map((status) => (
          <div className="legend-item" key={status}>
            <i className={`swatch ${STATUS_CLASS[status]}`} aria-hidden="true" />
            <span>{STATUS_LABELS[status]}</span>
            <strong>{counts[status]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundChart({ rounds }: { rounds: Snapshot["rounds"] }) {
  const max = Math.max(1, ...rounds.map(({ taskCounts }) => Object.values(taskCounts).reduce((a, b) => a + b, 0)));
  return (
    <div className="cockpit-round-chart">
      {rounds.map(({ round, projectCount, taskCounts }) => {
        const total = Object.values(taskCounts).reduce((sum, value) => sum + value, 0);
        const detail = (["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[])
          .map((status) => `${STATUS_LABELS[status]} ${taskCounts[status]}`)
          .join(", ");
        return (
          <div
            className="cockpit-round-line"
            key={round}
            role="img"
            aria-label={`${ROUND_LABELS[round]}: ${projectCount} projects, ${total} tasks; ${detail}`}
          >
            <span className="round-name">{ROUND_LABELS[round]}<small>{projectCount} projects</small></span>
            <span className="round-track" aria-hidden="true">
              {(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[]).map((status) => (
                <i
                  key={status}
                  className={STATUS_CLASS[status]}
                  style={{ width: `${(taskCounts[status] / max) * 100}%` }}
                />
              ))}
            </span>
            <strong>{total} tasks</strong>
          </div>
        );
      })}
      <div className="cockpit-chart-scale" aria-hidden="true"><span>0</span><span>{Math.ceil(max / 2)}</span><span>{max} tasks</span></div>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="cockpit-chart-legend" aria-label="Chart colors">
      {(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[]).map((status) => (
        <span key={status}><i className={`swatch ${STATUS_CLASS[status]}`} aria-hidden="true" />{STATUS_LABELS[status]}</span>
      ))}
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  const total = project.task.total;
  const done = project.task.completed;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const acronym = project.acronym?.trim();
  const roundLabel =
    project.round && project.round in ROUND_LABELS
      ? ROUND_LABELS[project.round as RoundKey]
      : null;
  return (
    <Link
      href={`/projects/${project.id}`}
      className="cockpit-project-row"
      role="row"
      aria-label={`${project.name}${acronym ? ` (${acronym})` : ""}, ${project.plazaCount} plaza sites${roundLabel ? `, ${roundLabel}` : ""}, ${done} of ${total} tasks completed, ${project.task.overdue} overdue, ${project.task.blocked} blocked`}
    >
      <span className="project-title-cell" role="cell">
        <span className="project-acronym-tag">{acronym || "—"}</span>
        <span className="project-title-wrap">
          <strong title={project.name}>{project.name}</strong>
          <small>{project.plazaCount} plaza sites{roundLabel ? ` · ${roundLabel}` : ""}</small>
        </span>
      </span>
      <span className="project-progress-cell" role="cell" aria-label={`${percent}% complete · ${done} of ${total} tasks completed`}>
        <span><b>{percent}%</b> · {done}/{total}</span>
        <i className="project-progress"><i style={{ width: `${percent}%` }} /></i>
      </span>
      <span className={`project-count ${project.task.overdue ? "risk" : "zero"}`} role="cell">{project.task.overdue}</span>
      <span className={`project-count ${project.task.blocked ? "blocked" : "zero"}`} role="cell">{project.task.blocked}</span>
    </Link>
  );
}

function ProjectRegister({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState("");
  const [round, setRound] = useState("all");
  const filtered = useMemo(() => projects.filter((project) => {
    const matchesRound = round === "all" || project.round === round;
    const haystack = `${project.name} ${project.acronym ?? ""}`.toLowerCase();
    return matchesRound && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [projects, query, round]);
  const groups = useMemo(() => {
    const order: RoundKey[] = ["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"];
    const byRound = new Map<RoundKey, ProjectSummary[]>();
    for (const project of filtered) {
      const key = (project.round && project.round in ROUND_LABELS ? project.round : "ROUND_1") as RoundKey;
      const list = byRound.get(key) ?? [];
      list.push(project);
      byRound.set(key, list);
    }
    return order
      .filter((key) => byRound.has(key))
      .map((key) => ({ key, label: ROUND_LABELS[key], projects: byRound.get(key)! }));
  }, [filtered]);

  return (
    <section className="cockpit-panel" aria-labelledby="project-register-title">
      <div className="cockpit-panel-head">
        <div><h2 id="project-register-title">Project register</h2><span>{filtered.length} of {projects.length} projects</span></div>
        <div className="cockpit-filters">
          <label htmlFor="project-round-filter">Round</label>
          <select id="project-round-filter" value={round} onChange={(event) => setRound(event.target.value)}>
            <option value="all">All</option>
            {(["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"] as RoundKey[]).map((key) => <option key={key} value={key}>{ROUND_LABELS[key]}</option>)}
          </select>
          <label htmlFor="project-search">Find</label>
          <input id="project-search" type="search" placeholder="Project name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <div className="cockpit-project-columns" role="table" aria-label="Projects by completion and risk" aria-rowcount={filtered.length + groups.length + 1} aria-colcount={4}>
        <div className="cockpit-project-head" role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Completion</span>
          <span role="columnheader">Overdue</span>
          <span role="columnheader">Blocked</span>
        </div>
        <div className="cockpit-project-body">
          {groups.map((group) => (
            <div className="cockpit-project-group-body" key={group.key}>
              <div className="cockpit-project-group" role="row">
                <span role="cell" aria-colspan={4} className="cockpit-project-group-label">
                  <strong>{group.label}</strong>
                  <small>{group.projects.length} {group.projects.length === 1 ? "project" : "projects"}</small>
                </span>
              </div>
              <div role="rowgroup">
                {group.projects.map((project) => <ProjectRow key={project.id} project={project} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? <p className="cockpit-empty">No projects match the selected filters.</p> : null}
      <p className="cockpit-footnote">Completion is based on tasks. Projects with no tasks remain visible.</p>
    </section>
  );
}

function CompaniesPanel({ companies }: { companies: CompanySummary[] }) {
  if (companies.length === 0) return null;
  return (
    <section className="cockpit-panel mb-3" aria-labelledby="companies-title">
      <div className="cockpit-panel-head">
        <div>
          <h2 id="companies-title">Companies</h2>
          <span>{companies.length} {companies.length === 1 ? "company" : "companies"} · projects and task load</span>
        </div>
      </div>
      <div
        className="cockpit-project-columns"
        role="table"
        aria-label="Companies with project and task counts"
        aria-rowcount={companies.length + 1}
        aria-colcount={4}
      >
        <div className="cockpit-project-head" role="row">
          <span role="columnheader">Company</span>
          <span role="columnheader">Projects</span>
          <span role="columnheader">Open</span>
          <span role="columnheader">Completed</span>
        </div>
        <div role="rowgroup">
          {companies.map((company) => {
            const total = Object.values(company.taskCounts).reduce((sum, value) => sum + value, 0);
            const open = total - company.taskCounts.COMPLETED;
            return (
              <div
                className="cockpit-project-row"
                key={company.id}
                role="row"
                aria-label={`${company.name}: ${company.projectCount} projects, ${open} open tasks, ${company.taskCounts.COMPLETED} completed`}
              >
                <span className="project-title-cell" role="cell">
                  <span className="project-acronym-tag">{company.code?.trim() || "—"}</span>
                  <span className="project-title-wrap">
                    <strong title={company.name}>{company.name}</strong>
                    <small>{total} tasks · {company.taskCounts.BLOCKED} blocked</small>
                  </span>
                </span>
                <span className="project-count" role="cell">{company.projectCount}</span>
                <span className={`project-count ${open > 0 ? "" : "zero"}`} role="cell">{open}</span>
                <span className="project-count" role="cell">{company.taskCounts.COMPLETED}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatTaskProject(task: DashboardTask) {
  return task.project?.name ?? task.plaza?.project?.name ?? "Project";
}

function AttentionPanel({ tasks, overdue, blocked }: { tasks: DashboardTask[]; overdue: number; blocked: number }) {
  return (
    <aside className="cockpit-panel cockpit-attention" aria-labelledby="attention-title">
      <div className="cockpit-panel-head"><div><h2 id="attention-title">Needs attention</h2><span>Exceptions first</span></div></div>
      <div className="attention-totals"><strong>{overdue} overdue</strong><span aria-hidden="true">·</span><strong>{blocked} blocked</strong></div>
      {tasks.map((task) => {
        const late = isOverdue(task.dueDate, task.status);
        return (
          <Link className="attention-row" key={task.id} href={task.plaza?.id ? `/plazas/${task.plaza.id}?task=${task.id}` : "/my-tasks"}>
            <i className={`attention-dot ${task.status === "BLOCKED" ? "blocked" : "late"}`} aria-hidden="true" />
            <span className="attention-copy"><strong>{task.title}</strong><small>{task.plaza?.name ?? "Project-level"} · {formatTaskProject(task)}</small></span>
            <span className={`attention-age ${task.status === "BLOCKED" ? "blocked" : "late"}`}>{task.status === "BLOCKED" ? "Blocked" : late ? `Due ${fmtDate(task.dueDate)}` : "Overdue"}</span>
          </Link>
        );
      })}
      {tasks.length === 0 ? <p className="cockpit-empty">No overdue or blocked tasks.</p> : null}
    </aside>
  );
}

function LoadingBlock({ retry }: { retry: () => void }) {
  return (
    <div className="cockpit-message" role="alert">
      <span>We couldn’t load this dashboard.</span>
      <button type="button" className="cockpit-secondary-button" onClick={retry}>Retry</button>
    </div>
  );
}

function ManagementDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [plazas, setPlazas] = useState<PlazaSummary[]>([]);
  const [attention, setAttention] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [overview, projectRows, plazaRows, lateData, blockedData] = await Promise.all([
        apiJson<Snapshot>("/api/dashboard"),
        apiJson<ProjectSummary[]>("/api/projects"),
        apiJson<PlazaSummary[]>("/api/plazas"),
        apiJson<TaskResponse>("/api/tasks?overdue=true&pageSize=5"),
        apiJson<TaskResponse>("/api/tasks?status=BLOCKED&pageSize=5"),
      ]);
      const unique = new Map<string, DashboardTask>();
      for (const task of [...lateData.items, ...blockedData.items]) unique.set(task.id, task);
      const alerts = Array.from(unique.values()).sort((a, b) => {
        const lateDelta = Number(isOverdue(b.dueDate, b.status)) - Number(isOverdue(a.dueDate, a.status));
        return lateDelta || String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
      }).slice(0, 5);
      setSnapshot(overview);
      setProjects(projectRows);
      setPlazas(plazaRows);
      setAttention(alerts);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageFrame>
      <PageHeader
        overline={`All projects · ${roundScopeLabel(snapshot?.rounds)}`}
        title="Delivery overview"
        subtitle="Live status across every project and plaza, with exceptions surfaced first."
        action={<span className="cockpit-live"><i aria-hidden="true" />Live · updated {updatedAt ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>}
      />

      {plazas.length > 0 ? <TaskComposer plazas={plazas} tasks={attention} onCreated={() => void load()} /> : null}

      {loading ? <div className="cockpit-loading" aria-label="Loading portfolio" /> : error ? <LoadingBlock retry={() => void load()} /> : snapshot ? (
        <>
          <section className="cockpit-chart-grid" aria-label="Portfolio task charts">
            <div className="cockpit-panel">
              <div className="cockpit-panel-head"><div><h2>Task status</h2><span>{Object.values(snapshot.statusCounts).reduce((a, b) => a + b, 0)} tasks</span></div></div>
              <StatusDonut counts={snapshot.statusCounts} />
            </div>
            <div className="cockpit-panel">
              <div className="cockpit-panel-head"><div><h2>Workload by round</h2><span>Task volume and status</span></div></div>
              <RoundChart rounds={snapshot.rounds} />
              <StatusLegend />
            </div>
          </section>

          <CompaniesPanel companies={snapshot.companies ?? []} />

          <section className="cockpit-main-grid">
            <ProjectRegister projects={projects} />
            <AttentionPanel tasks={attention} overdue={snapshot.kpis.overdue} blocked={snapshot.kpis.blocked} />
          </section>

          <section className="cockpit-metrics" aria-label="Portfolio summary">
            <Metric label="Projects" value={snapshot.projectCount} note={`${snapshot.companyCount} companies`} />
            <Metric label="Plaza sites" value={snapshot.plazaCount} note="Portfolio total" />
            <Metric label="Open tasks" value={snapshot.kpis.open} note="Not completed" />
            <Metric label="Overdue" value={snapshot.kpis.overdue} note="Past due date" tone="risk" />
            <Metric label="Blocked" value={snapshot.kpis.blocked} note="Needs unblock" tone="blocked" />
            <Metric label="Completed this week" value={snapshot.kpis.completedWeek} note="Since Monday" />
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}

function ManagerWorkbench() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [plazas, setPlazas] = useState<PlazaSummary[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"open" | "overdue" | "blocked">("open");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [overview, plazaRows, taskRows] = await Promise.all([
        apiJson<Snapshot>("/api/dashboard"),
        apiJson<PlazaSummary[]>("/api/plazas"),
        loadAllTasks(),
      ]);
      setSnapshot(overview);
      setPlazas(plazaRows);
      setTasks(taskRows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((task) => task.status !== "COMPLETED")
      .filter((task) => filter === "overdue" ? isOverdue(task.dueDate, task.status) : filter === "blocked" ? task.status === "BLOCKED" : true)
      .filter((task) => !q || `${task.title} ${task.plaza?.name ?? ""} ${task.project?.name ?? task.plaza?.project?.name ?? ""} ${task.project?.company?.name ?? ""} ${task.assignee?.name ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const lateDelta = Number(isOverdue(b.dueDate, b.status)) - Number(isOverdue(a.dueDate, a.status));
        if (lateDelta) return lateDelta;
        if (a.status === "BLOCKED" && b.status !== "BLOCKED") return -1;
        if (b.status === "BLOCKED" && a.status !== "BLOCKED") return 1;
        return String(a.dueDate ?? "9999").localeCompare(String(b.dueDate ?? "9999"));
      });
  }, [tasks, filter, query]);

  const assignees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) if (task.assignee?.id) seen.set(task.assignee.id, task.assignee.name);
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [tasks]);

  return (
    <PageFrame>
      <PageHeader
        overline="Assigned scope · Projects and plazas"
        title="Your workbench"
        subtitle="Tasks and site health across everything assigned to you."
      />

      {plazas.length > 0 ? <TaskComposer plazas={plazas} tasks={tasks} onCreated={() => void load()} /> : null}

      {loading ? <div className="cockpit-loading" aria-label="Loading assigned work" /> : error ? <LoadingBlock retry={() => void load()} /> : snapshot ? (
        <>
          <section className="cockpit-metrics manager-metrics" aria-label="Assigned work summary">
            <Metric label="Projects" value={snapshot.projectCount} note="In your scope" />
            <Metric label="Plaza sites" value={plazas.length} note="Assigned to you" />
            <Metric label="Open tasks" value={snapshot.kpis.open} note="Across your sites" />
            <Metric label="Overdue" value={snapshot.kpis.overdue} note="Needs an update" tone="risk" />
            <Metric label="Blocked" value={snapshot.kpis.blocked} note="Needs unblock" tone="blocked" />
          </section>

          <section className="cockpit-manager-grid">
            <section className="cockpit-panel" aria-labelledby="work-queue-title">
              <div className="cockpit-panel-head manager-panel-head">
                <div><h2 id="work-queue-title">Work requiring an update</h2><span>{openTasks.length} open tasks · overdue first</span></div>
                <div className="cockpit-manager-controls">
                  <label className="sr-only" htmlFor="work-search">Search tasks, plazas, projects or owners</label>
                  <input id="work-search" type="search" placeholder="Find work" value={query} onChange={(event) => setQuery(event.target.value)} />
                  <div className="cockpit-filter-group" role="group" aria-label="Filter work queue">
                    {(["open", "overdue", "blocked"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === "open" ? "All open" : key[0].toUpperCase() + key.slice(1)}</button>)}
                  </div>
                </div>
              </div>
              <div className="cockpit-task-list" role="table" aria-label="Open tasks requiring an update" aria-rowcount={openTasks.length + 1} aria-colcount={4}>
                <div role="rowgroup">
                <div className="cockpit-task-header" role="row"><span role="columnheader">Task / plaza</span><span role="columnheader">Owner</span><span role="columnheader">Status</span><span role="columnheader">Due</span></div>
                {openTasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.status);
                  return (
                    <div className="cockpit-task-row" key={task.id} role="row">
                      <span className="task-title-cell" role="cell">
                        <button type="button" onClick={() => setSelectedTask(task.id)}>{task.title}</button>
                        <small>{task.plaza?.name ?? "Project-level"} · {formatTaskProject(task)}</small>
                      </span>
                      <span role="cell">{task.assignee?.name ?? "Unassigned"}</span>
                      <span role="cell"><StatusPill status={task.status} /></span>
                      <span role="cell" className={overdue ? "task-late" : "task-due"}>{fmtDate(task.dueDate)}{overdue ? " · late" : ""}</span>
                    </div>
                  );
                })}
                {openTasks.length === 0 ? <div className="cockpit-task-row" role="row"><span className="cockpit-empty" role="cell" aria-colspan={4}>No work matches these filters.</span></div> : null}
                </div>
              </div>
            </section>

            <aside className="cockpit-panel" aria-labelledby="assigned-sites-title">
              <div className="cockpit-panel-head"><div><h2 id="assigned-sites-title">Your sites</h2><span>{plazas.length} assigned plaza sites</span></div></div>
              <div className="cockpit-site-list">
                {plazas.map((plaza) => (
                  <Link className="cockpit-site-row" href={`/plazas/${plaza.id}`} key={plaza.id}>
                    <span className="site-title"><strong>{plaza.name}</strong><small>{plaza.project?.name ?? "Project"}{plaza.state ? ` · ${plaza.state}` : ""}</small></span>
                    <span className="site-risks">
                      <span>{plaza.task.completed}/{plaza.task.total} done</span>
                      {plaza.task.overdue > 0 ? <strong className="risk">{plaza.task.overdue} overdue</strong> : null}
                      {plaza.task.blocked > 0 ? <strong className="blocked">{plaza.task.blocked} blocked</strong> : null}
                    </span>
                    <i className="site-progress"><i style={{ width: `${plaza.progressPct}%` }} /></i>
                  </Link>
                ))}
                {plazas.length === 0 ? <p className="cockpit-empty">No project or plaza assignments are linked to this account.</p> : null}
              </div>
            </aside>
          </section>

          <p className="cockpit-footnote">Showing your assigned scope. Open a task to update its status, owner, or history.</p>
        </>
      ) : null}

      <TaskDrawer
        taskId={selectedTask}
        assignees={assignees}
        open={selectedTask !== null}
        onClose={() => { setSelectedTask(null); void load(); }}
        onChanged={() => void load()}
      />
    </PageFrame>
  );
}

export function RoleDashboard({ view }: { view: View }) {
  return view === "management" ? <ManagementDashboard /> : <ManagerWorkbench />;
}
