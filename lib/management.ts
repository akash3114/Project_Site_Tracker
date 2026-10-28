/**
 * Management workspace contracts and pure helpers.
 *
 * The management page is a task-first surface for Admin / Head Office. These
 * types mirror the task list payload (`GET /api/tasks`) plus the project and
 * plaza summaries, and the helpers keep filtering, grouping and counting out
 * of the React components so the behaviour is easy to reason about.
 */

import type { ProjectSummary } from "@/lib/dashboard";
import { isOverdue } from "@/lib/format";
import {
  parseScopeKey,
  scopeKey,
  scopeRefOf,
  taskMatchesScope,
  type ScopeRef,
  type TaskScopeFields,
} from "@/lib/task-scope";

export type MgmtStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
export type MgmtPriority = "LOW" | "MEDIUM" | "HIGH";

export type MgmtTask = {
  id: string;
  title: string;
  description?: string | null;
  status: MgmtStatus | string;
  priority: MgmtPriority | string;
  dueDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  projectId?: string | null;
  plazaId?: string | null;
  departmentId?: string | null;
  project?: {
    id: string;
    name: string;
    acronym?: string | null;
    round?: string | null;
    company?: { id: string; name: string; code?: string | null } | null;
  } | null;
  plaza?: {
    id: string;
    name: string;
    state?: string | null;
    project?: { id: string; name: string } | null;
  } | null;
  department?: {
    id: string;
    name: string;
    code?: string | null;
    sortOrder?: number | null;
  } | null;
  category?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  completedBy?: { id: string; name: string } | null;
};

export type MgmtProject = ProjectSummary;

export type MgmtDepartment = {
  id: string;
  name: string;
  code?: string | null;
  sortOrder?: number;
  active?: boolean;
  memberCount?: number;
  open?: number;
  progressPct?: number;
  task?: { total: number; completed: number; blocked: number; overdue: number };
};

export type MgmtPlaza = {
  id: string;
  projectId: string;
  name: string;
  state?: string | null;
  piu?: string | null;
  ro?: string | null;
  lengthKm?: number | null;
  project?: { id: string; name: string } | null;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

/** Minimal plaza shape the composer needs to build its scope picker. */
export type ComposerPlaza = {
  id: string;
  name: string;
  project?: { id: string; name: string } | null;
};

export type ViewKey = "tasks" | "portfolio" | "insights";
export type GroupBy =
  | "priority"
  | "status"
  | "due"
  | "project"
  | "department"
  | "level";

export type TaskFilters = {
  /** Empty array = every priority. */
  priorities: MgmtPriority[];
  /** Empty array = every status. */
  statuses: MgmtStatus[];
  overdue: boolean;
  dueWeek: boolean;
  unassigned: boolean;
  mine: boolean;
  q: string;
  /** Scope keys (`project:<id>`, `plaza:<id>`, `department:<id>`, `head-office`). */
  scopes: string[];
  assigneeId: string | null;
};

export const EMPTY_FILTERS: TaskFilters = {
  priorities: [],
  statuses: [],
  overdue: false,
  dueWeek: false,
  unassigned: false,
  mine: false,
  q: "",
  scopes: [],
  assigneeId: null,
};

export type FacetCounts = {
  all: number;
  high: number;
  medium: number;
  low: number;
  overdue: number;
  blocked: number;
  unassigned: number;
  mine: number;
  dueWeek: number;
  headOffice: number;
};

export type TaskGroup = {
  key: string;
  label: string;
  hint?: string;
  tone: string;
  tasks: MgmtTask[];
  collapsedByDefault?: boolean;
};

export const STATUS_ORDER: MgmtStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
];

export const PRIORITY_ORDER: MgmtPriority[] = ["HIGH", "MEDIUM", "LOW"];

export const STATUS_LABELS: Record<MgmtStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

export const STATUS_TONES: Record<MgmtStatus, string> = {
  TODO: "todo",
  IN_PROGRESS: "inprogress",
  BLOCKED: "blocked",
  COMPLETED: "completed",
};

