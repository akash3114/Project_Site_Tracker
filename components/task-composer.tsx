"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { AssigneeOption, CategoryOption } from "@/components/task-filters";
import type { AssigneeCandidate } from "@/lib/assignee-groups";
import { AssigneePicker } from "@/components/management/assignee-picker";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

type PlazaOption = {
  id: string;
  name: string;
  project?: { id: string; name: string } | null;
};

type ProjectOption = {
  id: string;
  name: string;
  plazas: PlazaOption[];
};

type Scope =
  | { kind: "plaza"; plazaId: string; projectId: string | null }
  | { kind: "project"; projectId: string };

type OwnerSource = {
  plaza?: { id: string } | null;
  projectId?: string | null;
  project?: { id: string } | null;
  assignee?: { id: string; name: string } | null;
};

const EMPTY_TASKS: OwnerSource[] = [];
const EMPTY_CATEGORIES: CategoryOption[] = [];

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

function parseScope(
  value: string,
  projects: ProjectOption[],
  plazas: PlazaOption[],
): Scope | null {
  const separator = value.indexOf(":");
  if (separator === -1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (kind === "project") {
    return projects.some((project) => project.id === id)
      ? { kind: "project", projectId: id }
      : null;
  }
  if (kind === "plaza") {
    const plaza = plazas.find((entry) => entry.id === id);
    if (!plaza) return null;
    return { kind: "plaza", plazaId: plaza.id, projectId: plaza.project?.id ?? null };
  }
  return null;
}

/** Assignees already visible on tasks in the selected scope. */
function deriveAssignees(scope: Scope, tasks: OwnerSource[]): AssigneeCandidate[] {
  const seen = new Map<string, string>();
  for (const task of tasks) {
    if (!task.assignee?.id || !task.assignee.name) continue;
    const matches =
      scope.kind === "plaza"
        ? task.plaza?.id === scope.plazaId
        : (task.projectId ?? task.project?.id) === scope.projectId;
    if (matches) seen.set(task.assignee.id, task.assignee.name);
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

/**
 * Inline task composer, shared by the role dashboards and the plaza page.
 *
 * A task belongs to a project and optionally to one of its plazas. The scope
 * picker therefore lists projects first: each project offers "Project-level"
 * plus its plazas. On the plaza page the scope is fixed and hidden.
 *
 * Assignees come from GET /api/assignees (already filtered by the assignment
 * ceiling); manager accounts cannot list the user directory, so the fallback
 * is the assignees already visible on tasks in that scope.
 */
export function TaskComposer({
  plazas,
  fixedPlazaId,
  tasks,
  assignees: resolvedAssignees,
  categories: resolvedCategories,
  onCreated,
  variant = "cockpit",
}: {
  /** Plazas this account may file against. Omit when the plaza is fixed. */
  plazas?: PlazaOption[];
  /** Set on the plaza page: the plaza is known, so its field is hidden. */
  fixedPlazaId?: string;
  /** Used to derive owner options when the assignee lookup is out of reach. */
  tasks?: OwnerSource[];
  /** Pre-resolved owner options; used when the assignee lookup fails. */
  assignees?: AssigneeOption[];
  /** Pre-resolved active categories; skips the lookup when supplied. */
  categories?: CategoryOption[];
  onCreated: () => void;
  variant?: "cockpit" | "page";
}) {
  const plazaOptions = useMemo(() => plazas ?? [], [plazas]);
  const taskSource = tasks ?? EMPTY_TASKS;

  const projects = useMemo(() => {
    const byId = new Map<string, ProjectOption>();
    for (const plaza of plazaOptions) {
      if (!plaza.project?.id) continue;
      const project =
        byId.get(plaza.project.id) ??
        ({ id: plaza.project.id, name: plaza.project.name, plazas: [] } as ProjectOption);
      project.plazas.push(plaza);
      byId.set(project.id, project);
    }
    return Array.from(byId.values());
  }, [plazaOptions]);

  const orphanPlazas = useMemo(
    () => plazaOptions.filter((plaza) => !plaza.project?.id),
    [plazaOptions],
  );

  const [scopeValue, setScopeValue] = useState(() =>
    fixedPlazaId ? `plaza:${fixedPlazaId}` : "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [priority, setPriority] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeCandidate[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [fetchedCategories, setFetchedCategories] =
    useState<CategoryOption[]>(EMPTY_CATEGORIES);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const ownerCache = useRef(new Map<string, AssigneeCandidate[]>());

  const scope = useMemo<Scope | null>(() => {
    const parsed = parseScope(scopeValue, projects, plazaOptions);
    if (parsed) return parsed;
    // Backward-compatible fallback: a fixed plaza can render before the plaza
    // list resolves; POST by plazaId alone is valid.
    if (fixedPlazaId) {
      const plaza = plazaOptions.find((entry) => entry.id === fixedPlazaId);
      return {
        kind: "plaza",
        plazaId: fixedPlazaId,
        projectId: plaza?.project?.id ?? null,
      };
    }
    return null;
  }, [scopeValue, projects, plazaOptions, fixedPlazaId]);

  const scopeKind = scope?.kind ?? null;
  const scopePlazaId = scope?.kind === "plaza" ? scope.plazaId : null;
  const scopeProjectId = scope?.projectId ?? null;
  // A plaza belongs to a project team, so the picker groups it as a project.
  const pickerScopeKind: "project" | null = scope ? "project" : null;

  // A single-plaza scope preselects itself so the bar posts in one move.
  useEffect(() => {
    if (fixedPlazaId || scopeValue) return;
    if (plazaOptions.length === 1) setScopeValue(`plaza:${plazaOptions[0].id}`);
  }, [fixedPlazaId, plazaOptions, scopeValue]);

  // Best effort: the viewer's id powers the pinned "Assign to me" row.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/users/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          id?: string;
        } | null;
        if (!cancelled && data?.id) setViewerId(data.id);
      } catch {
        // Non-fatal: the picker simply has no pinned self row.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Active categories for the optional category select.
  useEffect(() => {
    if (resolvedCategories) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<CategoryOption[]>("/api/categories");
        if (!cancelled) {
          setFetchedCategories(Array.isArray(data) ? data : EMPTY_CATEGORIES);
        }
      } catch {
        // Non-admins still see active categories; on failure hide the field.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedCategories]);

  const categoryOptions = useMemo(
    () =>
      (resolvedCategories ?? fetchedCategories).filter(
        (category) => category.active !== false,
      ),
    [resolvedCategories, fetchedCategories],
  );

  useEffect(() => {
    if (!scopeKind) {
      setAssigneeOptions([]);
      return;
    }
    const current: Scope =
      scopeKind === "plaza"
        ? { kind: "plaza", plazaId: scopePlazaId ?? "", projectId: scopeProjectId }
        : { kind: "project", projectId: scopeProjectId ?? "" };
    const cacheKey =
      current.kind === "plaza"
        ? `plaza:${current.plazaId}:${current.projectId ?? ""}`
        : `project:${current.projectId}`;
    const cached = ownerCache.current.get(cacheKey);
    if (cached) {
      setAssigneeOptions(cached);
      return;
    }

    let cancelled = false;
    void (async () => {
      let list: AssigneeCandidate[] | null = null;
      if (current.projectId) {
        try {
          const params = new URLSearchParams({ projectId: current.projectId });
          if (current.kind === "plaza") params.set("plazaId", current.plazaId);
          const data = await fetchJson<AssigneeCandidate[]>(
            `/api/assignees?${params.toString()}`,
          );
          list = Array.isArray(data) ? data : [];
        } catch {
          list = null;
        }
      }
      if (list === null) {
        list =
          fixedPlazaId && resolvedAssignees && resolvedAssignees.length > 0
            ? resolvedAssignees
            : deriveAssignees(current, taskSource);
      }
      ownerCache.current.set(cacheKey, list);
      if (!cancelled) setAssigneeOptions(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    scopeKind,
    scopePlazaId,
    scopeProjectId,
    fixedPlazaId,
    resolvedAssignees,
    taskSource,
  ]);

  // The success line is a receipt, not a log — retire it on its own.
  useEffect(() => {
    if (alert?.tone !== "ok") return;
    const timer = window.setTimeout(() => setAlert(null), 4000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  const ready = scope !== null && title.trim().length >= 3 && !saving;
  const submitHint = !scope
    ? "Choose a project or plaza first"
    : title.trim().length < 3
      ? "A task title needs at least 3 characters"
      : "Create task";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !scope) return;
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    setSaving(true);
    setAlert(null);
    const body: Record<string, unknown> = { title: cleanTitle };
    if (scope.kind === "plaza") body.plazaId = scope.plazaId;
    else body.projectId = scope.projectId;
    if (cleanDescription) body.description = cleanDescription;
    body.priority = priority || "MEDIUM";
    if (categoryId) body.categoryId = categoryId;
    if (dueDate) body.dueDate = dueDate;
    if (assigneeId) body.assigneeId = assigneeId;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAlert({
          tone: "error",
          text:
            (data as { error?: string } | null)?.error ??
            `Create failed (${res.status})`,
        });
        return;
      }
      setTitle("");
      setDescription("");
      setPriority("");
      setCategoryId("");
      setDueDate("");
      setAssigneeId("");
      setAlert({ tone: "ok", text: `Added “${cleanTitle}”.` });
      onCreated();
    } catch {
      setAlert({ tone: "error", text: "Network error creating task" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="cockpit-composer-form"
      onSubmit={submit}
      aria-label="New task"
      data-variant={variant}
    >
      <div className="cockpit-composer">
        {fixedPlazaId ? null : (
          <select
            className="cockpit-composer-plaza"
            aria-label="Project or plaza"
            value={scopeValue}
            disabled={plazaOptions.length === 0}
            onChange={(event) => {
              setScopeValue(event.target.value);
              setAssigneeId("");
            }}
          >
            <option value="">Project or plaza</option>
            {projects.map((project) => (
              <optgroup key={project.id} label={project.name}>
                <option value={`project:${project.id}`}>Project-level</option>
                {project.plazas.map((plaza) => (
                  <option key={plaza.id} value={`plaza:${plaza.id}`}>
                    {plaza.name}
                  </option>
                ))}
              </optgroup>
            ))}
            {orphanPlazas.length > 0 ? (
              <optgroup label="Plazas">
                {orphanPlazas.map((plaza) => (
                  <option key={plaza.id} value={`plaza:${plaza.id}`}>
                    {plaza.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        )}
        <input
          className="cockpit-composer-title"
          aria-label="Task title"
          placeholder="Task title"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select
          className="cockpit-composer-priority"
          aria-label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0] + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {categoryOptions.length > 0 ? (
          <select
            className="flex-[1_1_150px] md:flex-[0_1_150px]"
            aria-label="Category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Category</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          className="cockpit-composer-date"
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <AssigneePicker
          compact
          className="cockpit-composer-assignee"
          candidates={assigneeOptions}
          value={assigneeId || null}
          onChange={(id) => setAssigneeId(id ?? "")}
          disabled={!scope}
          scopeKind={pickerScopeKind}
          viewerId={viewerId}
          placeholder="Assignee"
        />
        <button
          type="button"
          className="cockpit-composer-toggle"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? "Hide details" : "Add details"}
        </button>
        <button
          type="submit"
          className="cockpit-composer-submit"
          disabled={!ready}
          aria-label="Create task"
          title={submitHint}
        >
          +
        </button>
        {detailsOpen ? (
          <textarea
            className="cockpit-composer-description"
            aria-label="Description"
            placeholder="Description (optional)"
            rows={2}
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ) : null}
      </div>
      {alert ? (
        <p
          className="cockpit-composer-alert"
          data-tone={alert.tone}
          role={alert.tone === "error" ? "alert" : "status"}
        >
          {alert.text}
        </p>
      ) : null}
    </form>
  );
}
