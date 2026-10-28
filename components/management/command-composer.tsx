"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { AssigneeCandidate } from "@/lib/assignee-groups";
import type {
  ComposerPlaza,
  MgmtDepartment,
  MgmtPriority,
  MgmtProject,
  MgmtTask,
} from "@/lib/management";
import { parseScopeKey } from "@/lib/task-scope";

import { AssigneePicker } from "./assignee-picker";
import { ScopePicker, scopeSummary } from "./scope-picker";

type CategoryOption = { id: string; name: string; active?: boolean };

type CreateResponse = Partial<MgmtTask> & {
  items?: MgmtTask[];
  error?: string;
};

const PRIORITIES: MgmtPriority[] = ["LOW", "MEDIUM", "HIGH"];
const PRIORITY_LABELS: Record<MgmtPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

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

/** `1 task`, `2 tasks`. */
function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/**
 * A scope key as the batch-create body expects it. Head Office level is an
 * empty object because both `projectId` and `departmentId` stay unset.
 */
function toScopeInput(key: string): Record<string, string> {
  const ref = parseScopeKey(key);
  if (!ref || ref.kind === "head-office") return {};
  if (ref.kind === "department") return { departmentId: ref.id };
  if (ref.kind === "project") return { projectId: ref.id };
  return { plazaId: ref.id };
}

/**
 * The management command bar. One or more scopes are chosen first, then a
 * single submit creates one task per scope. A successful create keeps every
 * field except the title and description so repeat filing is fast.
 */