export const PRIORITY_LABELS: Record<MgmtPriority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Lower rank sorts first. */
export const PRIORITY_RANK: Record<MgmtPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/** Mirrors `lib/transitions.ts`; COMPLETED exits only through /reopen. */
export const ALLOWED_TRANSITIONS: Record<MgmtStatus, MgmtStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "COMPLETED"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED", "TODO"],
  BLOCKED: ["IN_PROGRESS", "TODO", "COMPLETED"],
  COMPLETED: [],
};

export const ROUND_ORDER = ["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"] as const;
export type RoundKey = (typeof ROUND_ORDER)[number];

export const ROUND_LABELS: Record<RoundKey, string> = {
  ROUND_1: "Round 1",
  ROUND_2: "Round 2",
  ROUND_3: "Round 3",
  ROUND_4: "Round 4",
};

export function statusOf(task: MgmtTask): MgmtStatus {
  return (STATUS_ORDER as string[]).includes(task.status)
    ? (task.status as MgmtStatus)
    : "TODO";
}

export function priorityOf(task: MgmtTask): MgmtPriority {
  return (PRIORITY_ORDER as string[]).includes(task.priority)
    ? (task.priority as MgmtPriority)
    : "MEDIUM";
}

export function isCompleted(task: MgmtTask): boolean {
  return task.status === "COMPLETED";
}

