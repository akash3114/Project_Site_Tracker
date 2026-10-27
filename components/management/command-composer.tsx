"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  groupAssignees,
  type AssigneeCandidate,
} from "@/lib/assignee-groups";
import type {
  ComposerPlaza,
  MgmtPriority,
  MgmtProject,
  MgmtTask,
} from "@/lib/management";

type ProjectOption = {
  id: string;
  name: string;
  plazas: { id: string; name: string }[];
};

type Scope =
  | { kind: "plaza"; plazaId: string; projectId: string | null }
  | { kind: "project"; projectId: string };

type PickerOption = {
  value: string;
  label: string;
  meta?: string;
  group: string;
};

type CategoryOption = { id: string; name: string; active?: boolean };

/** Adjacent picker rows with the same group label, keeping their flat index. */
function groupPickerOptions(options: PickerOption[]): {
  label: string;
  rows: { option: PickerOption; index: number }[];
}[] {
  const groups: {
    label: string;
    rows: { option: PickerOption; index: number }[];
  }[] = [];
  options.forEach((option, index) => {
    const current = groups[groups.length - 1];
    if (current && current.label === option.group) {
      current.rows.push({ option, index });
    } else {
      groups.push({ label: option.group, rows: [{ option, index }] });
    }
  });
  return groups;
}

const RECENT_KEY = "pst.mgmt.recentScopes";
const RECENT_LIMIT = 4;
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

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * The management command bar. Priority is a first-class segmented control,
 * the scope picker remembers recent projects, and a successful create keeps
 * every field except the title so a batch of tasks is a batch of keystrokes.
 */