export function CommandComposer({
  projects,
  plazas,
  departments: providedDepartments,
  onCreated,
  focusSignal,
}: {
  /** Every accessible project, including ones with no plazas yet. */
  projects: MgmtProject[];
  plazas: ComposerPlaza[];
  /** Departments from the workspace catalogue; the composer fetches when absent. */
  departments?: MgmtDepartment[];
  onCreated: (task: MgmtTask) => void;
  focusSignal?: number;
}) {
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [fetchedDepartments, setFetchedDepartments] = useState<
    MgmtDepartment[]
  >([]);
  const departments = providedDepartments ?? fetchedDepartments;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [priority, setPriority] = useState<MgmtPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<AssigneeCandidate[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [alert, setAlert] = useState<{
    tone: "error" | "ok";
    text: string;
  } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const ownerCache = useRef(new Map<string, AssigneeCandidate[]>());

  useEffect(() => {
    if (!focusSignal) return;
    titleRef.current?.focus();
  }, [focusSignal]);

  // Departments are only available to Admin/Head Office; this page is theirs.
  // The workspace passes them in, so only fall back to a fetch for other callers.
  useEffect(() => {
    if (providedDepartments) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<MgmtDepartment[]>("/api/departments");
        if (!cancelled) {
          setFetchedDepartments(Array.isArray(data) ? data : []);
        }
      } catch {
        // Without departments the picker still offers Head Office and projects.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providedDepartments]);

  // The assignee payload does not expose the viewer; "Assign to me" needs it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<{ id?: string }>("/api/users/me");
        if (!cancelled && data?.id) setViewerId(data.id);
      } catch {
        // A convenience pin only; the picker works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<CategoryOption[]>("/api/categories");
        if (!cancelled) {
          setCategories(
            (Array.isArray(data) ? data : []).filter(
              (category) => category.active !== false,
            ),
          );
        }
      } catch {
        // Non-admins still get active categories; hide the select on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (alert?.tone !== "ok") return;
    const timer = window.setTimeout(() => setAlert(null), 4000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  const singleRef = useMemo(
    () =>
      selectedScopes.length === 1
        ? parseScopeKey(selectedScopes[0])
        : null,
    [selectedScopes],
  );

  const plazaProjectId = useMemo(() => {
    if (singleRef?.kind !== "plaza") return null;
    return (
      plazas.find((plaza) => plaza.id === singleRef.id)?.project?.id ?? null
    );
  }, [plazas, singleRef]);

  const assigneeKey = useMemo(() => {
    if (!singleRef) return null;
    if (singleRef.kind === "head-office") return "head-office";
    if (singleRef.kind === "department") return `department:${singleRef.id}`;
    if (singleRef.kind === "project") return `project:${singleRef.id}`;
    return plazaProjectId ? `plaza:${singleRef.id}` : null;
  }, [singleRef, plazaProjectId]);

  const assigneeScopeKind: "project" | "department" | null = useMemo(() => {
    if (!singleRef) return null;
    return singleRef.kind === "head-office" || singleRef.kind === "department"
      ? "department"
      : "project";
  }, [singleRef]);

  // People are scope-specific, so the assignee is only offered when exactly one
  // scope is selected. A different scope invalidates the previous choice.
  useEffect(() => {
    setAssigneeId(null);

    if (!assigneeKey || !singleRef) {
      setAssignees([]);
      setAssigneesLoading(false);
      return;
    }

    const cached = ownerCache.current.get(assigneeKey);
    if (cached) {
      setAssignees(cached);
      setAssigneesLoading(false);
      return;
    }

    const params = new URLSearchParams();
    if (singleRef.kind === "head-office") {
      params.set("headOffice", "true");
    } else if (singleRef.kind === "department") {
      params.set("departmentId", singleRef.id);
    } else if (singleRef.kind === "project") {
      params.set("projectId", singleRef.id);
    } else if (singleRef.kind === "plaza") {
      if (!plazaProjectId) {
        setAssignees([]);
        setAssigneesLoading(false);
        return;
      }
      params.set("projectId", plazaProjectId);
      params.set("plazaId", singleRef.id);
    }

    // Never offer the previous scope's people against the new one.
    setAssignees([]);
    setAssigneesLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<AssigneeCandidate[]>(
          `/api/assignees?${params.toString()}`,
        );
        const rows = Array.isArray(data) ? data : [];
        ownerCache.current.set(assigneeKey, rows);
        if (!cancelled) setAssignees(rows);
      } catch {
        if (!cancelled) setAssignees([]);
      } finally {
        if (!cancelled) setAssigneesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assigneeKey, plazaProjectId, singleRef]);

  function onPriorityKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = PRIORITIES.indexOf(priority);
    let next = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + PRIORITIES.length) % PRIORITIES.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % PRIORITIES.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = PRIORITIES.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setPriority(PRIORITIES[next]);
    priorityRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }

  const scopeCount = selectedScopes.length;
  const summary = scopeSummary(selectedScopes);
  const summaryText =
    scopeCount === 0
      ? "Choose one or more scopes"
      : [
          `Creates ${plural(summary.tasks, "task")}`,
          summary.projects > 0 ? plural(summary.projects, "project") : null,
          summary.plazas > 0 ? plural(summary.plazas, "plaza") : null,
          summary.departments > 0
            ? plural(summary.departments, "department")
            : null,
          summary.headOffice > 0 ? "Head Office" : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const ready = scopeCount > 0 && title.trim().length >= 3 && pending === 0;
  const submitHint =
    scopeCount === 0
      ? "Choose one or more scopes first"
      : title.trim().length < 3
        ? "A task title needs at least 3 characters"
        : scopeCount === 1
          ? "Add task (Enter)"
          : `Add ${scopeCount} tasks (Enter)`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const submittedScopes = [...selectedScopes];

    // Clear the draft before the round trip: the next task can be typed while
    // this one saves, and a late response must not erase it.
    setTitle("");
    if (cleanDescription) {
      setDescription("");
      setDescriptionOpen(false);
    }
    setPending((count) => count + 1);
    setAlert(null);

    const restoreDraft = () => {
      setTitle((current) => (current.trim() === "" ? cleanTitle : current));
      if (cleanDescription) {
        setDescription((current) =>
          current.trim() === "" ? cleanDescription : current,
        );
        setDescriptionOpen(true);
      }
    };

    const body: Record<string, unknown> = {
      title: cleanTitle,
      priority,
    };

    if (submittedScopes.length === 1) {
      const ref = parseScopeKey(submittedScopes[0]);
      if (ref?.kind === "project") body.projectId = ref.id;
      else if (ref?.kind === "plaza") body.plazaId = ref.id;
      else if (ref?.kind === "department") body.departmentId = ref.id;
      // Head Office level sends no scope fields at all.
    } else {
      body.scopes = submittedScopes.map(toScopeInput);
    }

    if (cleanDescription) body.description = cleanDescription;
    if (dueDate) body.dueDate = dueDate;
    if (assigneeId) body.assigneeId = assigneeId;
    if (categoryId) body.categoryId = categoryId;

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | CreateResponse
        | null;
      if (!response.ok) {
        restoreDraft();
        setAlert({
          tone: "error",
          text: data?.error ?? `Create failed (${response.status})`,
        });
        return;
      }

      const items: MgmtTask[] =
        data && Array.isArray(data.items)
          ? data.items
          : data && typeof data.id === "string"
            ? [data as MgmtTask]
            : [];
      if (items.length === 0) {
        restoreDraft();
        setAlert({ tone: "error", text: "Create failed (empty response)" });
        return;
      }

      for (const item of items) onCreated(item);
      setAlert({
        tone: "ok",
        text:
          items.length === 1
            ? `Added “${cleanTitle}”.`
            : `Added ${items.length} tasks.`,
      });
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch {
      restoreDraft();
      setAlert({ tone: "error", text: "Network error creating task" });
    } finally {
      setPending((count) => Math.max(0, count - 1));
    }
  }

  return (
    <form
      className="mgmt-composer"
      onSubmit={submit}
      aria-label="New task"
      aria-busy={pending > 0}
    >
      <div className="mgmt-composer-top">
        <ScopePicker
          projects={projects}
          plazas={plazas}
          departments={departments}
          value={selectedScopes}
          onChange={setSelectedScopes}
          mode="create"
          className="mgmt-scope-picker"
        />

        <input
          ref={titleRef}
          className="mgmt-composer-title"
          aria-label="Task title"
          placeholder="What needs doing?"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div
          ref={priorityRef}
          className="mgmt-priority"
          role="radiogroup"
          aria-label="Priority"
          onKeyDown={onPriorityKeyDown}
        >
          {PRIORITIES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={priority === value}
              tabIndex={priority === value ? 0 : -1}
              data-priority={value}
              className="mgmt-priority-option"
              onClick={() => setPriority(value)}
            >
              {PRIORITY_LABELS[value]}
            </button>
          ))}
        </div>

        <button
          type="submit"
          className="mgmt-composer-add"
          disabled={!ready}
          title={submitHint}
        >
          {scopeCount > 1 ? `Add ${scopeCount} tasks` : "Add task"}
        </button>
      </div>

      <p className="mgmt-composer-scope-summary">{summaryText}</p>

      <div className="mgmt-composer-meta">
        <label className="mgmt-composer-field">
          <span>Due</span>
          <input
            className="mgmt-composer-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>

        <div className="mgmt-composer-field">
          <span>Assignee</span>
          <AssigneePicker
            candidates={assignees}
            value={assigneeId}
            onChange={setAssigneeId}
            loading={assigneesLoading}
            disabled={scopeCount !== 1}
            scopeKind={assigneeScopeKind}
            viewerId={viewerId}
            compact
          />
        </div>

        {scopeCount > 1 ? (
          <span className="mgmt-composer-note">
            Pick one scope to assign now
          </span>
        ) : null}

        {categories.length > 0 ? (
          <label className="mgmt-composer-field">
            <span>Category</span>
            <select
              className="mgmt-composer-input"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className="mgmt-composer-desc-toggle"
          aria-expanded={descriptionOpen}
          onClick={() => setDescriptionOpen((open) => !open)}
        >
          {descriptionOpen ? "− Description" : "+ Description"}
        </button>

        <span className="mgmt-composer-hint">Enter to add · N to focus</span>
      </div>

      {descriptionOpen ? (
        <textarea
          className="mgmt-composer-description"
          aria-label="Description"
          placeholder="Add context, scope or a note for the owner…"
          rows={2}
          maxLength={5000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      ) : null}

      {alert ? (
        <p
          className="mgmt-composer-alert"
          data-tone={alert.tone}
          role={alert.tone === "error" ? "alert" : "status"}
        >
          {alert.text}
        </p>
      ) : null}
    </form>
  );
}