/** UTC midnight today, matching `lib/format.isOverdue`. */
function todayStart(today: Date): number {
  const start = new Date(today);
  start.setUTCHours(0, 0, 0, 0);
  return start.getTime();
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

/** Due urgency for open tasks. Completed tasks report "none". */
export function dueBucket(task: MgmtTask, today = new Date()): DueBucket {
  if (isCompleted(task) || !task.dueDate) return "none";
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return "none";
  const dueDay = new Date(due);
  dueDay.setUTCHours(0, 0, 0, 0);
  const start = todayStart(today);
  if (dueDay.getTime() < start) return "overdue";
  if (dueDay.getTime() === start) return "today";
  if (dueDay.getTime() <= start + 7 * 86_400_000) return "week";
  return "later";
}

export function projectNameOf(task: MgmtTask): string {
  return (
    task.project?.name ??
    task.plaza?.project?.name ??
    (isHeadOfficeTask(task) ? "Head Office" : "Project")
  );
}

export function projectIdOf(task: MgmtTask): string | null {
  return task.project?.id ?? task.plaza?.project?.id ?? task.projectId ?? null;
}

export function departmentIdOf(task: MgmtTask): string | null {
  return task.department?.id ?? task.departmentId ?? null;
}

export function departmentNameOf(task: MgmtTask): string | null {
  return task.department?.name ?? null;
}

/** Head Office tasks have a department, or no project at all. */
export function isHeadOfficeTask(task: MgmtTask): boolean {
  return departmentIdOf(task) !== null || projectIdOf(task) === null;
}

/** The three scope columns, normalised from the payload's nested relations. */
export function scopeFieldsOf(task: MgmtTask): TaskScopeFields {
  return {
    projectId: projectIdOf(task),
    plazaId: plazaIdOf(task),
    departmentId: departmentIdOf(task),
  };
}

function plazaIdOf(task: MgmtTask): string | null {
  return task.plaza?.id ?? task.plazaId ?? null;
}

/** Stable scope key for a task, matching `lib/task-scope`. */
export function scopeKeyOfTask(task: MgmtTask): string {
  const ref = scopeRefOf(scopeFieldsOf(task));
  return ref ? scopeKey(ref) : "head-office";
}

/** Free-text haystack used by search and the current filters. */
function haystack(task: MgmtTask): string {
  return [
    task.title,
    task.description ?? "",
    task.plaza?.name ?? "",
    task.plaza?.state ?? "",
    projectNameOf(task),
    task.project?.acronym ?? "",
    task.project?.company?.name ?? "",
    task.project?.company?.code ?? "",
    task.department?.name ?? "",
    task.department?.code ?? "",
    // Location words: the scope picker's own vocabulary.
    ...(isHeadOfficeTask(task) ? ["head office"] : []),
    task.category?.name ?? "",
    task.assignee?.name ?? "",
    statusOf(task),
    priorityOf(task),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Project, department, assignee and text scope. Facet counts are computed over
 * this set so chips never show numbers for rows a scope filter has excluded.
 * Multiple scopes combine with OR.
 */
export function scopeTasks(
  tasks: MgmtTask[],
  filters: TaskFilters,
): MgmtTask[] {
  const q = filters.q.trim().toLowerCase();
  const refs: ScopeRef[] = filters.scopes
    .map((key) => parseScopeKey(key))
    .filter((ref): ref is ScopeRef => ref !== null);

  return tasks.filter((task) => {
    if (refs.length > 0) {
      const fields = scopeFieldsOf(task);
      if (!refs.some((ref) => taskMatchesScope(fields, ref))) return false;
    }
    if (filters.assigneeId && task.assignee?.id !== filters.assigneeId) {
      return false;
    }
    if (q && !haystack(task).includes(q)) return false;
    return true;
  });
}

/** True when any filter is on (scope/assignee included). */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.priorities.length > 0 ||
    filters.statuses.length > 0 ||
    filters.overdue ||
    filters.dueWeek ||
    filters.unassigned ||
    filters.mine ||
    filters.q.trim().length > 0 ||
    filters.scopes.length > 0 ||
    filters.assigneeId !== null
  );
}

/** Count only the facet filters (ignores project/assignee/text scope). */
export function hasActiveFacets(filters: TaskFilters): boolean {
  return (
    filters.priorities.length > 0 ||
    filters.statuses.length > 0 ||
    filters.overdue ||
    filters.dueWeek ||
    filters.unassigned ||
    filters.mine
  );
}

/**
 * Facet filters. Completed tasks stay out of open-work counts, and a filter
 * such as "High" hides completed high tasks unless COMPLETED is explicitly
 * selected in the status facet.
 */
export function filterTasks(
  tasks: MgmtTask[],
  filters: TaskFilters,
  userId: string,
): MgmtTask[] {
  const scoped = scopeTasks(tasks, filters);
  const wantsCompleted = filters.statuses.includes("COMPLETED");
  const openOnlySignal =
    filters.priorities.length > 0 ||
    filters.overdue ||
    filters.dueWeek ||
    filters.unassigned ||
    filters.mine;

  return scoped.filter((task) => {
    const status = statusOf(task);
    const priority = priorityOf(task);

    if (
      isCompleted(task) &&
      openOnlySignal &&
      !wantsCompleted
    ) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(status)) {
      return false;
    }
    if (
      filters.priorities.length > 0 &&
      !filters.priorities.includes(priority)
    ) {
      return false;
    }
    if (filters.mine && task.assignee?.id !== userId) return false;
    if (filters.unassigned && task.assignee) return false;
    if (filters.overdue && !isOverdue(task.dueDate, task.status)) return false;
    if (filters.dueWeek) {
      const bucket = dueBucket(task);
      if (bucket !== "today" && bucket !== "week") return false;
    }
    return true;
  });
}

/** Overdue first, then soonest due, then priority, then most recently touched. */
export function sortTasks(a: MgmtTask, b: MgmtTask): number {
  const lateDelta =
    Number(isOverdue(b.dueDate, b.status)) -
    Number(isOverdue(a.dueDate, a.status));
  if (lateDelta) return lateDelta;

  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  const rankDelta =
    PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)];
  if (rankDelta) return rankDelta;

  return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
}