export function CommandComposer({
  projects: projectRows,
  plazas,
  onCreated,
  focusSignal,
}: {
  /** Every accessible project, including ones with no plazas yet. */
  projects: MgmtProject[];
  plazas: ComposerPlaza[];
  onCreated: (task: MgmtTask) => void;
  focusSignal?: number;
}) {
  const plazaOptions = useMemo(() => plazas, [plazas]);

  const projectGroups = useMemo<ProjectOption[]>(() => {
    const byId = new Map<string, ProjectOption>();
    for (const project of projectRows) {
      byId.set(project.id, {
        id: project.id,
        name: project.name,
        plazas: [],
      });
    }
    for (const plaza of plazaOptions) {
      if (!plaza.project?.id) continue;
      const project =
        byId.get(plaza.project.id) ??
        ({
          id: plaza.project.id,
          name: plaza.project.name,
          plazas: [],
        } as ProjectOption);
      if (!project.plazas.some((entry) => entry.id === plaza.id)) {
        project.plazas.push({ id: plaza.id, name: plaza.name });
      }
      byId.set(project.id, project);
    }
    return Array.from(byId.values())
      .map((project) => ({
        ...project,
        plazas: [...project.plazas].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectRows, plazaOptions]);

  const orphanPlazas = useMemo(
    () => plazaOptions.filter((plaza) => !plaza.project?.id),
    [plazaOptions],
  );

  const [scopeValue, setScopeValue] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [priority, setPriority] = useState<MgmtPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignees, setAssignees] = useState<AssigneeCandidate[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [pending, setPending] = useState(0);
  const [alert, setAlert] = useState<{
    tone: "error" | "ok";
    text: string;
  } | null>(null);

  const [recentScopes, setRecentScopes] = useState<string[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const titleRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const didPreselect = useRef(false);
  const ownerCache = useRef(new Map<string, AssigneeCandidate[]>());
  const scopeListId = useId();
  const optionId = useCallback(
    (index: number) => `${scopeListId}-option-${index}`,
    [scopeListId],
  );

  const validScopes = useMemo(() => {
    const set = new Set<string>();
    for (const project of projectGroups) {
      set.add(`project:${project.id}`);
      for (const plaza of project.plazas) set.add(`plaza:${plaza.id}`);
    }
    for (const plaza of orphanPlazas) set.add(`plaza:${plaza.id}`);
    return set;
  }, [projectGroups, orphanPlazas]);

  const scope = useMemo<Scope | null>(() => {
    const separator = scopeValue.indexOf(":");
    if (separator === -1) return null;
    const kind = scopeValue.slice(0, separator);
    const id = scopeValue.slice(separator + 1);
    if (kind === "project") {
      return projectGroups.some((project) => project.id === id)
        ? { kind: "project", projectId: id }
        : null;
    }
    if (kind === "plaza") {
      const plaza = plazaOptions.find((entry) => entry.id === id);
      if (!plaza) return null;
      return {
        kind: "plaza",
        plazaId: plaza.id,
        projectId: plaza.project?.id ?? null,
      };
    }
    return null;
  }, [scopeValue, projectGroups, plazaOptions]);

  const scopeKind = scope?.kind ?? null;
  const scopePlazaId = scope?.kind === "plaza" ? scope.plazaId : null;
  const scopeProjectId = scope?.projectId ?? null;

  // Recent scopes come from localStorage after hydration (never during SSR).
  useEffect(() => {
    setRecentScopes(readRecent());
    setRecentLoaded(true);
  }, []);

  // Preselect the most recent scope so repeat filing starts one click ahead.
  // Scopes arrive after the localStorage read, so wait for a valid one.
  useEffect(() => {
    if (!recentLoaded || didPreselect.current) return;
    if (validScopes.size === 0) return;
    didPreselect.current = true;
    if (scopeValue) return;
    const first = recentScopes.find((value) => validScopes.has(value));
    if (first) setScopeValue(first);
  }, [recentLoaded, recentScopes, validScopes, scopeValue]);

  useEffect(() => {
    if (!focusSignal) return;
    titleRef.current?.focus();
  }, [focusSignal]);

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
    if (!scopeKind) {
      setAssignees([]);
      setAssigneesLoading(false);
      return;
    }
    const key =
      scopeKind === "plaza"
        ? `plaza:${scopePlazaId ?? ""}:${scopeProjectId ?? ""}`
        : `project:${scopeProjectId ?? ""}`;
    const cached = ownerCache.current.get(key);
    if (cached) {
      setAssignees(cached);
      setAssigneesLoading(false);
      return;
    }

    // Keep the previous scope's people from being offered against the new one.
    setAssignees([]);
    setAssigneesLoading(true);
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams();
      if (scopeProjectId) params.set("projectId", scopeProjectId);
      if (scopeKind === "plaza" && scopePlazaId) {
        params.set("plazaId", scopePlazaId);
      }
      try {
        const data = await fetchJson<AssigneeCandidate[]>(
          `/api/assignees?${params.toString()}`,
        );
        const rows = Array.isArray(data) ? data : [];
        ownerCache.current.set(key, rows);
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
  }, [scopeKind, scopePlazaId, scopeProjectId]);

  // A different scope invalidates the person picked for the previous one.
  useEffect(() => {
    setAssigneeId("");
  }, [scopeKind, scopePlazaId, scopeProjectId]);

  useEffect(() => {
    if (alert?.tone !== "ok") return;
    const timer = window.setTimeout(() => setAlert(null), 4000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    if (!pickerOpen) return;
    searchRef.current?.focus();
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!scopeRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  const assigneeGroups = useMemo(
    () => groupAssignees(assignees),
    [assignees],
  );

  const scopeLabel = useCallback(
    (value: string): string | null => {
      const separator = value.indexOf(":");
      if (separator === -1) return null;
      const kind = value.slice(0, separator);
      const id = value.slice(separator + 1);
      if (kind === "project") {
        const project = projectGroups.find((entry) => entry.id === id);
        return project ? `${project.name} · Project-level` : null;
      }
      const plaza = plazaOptions.find((entry) => entry.id === id);
      if (!plaza) return null;
      return plaza.project
        ? `${plaza.name} · ${plaza.project.name}`
        : plaza.name;
    },
    [projectGroups, plazaOptions],
  );

  const scopeMeta = useCallback(
    (value: string): string | undefined => {
      const separator = value.indexOf(":");
      if (separator === -1) return undefined;
      const kind = value.slice(0, separator);
      const id = value.slice(separator + 1);
      if (kind === "project") return "Project-level";
      return plazaOptions.find((entry) => entry.id === id)?.project?.name;
    },
    [plazaOptions],
  );

  const pickerOptions = useMemo<PickerOption[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
    const rows: PickerOption[] = [];
    const recentSet = new Set<string>();

    if (!needle) {
      for (const value of recentScopes) {
        if (!validScopes.has(value)) continue;
        const label = scopeLabel(value);
        if (!label) continue;
        recentSet.add(value);
        rows.push({
          value,
          label,
          meta: scopeMeta(value),
          group: "Recent",
        });
      }
    }

    for (const project of projectGroups) {
      const projectMatches = matches(project.name);
      const groupRows: PickerOption[] = [];
      if (projectMatches) {
        groupRows.push({
          value: `project:${project.id}`,
          label: "Project-level",
          meta: `${project.plazas.length} ${
            project.plazas.length === 1 ? "plaza" : "plazas"
          }`,
          group: project.name,
        });
      }
      for (const plaza of project.plazas) {
        if (!projectMatches && !matches(plaza.name)) continue;
        groupRows.push({
          value: `plaza:${plaza.id}`,
          label: plaza.name,
          meta: project.name,
          group: project.name,
        });
      }
      rows.push(...groupRows.filter((row) => !recentSet.has(row.value)));
    }

    for (const plaza of orphanPlazas) {
      if (!matches(plaza.name)) continue;
      if (recentSet.has(`plaza:${plaza.id}`)) continue;
      rows.push({
        value: `plaza:${plaza.id}`,
        label: plaza.name,
        group: "Plazas",
      });
    }

    return rows;
  }, [
    query,
    recentScopes,
    validScopes,
    projectGroups,
    orphanPlazas,
    scopeLabel,
    scopeMeta,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, optionId, pickerOpen, pickerOptions.length]);

  function chooseScope(value: string) {
    setScopeValue(value);
    setAssigneeId("");
    setPickerOpen(false);
    setQuery("");
    pushRecent(value);
    titleRef.current?.focus();
  }

  function pushRecent(value: string) {
    setRecentScopes((previous) => {
      const next = [value, ...previous.filter((entry) => entry !== value)].slice(
        0,
        RECENT_LIMIT,
      );
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable in private mode; recents are optional.
      }
      return next;
    });
  }

  function onPickerKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(0, pickerOptions.length - 1)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = pickerOptions[activeIndex];
      if (option) chooseScope(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setPickerOpen(false);
      triggerRef.current?.focus();
    }
  }

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

  const ready = scope !== null && title.trim().length >= 3;
  const submitHint = !scope
    ? "Choose a project or plaza first"
    : title.trim().length < 3
      ? "A task title needs at least 3 characters"
      : "Add task (Enter)";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !scope) return;
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const submittedScope = scope;

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
    if (submittedScope.kind === "plaza") body.plazaId = submittedScope.plazaId;
    else body.projectId = submittedScope.projectId;
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
        | (MgmtTask & { error?: string })
        | null;
      if (!response.ok) {
        restoreDraft();
        setAlert({
          tone: "error",
          text: data?.error ?? `Create failed (${response.status})`,
        });
        return;
      }
      if (!data) {
        restoreDraft();
        setAlert({ tone: "error", text: "Create failed (empty response)" });
        return;
      }
      setAlert({ tone: "ok", text: `Added “${cleanTitle}”.` });
      onCreated(data);
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch {
      restoreDraft();
      setAlert({ tone: "error", text: "Network error creating task" });
    } finally {
      setPending((count) => Math.max(0, count - 1));
    }
  }

  const selectedScopeLabel = scopeValue ? scopeLabel(scopeValue) : null;

  return (
    <form
      className="mgmt-composer"
      onSubmit={submit}
      aria-label="New task"
      aria-busy={pending > 0}
    >
      <div className="mgmt-composer-top">
        <div
          className="mgmt-scope"
          ref={scopeRef}
          data-open={pickerOpen ? "true" : "false"}
        >
          <button
            ref={triggerRef}
            type="button"
            className="mgmt-scope-trigger"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            aria-controls={
              pickerOpen && pickerOptions.length > 0 ? scopeListId : undefined
            }
            disabled={projectGroups.length === 0 && orphanPlazas.length === 0}
            title={selectedScopeLabel ?? "Choose a project or plaza"}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <span>{selectedScopeLabel ?? "Project or plaza"}</span>
          </button>
          {pickerOpen ? (
            <div className="mgmt-scope-popover">
              <input
                ref={searchRef}
                className="mgmt-scope-search"
                type="search"
                placeholder="Search projects and plazas…"
                aria-label="Search projects and plazas"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={pickerOpen}
                aria-controls={
                  pickerOptions.length > 0 ? scopeListId : undefined
                }
                aria-activedescendant={
                  pickerOptions.length > 0 ? optionId(activeIndex) : undefined
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onPickerKeyDown}
              />
              {pickerOptions.length === 0 ? (
                <p className="mgmt-scope-empty">No matching scope.</p>
              ) : (
                <div
                  className="mgmt-scope-list"
                  id={scopeListId}
                  role="listbox"
                  aria-label="Project or plaza"
                >
                  {groupPickerOptions(pickerOptions).map((group) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <div className="mgmt-scope-group" aria-hidden="true">
                        {group.label}
                      </div>
                      {group.rows.map(({ option, index }) => (
                        <button
                          key={`${option.group}:${option.value}`}
                          id={optionId(index)}
                          type="button"
                          className="mgmt-scope-option"
                          role="option"
                          tabIndex={-1}
                          aria-selected={scopeValue === option.value}
                          data-active={index === activeIndex ? "true" : "false"}
                          data-selected={
                            scopeValue === option.value ? "true" : "false"
                          }
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => chooseScope(option.value)}
                        >
                          <span>{option.label}</span>
                          {option.meta ? <small>{option.meta}</small> : null}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

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
          Add task
        </button>
      </div>

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

        <label className="mgmt-composer-field">
          <span>Assignee</span>
          <select
            className="mgmt-composer-input"
            value={assigneeId}
            disabled={!scope || assigneesLoading}
            aria-busy={assigneesLoading}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">
              {assigneesLoading ? "Loading assignees…" : "Unassigned"}
            </option>
            {assigneeGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.rows.map((row) => (
                  <option
                    key={row.id}
                    value={row.id}
                    title={
                      row.role === "HEAD_OFFICE"
                        ? `${row.name} · ${row.department ?? "Head Office"}`
                        : undefined
                    }
                  >
                    {row.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

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
