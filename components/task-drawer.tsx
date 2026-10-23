"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { TaskStatus } from "@prisma/client";

import { fmtDate, fmtDateTimeIST, isOverdue } from "@/lib/format";
import { ActivityFeed, type FeedEvent } from "./activity-feed";
import {
  AttachmentList,
  AttachmentUploader,
  type AttachmentItem,
} from "./attachment-list";
import { CommentComposer } from "./comment-composer";
import { StatusBadge } from "./status-badge";
import { StatusStepper } from "./status-stepper";
import { PriorityBadge } from "./task-table";
import type { AssigneeOption } from "./task-filters";

type Person = { id: string; name: string };

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

type TaskDetail = {
  id: string;
  projectId: string;
  plazaId: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: string;
  dueDate?: string | null;
  completedAt?: string | null;
  project: {
    id: string;
    name: string;
    acronym?: string | null;
    round?: string | null;
    company: { id: string; name: string; code?: string | null };
  };
  plaza?: {
    id: string;
    name: string;
    state?: string | null;
    lengthKm?: number | null;
    piu?: string | null;
    ro?: string | null;
  } | null;
  category?: { id: string; name: string } | null;
  assignee?: Person | null;
  createdBy?: Person | null;
  completedBy?: Person | null;
  attachments?: AttachmentItem[];
  reopenRequests?: ReopenRequest[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ReopenRequest = {
  id: string;
  status: string;
  reason: string;
  reviewNote?: string | null;
  createdAt?: string | null;
  reviewedAt?: string | null;
  requestedBy?: Person | null;
  reviewedBy?: Person | null;
};

type TaskPermissions = {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canReopenDirect: boolean;
  canRequestReopen: boolean;
  canApproveReopen: boolean;
  canComment: boolean;
  canUpload: boolean;
  canDelete: boolean;
};

type CandidateRole =
  | "ADMIN"
  | "HEAD_OFFICE"
  | "PROJECT_MANAGER"
  | "SITE_MANAGER";

/** Shape returned by GET /api/assignees and GET /api/tasks/:id. */
type AssigneeCandidate = {
  id: string;
  name: string;
  role?: CandidateRole | null;
  department?: string | null;
  office?: string | null;
};

type AssigneeGroup = {
  key: string;
  label: string;
  rows: AssigneeCandidate[];
};

type CategoryOption = { id: string; name: string };

const HEAD_OFFICE_FALLBACK = "Head Office";

/**
 * Group candidates for the assignee picker: Administrators, one group per Head Office
 * department (alphabetical), then Project managers and Site managers. Empty
 * groups are dropped. Rows without a known role (the derived fallback list or
 * a task's current assignee) keep a trailing group so a selected value is
 * never lost.
 */
function groupAssignees(rows: AssigneeCandidate[]): AssigneeGroup[] {
  const admin: AssigneeCandidate[] = [];
  const headOffice = new Map<string, AssigneeCandidate[]>();
  const projectManagers: AssigneeCandidate[] = [];
  const siteManagers: AssigneeCandidate[] = [];
  const other: AssigneeCandidate[] = [];

  for (const row of rows) {
    if (row.role === "ADMIN") {
      admin.push(row);
    } else if (row.role === "HEAD_OFFICE") {
      const department = row.department?.trim() || HEAD_OFFICE_FALLBACK;
      const bucket = headOffice.get(department);
      if (bucket) bucket.push(row);
      else headOffice.set(department, [row]);
    } else if (row.role === "PROJECT_MANAGER") {
      projectManagers.push(row);
    } else if (row.role === "SITE_MANAGER") {
      siteManagers.push(row);
    } else {
      other.push(row);
    }
  }

  const groups: AssigneeGroup[] = [
    { key: "admin", label: "Administrators", rows: admin },
    ...Array.from(headOffice.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((department) => ({
        key: `head-office:${department}`,
        label: department,
        rows: headOffice.get(department) ?? [],
      })),
    {
      key: "project-managers",
      label: "Project managers",
      rows: projectManagers,
    },
    { key: "site-managers", label: "Site managers", rows: siteManagers },
    { key: "other", label: "Other assignees", rows: other },
  ];

  return groups.filter((group) => group.rows.length > 0);
}

/** Native options are one line; HO department rides along as a tooltip. */
function candidateTitle(row: AssigneeCandidate): string | undefined {
  if (row.role !== "HEAD_OFFICE") return undefined;
  const department = row.department?.trim() || HEAD_OFFICE_FALLBACK;
  return `${row.name} · ${department}`;
}

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];

const STATUS_TEXT: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

const FIELD =
  "min-h-[44px] w-full rounded-[6px] border border-[#CDD6CE] bg-white px-3 py-2 font-body text-sm text-[#1C2824] placeholder:text-[#66756D] disabled:opacity-60";

const LABEL = "font-mono text-[11px] uppercase tracking-wide text-[#66756D]";

const BTN_PRIMARY =
  "min-h-[44px] rounded-[6px] bg-[#173B33] px-4 font-body text-sm font-semibold text-white pst-transition hover:brightness-110 disabled:opacity-60";

const BTN_SECONDARY =
  "min-h-[44px] rounded-[6px] border border-[#CDD6CE] px-4 font-body text-sm text-[#1C2824] pst-transition hover:border-[#173B33] disabled:opacity-60";

const BTN_DANGER =
  "min-h-[44px] rounded-[6px] border border-[#8F2824]/40 px-4 font-body text-sm text-[#8F2824] pst-transition hover:bg-[#FBE8E4] disabled:opacity-60";

function toastClass(tone: "ok" | "err") {
  return tone === "ok"
    ? "border-green-500/40 bg-[#E8F0DD] text-[#385A2B]"
    : "border-red-500/40 bg-[#FBE8E4] text-[#991B1B]";
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function asPriority(value: string | null | undefined): TaskPriority {
  return value === "LOW" || value === "HIGH" ? value : "MEDIUM";
}

function roundLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^ROUND_(\d)$/.exec(value);
  return match ? `Round ${match[1]}` : value;
}

function readError(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You do not have access to this task.";
  if (status === 404) return "Task not found.";
  return `Request failed (${status})`;
}

/**
 * Task drawer (Sheet): fetch GET /api/tasks/:id, then run core edits, status,
 * assignment, reopen workflow, comments and attachments with refetch
 * invalidation. COMPLETED locks edits/reassignment via `permissions` rather
 * than a bare status check, while comments and files stay available.
 */
export function TaskDrawer({
  taskId,
  assignees,
  open,
  onClose,
  onChanged,
}: {
  taskId: string | null;
  assignees: AssigneeOption[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [permissions, setPermissions] = useState<TaskPermissions | null>(null);
  const [apiAssignees, setApiAssignees] = useState<AssigneeCandidate[]>([]);
  const [pendingReopen, setPendingReopen] = useState<ReopenRequest | null>(null);
  const [me, setMe] = useState<{ id: string; name?: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "ok" | "err";
    msg: string;
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as TaskPriority,
    categoryId: "",
    dueDate: "",
  });
  const [reopenReason, setReopenReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const loadSeq = useRef(0);

  const notify = useCallback((tone: "ok" | "err", msg: string) => {
    setNotice({ tone, msg });
    window.setTimeout(() => {
      setNotice((current) => (current?.msg === msg ? null : current));
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    if (!taskId) return;
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | {
            task?: TaskDetail;
            events?: FeedEvent[];
            permissions?: TaskPermissions;
            assignees?: AssigneeCandidate[];
            reopenRequest?: ReopenRequest | null;
          }
        | null;
      if (seq !== loadSeq.current) return;
      if (!res.ok || !data?.task) {
        setLoadError(readError(data, res.status));
        return;
      }
      setTask(data.task);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setPermissions(data.permissions ?? null);
      setApiAssignees(Array.isArray(data.assignees) ? data.assignees : []);
      setPendingReopen(data.reopenRequest ?? null);
    } catch {
      if (seq === loadSeq.current) {
        setLoadError("Network error loading task.");
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [taskId]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setCategoriesError(readError(data, res.status));
        return;
      }
      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      setCategories(
        rows
          .filter(
            (row): row is { id: string; name: string; active?: boolean } =>
              Boolean(
                row &&
                  typeof row === "object" &&
                  typeof (row as { id?: unknown }).id === "string" &&
                  typeof (row as { name?: unknown }).name === "string",
              ),
          )
          .filter((row) => row.active !== false)
          .map((row) => ({ id: row.id, name: row.name })),
      );
      setCategoriesError(null);
    } catch {
      setCategoriesError("Could not load categories.");
    }
  }, []);

  // Session identity powers "cancel my reopen request"; the task payload
  // does not expose the viewer, so ask /api/users/me once per drawer mount.
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
          name?: string;
        } | null;
        if (!cancelled && data?.id) setMe({ id: data.id, name: data.name });
      } catch {
        // Non-fatal: the cancel action simply stays hidden for the requester.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetPanels = useCallback(() => {
    setEditing(false);
    setReopenReason("");
    setReviewNote("");
    setCategoriesError(null);
    setForm({
      title: "",
      description: "",
      priority: "MEDIUM",
      categoryId: "",
      dueDate: "",
    });
  }, []);

  useEffect(() => {
    if (!open || !taskId) return;
    setTask(null);
    setEvents([]);
    setPermissions(null);
    setApiAssignees([]);
    setPendingReopen(null);
    setNotice(null);
    setLoadError(null);
    setBusy(null);
    resetPanels();
    void load();
    void loadCategories();
  }, [open, taskId, load, loadCategories, resetPanels]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Assignment or a status change can remove edit rights mid-panel.
  useEffect(() => {
    if (editing && permissions && !permissions.canEdit) setEditing(false);
  }, [editing, permissions]);

  const assigneeOptions = useMemo(() => {
    const base: AssigneeCandidate[] =
      apiAssignees.length > 0
        ? apiAssignees
        : assignees.map((row) => ({ id: row.id, name: row.name }));
    const rows = [...base];
    if (task?.assignee && !rows.some((row) => row.id === task.assignee?.id)) {
      rows.unshift({ id: task.assignee.id, name: task.assignee.name });
    }
    return rows;
  }, [apiAssignees, assignees, task?.assignee]);

  const assigneeGroups = useMemo(
    () => groupAssignees(assigneeOptions),
    [assigneeOptions],
  );

  const lastResolvedReopen = useMemo(() => {
    return (
      task?.reopenRequests?.find((request) => request.status !== "PENDING") ??
      null
    );
  }, [task?.reopenRequests]);

  if (!open || !taskId) return null;

  const completed = task?.status === "COMPLETED";
  const overdue = task ? isOverdue(task.dueDate, task.status) : false;
  const attachments = task?.attachments ?? [];

  async function run(
    key: string,
    path: string,
    init: RequestInit,
    okMsg: string,
  ): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fetch(path, { credentials: "same-origin", ...init });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        notify("err", readError(data, res.status));
        return false;
      }
      notify("ok", okMsg);
      await load();
      onChanged();
      return true;
    } catch {
      notify("err", "Network error. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startEdit() {
    if (!task || !permissions?.canEdit) return;
    setForm({
      title: task.title,
      description: task.description ?? "",
      priority: asPriority(task.priority),
      categoryId: task.category?.id ?? "",
      dueDate: toDateInput(task.dueDate),
    });
    setEditing(true);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    const title = form.title.trim();
    if (title.length < 3) {
      notify("err", "A task title needs at least 3 characters.");
      return;
    }
    const ok = await run(
      "edit",
      `/api/tasks/${task.id}`,
      jsonRequest("PATCH", {
        title,
        description: form.description.trim() || null,
        priority: form.priority,
        categoryId: form.categoryId || null,
        dueDate: form.dueDate || null,
      }),
      "Task updated",
    );
    if (ok) setEditing(false);
  }

  function changeStatus(to: TaskStatus) {
    if (!task) return;
    void run(
      "status",
      `/api/tasks/${task.id}/status`,
      jsonRequest("POST", { to }),
      `Status → ${STATUS_TEXT[to]}`,
    );
  }

  function changeAssignee(value: string) {
    if (!task) return;
    void run(
      "assign",
      `/api/tasks/${task.id}/assign`,
      jsonRequest("POST", { assigneeId: value || null }),
      value ? "Assignee updated" : "Task unassigned",
    );
  }

  async function submitReopen() {
    if (!task || !permissions) return;
    const reason = reopenReason.trim();
    if (reason.length < 10) {
      notify("err", "A reopen reason of at least 10 characters is required.");
      return;
    }
    const direct = permissions.canReopenDirect;
    const ok = await run(
      "reopen",
      `/api/tasks/${task.id}/reopen`,
      jsonRequest("POST", { reason }),
      direct ? "Task reopened" : "Reopen request sent for approval",
    );
    if (ok) setReopenReason("");
  }

  async function decideReopen(decision: "APPROVE" | "REJECT") {
    if (!task || !pendingReopen) return;
    const note = reviewNote.trim();
    const ok = await run(
      "reopen-decision",
      `/api/tasks/${task.id}/reopen`,
      jsonRequest("POST", {
        requestId: pendingReopen.id,
        decision,
        ...(note ? { note } : {}),
      }),
      decision === "APPROVE" ? "Reopen approved" : "Reopen request rejected",
    );
    if (ok) setReviewNote("");
  }

  async function cancelReopen() {
    if (!task || !pendingReopen) return;
    if (!window.confirm("Cancel this reopen request?")) return;
    const ok = await run(
      "reopen-cancel",
      `/api/tasks/${task.id}/reopen?requestId=${encodeURIComponent(pendingReopen.id)}`,
      { method: "DELETE" },
      "Reopen request cancelled",
    );
    if (ok) setReviewNote("");
  }

  async function afterAttachmentChange(message: string) {
    notify("ok", message);
    await load();
    onChanged();
  }

  const canReopen =
    Boolean(permissions?.canReopenDirect) ||
    Boolean(permissions?.canRequestReopen);
  const canCancelPending =
    Boolean(pendingReopen) &&
    (Boolean(permissions?.canDelete) ||
      Boolean(me?.id && pendingReopen?.requestedBy?.id === me.id));
  const reasonReady = reopenReason.trim().length >= 10;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-drawer-title"
      className="fixed inset-0 z-40 bg-black/40"
      onClick={onClose}
    >
      <aside
        onClick={(event) => event.stopPropagation()}
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
      >
        <div className="flex min-h-[64px] items-start gap-3 border-b border-[#CDD6CE] px-4 py-3">
          <h2
            id="task-drawer-title"
            className="line-clamp-2 min-w-0 flex-1 font-display text-base font-semibold tracking-[-0.02em] text-[#1C2824]"
          >
            {task?.title ?? "Loading…"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task drawer"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[6px] font-body text-sm text-[#586760] pst-transition hover:bg-[#FAFBFC] hover:text-[#1C2824]"
          >
            ✕
          </button>
        </div>

        {notice ? (
          <p
            role={notice.tone === "err" ? "alert" : "status"}
            className={`mx-4 mt-3 rounded-[6px] border px-3 py-2 font-body text-sm ${toastClass(notice.tone)}`}
          >
            {notice.msg}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          {!task && loading ? (
            <p className="font-body text-sm text-[#586760]">Loading task…</p>
          ) : null}

          {!task && loadError ? (
            <div className="flex flex-col gap-3 rounded-[6px] border border-red-500/40 bg-[#FBE8E4] p-3">
              <p role="alert" className="font-body text-sm text-[#991B1B]">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className={`${BTN_SECONDARY} self-start`}
              >
                Try again
              </button>
            </div>
          ) : null}

          {task ? (
            <>
              <header className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  <span
                    className={`font-mono text-xs ${
                      overdue
                        ? "font-medium text-[#8F2824]"
                        : "text-[#586760]"
                    }`}
                  >
                    Due {fmtDate(task.dueDate)}
                    {overdue ? " · overdue" : ""}
                  </span>
                </div>

                <nav aria-label="Task location">
                  <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-xs text-[#586760]">
                    <li>{task.project.company.name}</li>
                    <li aria-hidden="true" className="text-[#CDD6CE]">
                      ›
                    </li>
                    <li>
                      {task.project.name}
                      {task.project.acronym ? ` (${task.project.acronym})` : ""}
                      {roundLabel(task.project.round)
                        ? ` · ${roundLabel(task.project.round)}`
                        : ""}
                    </li>
                    <li aria-hidden="true" className="text-[#CDD6CE]">
                      ›
                    </li>
                    <li
                      className={
                        task.plaza ? "text-[#1C2824]" : "italic text-[#66756D]"
                      }
                    >
                      {task.plaza?.name ?? "Project-level"}
                    </li>
                  </ol>
                </nav>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-body text-sm text-[#1C2824] sm:grid-cols-3">
                  <div className="min-w-0">
                    <dt className={LABEL}>Category</dt>
                    <dd className="truncate">
                      {task.category?.name ?? "Uncategorised"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={LABEL}>Assignee</dt>
                    <dd className="truncate">
                      {task.assignee?.name ?? "Unassigned"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={LABEL}>Created by</dt>
                    <dd className="truncate">{task.createdBy?.name ?? "—"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={LABEL}>Due</dt>
                    <dd
                      className={
                        overdue ? "font-medium text-[#8F2824]" : undefined
                      }
                    >
                      {fmtDate(task.dueDate)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={LABEL}>Created</dt>
                    <dd>{fmtDate(task.createdAt)}</dd>
                  </div>
                  {task.plaza?.state ? (
                    <div className="min-w-0">
                      <dt className={LABEL}>State</dt>
                      <dd className="truncate">{task.plaza.state}</dd>
                    </div>
                  ) : null}
                  {completed ? (
                    <div className="col-span-2 min-w-0 sm:col-span-3">
                      <dt className={LABEL}>Completed</dt>
                      <dd>
                        {fmtDateTimeIST(task.completedAt)}
                        {task.completedBy?.name
                          ? ` · ${task.completedBy.name}`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </header>

              <section aria-label="Status" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                  Status
                </h3>
                <StatusStepper
                  from={task.status}
                  disabled={!permissions?.canChangeStatus}
                  pending={busy === "status"}
                  onChange={changeStatus}
                />
                {!permissions?.canChangeStatus ? (
                  <p className="font-mono text-[11px] text-[#66756D]">
                    {completed
                      ? "Completed tasks are locked. Reopen to change status."
                      : "You cannot change the status of this task."}
                  </p>
                ) : null}
              </section>

              <section aria-label="Assignment" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                  Assignee
                </h3>
                <label htmlFor="task-assignee" className="sr-only">
                  Assignee
                </label>
                <select
                  id="task-assignee"
                  aria-label="Reassign task"
                  disabled={!permissions?.canAssign || busy !== null}
                  value={task.assignee?.id ?? ""}
                  onChange={(event) => changeAssignee(event.target.value)}
                  className={`${FIELD} disabled:opacity-60`}
                >
                  <option value="">Unassigned</option>
                  {assigneeGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.rows.map((row) => (
                        <option
                          key={row.id}
                          value={row.id}
                          title={candidateTitle(row)}
                        >
                          {row.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {!permissions?.canAssign ? (
                  <p className="font-mono text-[11px] text-[#66756D]">
                    {completed
                      ? "Reassignment is locked while the task is completed."
                      : "You cannot reassign this task."}
                  </p>
                ) : null}
              </section>

              <section aria-label="Details" className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                    Details
                  </h3>
                  {!editing && permissions?.canEdit ? (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="min-h-[44px] rounded-[6px] px-3 font-body text-sm text-[#173B33] pst-transition hover:bg-[#FAFBFC]"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {editing ? (
                  <form
                    onSubmit={(event) => void saveEdit(event)}
                    aria-label="Edit task"
                    className="flex flex-col gap-3 rounded-[8px] border border-[#CDD6CE] bg-[#FAFBFC] p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="edit-title" className={LABEL}>
                        Title
                      </label>
                      <input
                        id="edit-title"
                        value={form.title}
                        maxLength={200}
                        required
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className={FIELD}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="edit-description" className={LABEL}>
                        Description
                      </label>
                      <textarea
                        id="edit-description"
                        rows={3}
                        maxLength={5000}
                        value={form.description}
                        placeholder="Add context, next steps or acceptance notes…"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className={FIELD}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="edit-priority" className={LABEL}>
                          Priority
                        </label>
                        <select
                          id="edit-priority"
                          value={form.priority}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              priority: asPriority(event.target.value),
                            }))
                          }
                          className={FIELD}
                        >
                          {PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority[0] + priority.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="edit-due" className={LABEL}>
                          Due date
                        </label>
                        <input
                          id="edit-due"
                          type="date"
                          value={form.dueDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              dueDate: event.target.value,
                            }))
                          }
                          className={FIELD}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="edit-category" className={LABEL}>
                        Category
                      </label>
                      <select
                        id="edit-category"
                        value={form.categoryId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                          }))
                        }
                        className={FIELD}
                      >
                        <option value="">Uncategorised</option>
                        {task.category &&
                        !(categories ?? []).some(
                          (category) => category.id === task.category?.id,
                        ) ? (
                          <option value={task.category.id}>
                            {task.category.name} (archived)
                          </option>
                        ) : null}
                        {(categories ?? []).map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {categories === null && !categoriesError ? (
                        <p className="font-mono text-[11px] text-[#66756D]">
                          Loading categories…
                        </p>
                      ) : null}
                      {categoriesError ? (
                        <p role="alert" className="font-mono text-[11px] text-[#8F2824]">
                          {categoriesError}{" "}
                          <button
                            type="button"
                            onClick={() => void loadCategories()}
                            className="min-h-[44px] font-body text-xs text-[#173B33] underline underline-offset-2"
                          >
                            Retry
                          </button>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy !== null}
                        className={BTN_PRIMARY}
                      >
                        {busy === "edit" ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        disabled={busy === "edit"}
                        onClick={() => setEditing(false)}
                        className={BTN_SECONDARY}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="whitespace-pre-wrap font-body text-sm text-[#1C2824]">
                    {task.description?.trim() || (
                      <span className="text-[#586760]">No description.</span>
                    )}
                  </p>
                )}
              </section>

              {completed ? (
                <section aria-label="Reopen task" className="flex flex-col gap-2">
                  <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                    Reopen
                  </h3>

                  {pendingReopen ? (
                    <div className="flex flex-col gap-2 rounded-[6px] border border-amber-500/40 bg-[#FFF1CC]/50 p-3">
                      <p className="font-body text-sm font-semibold text-[#704900]">
                        Reopen request pending
                      </p>
                      <p className="whitespace-pre-wrap font-body text-sm text-[#1C2824]">
                        {pendingReopen.reason}
                      </p>
                      <p className="font-mono text-[11px] text-[#66756D]">
                        Requested by{" "}
                        {pendingReopen.requestedBy?.name ?? "Unknown"} ·{" "}
                        {fmtDateTimeIST(pendingReopen.createdAt)}
                      </p>

                      {permissions?.canApproveReopen ? (
                        <div className="flex flex-col gap-2 border-t border-[#CDD6CE] pt-2">
                          <label htmlFor="reopen-review-note" className={LABEL}>
                            Review note (optional)
                          </label>
                          <textarea
                            id="reopen-review-note"
                            rows={2}
                            maxLength={2000}
                            value={reviewNote}
                            onChange={(event) =>
                              setReviewNote(event.target.value)
                            }
                            placeholder="Why are you approving or rejecting?"
                            className={FIELD}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void decideReopen("APPROVE")}
                              className={BTN_PRIMARY}
                            >
                              {busy === "reopen-decision"
                                ? "Working…"
                                : "Approve reopen"}
                            </button>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void decideReopen("REJECT")}
                              className={BTN_DANGER}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {canCancelPending ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void cancelReopen()}
                          className={`${BTN_SECONDARY} self-start`}
                        >
                          {busy === "reopen-cancel"
                            ? "Cancelling…"
                            : "Cancel request"}
                        </button>
                      ) : null}
                    </div>
                  ) : canReopen ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="reopen-reason" className={LABEL}>
                        Reason (at least 10 characters)
                      </label>
                      <textarea
                        id="reopen-reason"
                        rows={2}
                        maxLength={2000}
                        value={reopenReason}
                        onChange={(event) => setReopenReason(event.target.value)}
                        placeholder="What needs to change before this can close again?"
                        className={FIELD}
                      />
                      <button
                        type="button"
                        disabled={busy !== null || !reasonReady}
                        onClick={() => void submitReopen()}
                        className={`${BTN_SECONDARY} self-start`}
                      >
                        {busy === "reopen"
                          ? "Submitting…"
                          : permissions?.canReopenDirect
                            ? "Reopen task"
                            : "Request reopen"}
                      </button>
                      {reopenReason.trim().length > 0 && !reasonReady ? (
                        <p className="font-mono text-[11px] text-[#8F2824]">
                          {10 - reopenReason.trim().length} more character
                          {10 - reopenReason.trim().length === 1 ? "" : "s"}{" "}
                          needed.
                        </p>
                      ) : null}
                      {!permissions?.canReopenDirect &&
                      permissions?.canRequestReopen ? (
                        <p className="font-mono text-[11px] text-[#66756D]">
                          Requests go to Admin / Head Office for approval.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-[#66756D]">
                      Only Admin / Head Office can reopen directly; project and
                      site managers can request a reopen.
                    </p>
                  )}

                  {lastResolvedReopen ? (
                    <p className="font-mono text-[11px] text-[#66756D]">
                      Last request: {lastResolvedReopen.status.toLowerCase()}
                      {lastResolvedReopen.reviewedBy?.name
                        ? ` by ${lastResolvedReopen.reviewedBy.name}`
                        : ""}{" "}
                      ·{" "}
                      {fmtDateTimeIST(
                        lastResolvedReopen.reviewedAt ??
                          lastResolvedReopen.createdAt,
                      )}
                      {lastResolvedReopen.reviewNote
                        ? ` — ${lastResolvedReopen.reviewNote}`
                        : ""}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section aria-label="Attachments" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                  Attachments ({attachments.length})
                </h3>
                <AttachmentList
                  attachments={attachments}
                  currentUserId={me?.id ?? null}
                  canDeleteAny={Boolean(permissions?.canDelete)}
                  onChanged={() =>
                    void afterAttachmentChange("Attachment deleted")
                  }
                  onError={(message) => notify("err", message)}
                  emptyText="No files attached to this task yet."
                />
                {permissions?.canUpload ? (
                  <AttachmentUploader
                    taskId={task.id}
                    label="Upload attachment"
                    disabled={busy !== null}
                    onUploaded={() =>
                      void afterAttachmentChange("Attachment uploaded")
                    }
                    onError={(message) => notify("err", message)}
                  />
                ) : null}
              </section>

              <section aria-label="Activity" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-[#1C2824]">
                  Activity ({events.length})
                </h3>
                <ActivityFeed events={events} />
              </section>
            </>
          ) : null}
        </div>

        {task ? (
          <div className="px-4 pb-4">
            <CommentComposer
              taskId={taskId}
              canComment={permissions?.canComment ?? true}
              onPosted={() => {
                notify("ok", "Comment posted");
                onChanged();
                void load();
              }}
              onError={(msg) => notify("err", msg)}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