function groupHint(tasks: MgmtTask[]): string | undefined {
  if (tasks.length === 0) return undefined;
  const overdue = tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;
  const blocked = tasks.filter((t) => statusOf(t) === "BLOCKED").length;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (blocked) parts.push(`${blocked} blocked`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function completedLane(tasks: MgmtTask[]): TaskGroup {
  return {
    key: "completed",
    label: STATUS_LABELS.COMPLETED,
    tone: "completed",
    tasks: tasks.sort((a, b) =>
      String(b.completedAt ?? b.updatedAt ?? "").localeCompare(
        String(a.completedAt ?? a.updatedAt ?? ""),
      ),
    ),
    collapsedByDefault: true,
  };
}

/**
 * Segregate tasks into lanes. Every grouping keeps completed work in its own
 * final lane so open work is never diluted; status grouping uses Completed as
 * the fourth natural lane.
 */
export function groupTasks(
  tasks: MgmtTask[],
  groupBy: GroupBy,
): TaskGroup[] {
  const open = tasks.filter((task) => !isCompleted(task));
  const completed = tasks.filter(isCompleted);
  const groups: TaskGroup[] = [];

  if (groupBy === "priority") {
    for (const priority of PRIORITY_ORDER) {
      const rows = open
        .filter((task) => priorityOf(task) === priority)
        .sort(sortTasks);
      if (rows.length === 0) continue;
      groups.push({
        key: `priority:${priority}`,
        label: PRIORITY_LABELS[priority],
        tone: priority.toLowerCase(),
        hint: groupHint(rows),
        tasks: rows,
      });
    }
  } else if (groupBy === "status") {
    for (const status of STATUS_ORDER) {
      const rows = tasks
        .filter((task) => statusOf(task) === status)
        .sort(sortTasks);
      if (rows.length === 0) continue;
      groups.push({
        key: `status:${status}`,
        label: STATUS_LABELS[status],
        tone: STATUS_TONES[status],
        hint: status === "COMPLETED" ? undefined : groupHint(rows),
        tasks: rows,
        collapsedByDefault: status === "COMPLETED",
      });
    }
    return groups;
  } else if (groupBy === "due") {
    const buckets: { key: DueBucket; label: string }[] = [
      { key: "overdue", label: "Overdue" },
      { key: "today", label: "Due today" },
      { key: "week", label: "Next 7 days" },
      { key: "later", label: "Later" },
      { key: "none", label: "No due date" },
    ];
    for (const bucket of buckets) {
      const rows = open.filter((task) => dueBucket(task) === bucket.key).sort(sortTasks);
      if (rows.length === 0) continue;
      groups.push({
        key: `due:${bucket.key}`,
        label: bucket.label,
        tone:
          bucket.key === "overdue"
            ? "overdue"
            : bucket.key === "today"
              ? "high"
              : bucket.key === "week"
                ? "inprogress"
                : "todo",
        hint: groupHint(rows),
        tasks: rows,
      });
    }
  } else if (groupBy === "project") {
    const byProject = new Map<
      string,
      { name: string; tasks: MgmtTask[] }
    >();
    const headOffice: MgmtTask[] = [];
    for (const task of open) {
      if (isHeadOfficeTask(task)) {
        headOffice.push(task);
        continue;
      }
      const id = projectIdOf(task) ?? "unknown";
      const entry = byProject.get(id) ?? { name: projectNameOf(task), tasks: [] };
      entry.tasks.push(task);
      byProject.set(id, entry);
    }
    const ordered = Array.from(byProject.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
    for (const [id, entry] of ordered) {
      const rows = entry.tasks.sort(sortTasks);
      groups.push({
        key: `project:${id}`,
        label: entry.name,
        tone: "project",
        hint: groupHint(rows),
        tasks: rows,
      });
    }
    if (headOffice.length > 0) {
      const rows = headOffice.sort(sortTasks);
      groups.push({
        key: "project:head-office",
        label: "Head Office",
        tone: "project",
        hint: groupHint(rows),
        tasks: rows,
      });
    }
  } else if (groupBy === "department") {
    const byDepartment = new Map<
      string,
      { name: string; tasks: MgmtTask[] }
    >();
    const projects: MgmtTask[] = [];
    for (const task of open) {
      if (!isHeadOfficeTask(task)) {
        projects.push(task);
        continue;
      }
      const name = departmentNameOf(task) ?? "Head Office";
      const id = departmentIdOf(task) ?? name;
      const entry = byDepartment.get(id) ?? { name, tasks: [] };
      entry.tasks.push(task);
      byDepartment.set(id, entry);
    }
    const ordered = Array.from(byDepartment.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
    for (const [id, entry] of ordered) {
      const rows = entry.tasks.sort(sortTasks);
      groups.push({
        key: `department:${id}`,
        label: entry.name,
        tone: "project",
        hint: groupHint(rows),
        tasks: rows,
      });
    }
    if (projects.length > 0) {
      const rows = projects.sort(sortTasks);
      groups.push({
        key: "department:projects",
        label: "Projects",
        tone: "project",
        hint: groupHint(rows),
        tasks: rows,
      });
    }
  } else if (groupBy === "level") {
    const plazaLevel = open
      .filter((task) => !isHeadOfficeTask(task) && plazaIdOf(task) !== null)
      .sort(sortTasks);
    const projectLevel = open
      .filter((task) => !isHeadOfficeTask(task) && plazaIdOf(task) === null)
      .sort(sortTasks);
    const departmentLevel = open
      .filter((task) => isHeadOfficeTask(task) && departmentIdOf(task) !== null)
      .sort(sortTasks);
    const headOfficeLevel = open
      .filter((task) => isHeadOfficeTask(task) && departmentIdOf(task) === null)
      .sort(sortTasks);
    if (plazaLevel.length > 0) {
      groups.push({
        key: "level:plaza",
        label: "Plaza-level",
        tone: "inprogress",
        hint: groupHint(plazaLevel),
        tasks: plazaLevel,
      });
    }
    if (projectLevel.length > 0) {
      groups.push({
        key: "level:project",
        label: "Project-level",
        tone: "todo",
        hint: groupHint(projectLevel),
        tasks: projectLevel,
      });
    }
    if (departmentLevel.length > 0) {
      groups.push({
        key: "level:department",
        label: "Department-level",
        tone: "project",
        hint: groupHint(departmentLevel),
        tasks: departmentLevel,
      });
    }
    if (headOfficeLevel.length > 0) {
      groups.push({
        key: "level:head-office",
        label: "Head Office-level",
        tone: "project",
        hint: groupHint(headOfficeLevel),
        tasks: headOfficeLevel,
      });
    }
  }

  if (completed.length > 0) groups.push(completedLane(completed));
  return groups;
}

/** Counts for the facet strip. Scoped by scope/assignee/text only. */
export function countFacets(
  tasks: MgmtTask[],
  filters: TaskFilters,
  userId: string,
): FacetCounts {
  const scoped = scopeTasks(tasks, filters);
  const open = scoped.filter((task) => !isCompleted(task));
  return {
    all: scoped.length,
    high: open.filter((task) => priorityOf(task) === "HIGH").length,
    medium: open.filter((task) => priorityOf(task) === "MEDIUM").length,
    low: open.filter((task) => priorityOf(task) === "LOW").length,
    overdue: open.filter((task) => isOverdue(task.dueDate, task.status)).length,
    blocked: open.filter((task) => statusOf(task) === "BLOCKED").length,
    unassigned: open.filter((task) => !task.assignee).length,
    mine: open.filter((task) => task.assignee?.id === userId).length,
    headOffice: open.filter(isHeadOfficeTask).length,
    dueWeek: open.filter((task) => {
      const bucket = dueBucket(task);
      return bucket === "today" || bucket === "week";
    }).length,
  };
}

/** Status counts used by the Insights view (all tasks, completed included). */
export function countStatuses(tasks: MgmtTask[]): Record<MgmtStatus, number> {
  const counts: Record<MgmtStatus, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    COMPLETED: 0,
  };
  for (const task of tasks) counts[statusOf(task)] += 1;
  return counts;
}

/** Round label for a project, or null when it has no round. */
export function roundOf(task: MgmtTask): RoundKey | null {
  const round = task.project?.round;
  if (!round) return null;
  return (ROUND_ORDER as readonly string[]).includes(round)
    ? (round as RoundKey)
    : null;
}
