"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { AssigneeOption } from "@/components/task-filters";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type PlazaOption = {
  id: string;
  name: string;
  project?: { id: string; name: string } | null;
};

type OwnerSource = {
  plaza?: { id: string } | null;
  assignee?: { id: string; name: string } | null;
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

/**
 * Inline task composer, shared by the role dashboards and the plaza page.
 *
 * Creating one task used to mean a button, a plaza picker and a modal. The bar
 * collapses that into a single row that posts straight to POST /api/tasks.
 * Owners belong to a plaza, so options load on demand and are cached per plaza
 * for the session; the plaza page already resolves them and passes them in.
 * Manager accounts cannot list the user directory (403), so the fallback is
 * the owners already visible on that plaza's tasks.
 */
export function TaskComposer({
  plazas,
  fixedPlazaId,
  tasks = [],
  assignees: resolvedAssignees,
  onCreated,
  variant = "cockpit",
}: {
  /** Plazas this account may file against. Omit when the plaza is fixed. */
  plazas?: PlazaOption[];
  /** Set on the plaza page: the plaza is known, so its field is hidden. */
  fixedPlazaId?: string;
  /** Used to derive owner options when the directory is out of reach. */
  tasks?: OwnerSource[];
  /** Pre-resolved owner options; skips the per-plaza lookup when supplied. */
  assignees?: AssigneeOption[];
  onCreated: () => void;
  variant?: "cockpit" | "page";
}) {
  const plazaOptions = useMemo(() => plazas ?? [], [plazas]);
  const [plazaId, setPlazaId] = useState(fixedPlazaId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [priority, setPriority] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const ownerCache = useRef(new Map<string, AssigneeOption[]>());

  // A single-plaza scope preselects itself so the bar posts in one move.
  useEffect(() => {
    if (plazaOptions.length === 1 && plazaId !== plazaOptions[0].id) {
      setPlazaId(plazaOptions[0].id);
    }
  }, [plazaOptions, plazaId]);

  useEffect(() => {
    if (!plazaId) {
      setAssignees([]);
      return;
    }
    if (resolvedAssignees) {
      setAssignees(resolvedAssignees);
      return;
    }
    const cached = ownerCache.current.get(plazaId);
    if (cached) {
      setAssignees(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      const seen = new Map<string, string>();
      for (const task of tasks) {
        if (task.plaza?.id === plazaId && task.assignee?.id) {
          seen.set(task.assignee.id, task.assignee.name);
        }
      }
      try {
        const users = await fetchJson<
          { id: string; name: string; active?: boolean; plazaIds?: string[] }[]
        >("/api/users");
        for (const user of users) {
          if (user.active !== false && user.plazaIds?.includes(plazaId)) {
            seen.set(user.id, user.name);
          }
        }
      } catch {
        // Manager accounts cannot browse the user directory; keep what we have.
      }
      const list = Array.from(seen, ([id, name]) => ({ id, name }));
      ownerCache.current.set(plazaId, list);
      if (!cancelled) setAssignees(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [plazaId, tasks, resolvedAssignees]);

  // The success line is a receipt, not a log — retire it on its own.
  useEffect(() => {
    if (alert?.tone !== "ok") return;
    const timer = window.setTimeout(() => setAlert(null), 4000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  const ready = plazaId !== "" && title.trim().length >= 3 && !saving;
  const submitHint = !plazaId
    ? "Choose a plaza first"
    : title.trim().length < 3
      ? "A task title needs at least 3 characters"
      : "Create task";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    setSaving(true);
    setAlert(null);
    const body: Record<string, unknown> = { plazaId, title: cleanTitle };
    if (cleanDescription) body.description = cleanDescription;
    if (priority) body.priority = priority;
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
            aria-label="Plaza"
            value={plazaId}
            disabled={plazaOptions.length === 0}
            onChange={(event) => {
              setPlazaId(event.target.value);
              setAssigneeId("");
            }}
          >
            <option value="">Toll plaza</option>
            {plazaOptions.map((plaza) => (
              <option key={plaza.id} value={plaza.id}>
                {plaza.name}
                {plaza.project?.name ? ` — ${plaza.project.name}` : ""}
              </option>
            ))}
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
        <input
          className="cockpit-composer-date"
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <select
          className="cockpit-composer-assignee"
          aria-label="Assignee"
          value={assigneeId}
          disabled={!plazaId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">Assignee</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
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
