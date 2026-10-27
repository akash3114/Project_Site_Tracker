"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  MgmtPlaza,
  MgmtPriority,
  MgmtProject,
  MgmtStatus,
  MgmtTask,
} from "@/lib/management";

type TaskPage = {
  items: MgmtTask[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 100;
/** Pilot volume is small; this keeps a runaway scope from freezing the tab. */
const MAX_TASKS = 2000;

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

async function loadAllTasks(): Promise<MgmtTask[]> {
  const first = await apiJson<TaskPage>(
    `/api/tasks?page=1&pageSize=${PAGE_SIZE}`,
  );
  const pages = Math.min(
    Math.ceil(first.total / PAGE_SIZE),
    Math.ceil(MAX_TASKS / PAGE_SIZE),
  );
  if (pages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiJson<TaskPage>(
        `/api/tasks?page=${index + 2}&pageSize=${PAGE_SIZE}`,
      ),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

export type TaskCatalogue = {
  tasks: MgmtTask[];
  projects: MgmtProject[];
  plazas: MgmtPlaza[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: Date | null;
  reload: () => Promise<void>;
  addTask: (task: MgmtTask) => void;
  changePriority: (task: MgmtTask, priority: MgmtPriority) => Promise<void>;
  changeStatus: (task: MgmtTask, status: MgmtStatus) => Promise<void>;
};

/**
 * One catalogue for the management workspace: every task in scope plus the
 * project and plaza summaries the rail and composer need. Mutations are
 * optimistic and roll back to the caller's snapshot on failure, so the UI can
 * stay on the page instead of refetching after every click.
 */
export function useTaskCatalogue(): TaskCatalogue {
  const [tasks, setTasks] = useState<MgmtTask[]>([]);
  const [projects, setProjects] = useState<MgmtProject[]>([]);
  const [plazas, setPlazas] = useState<MgmtPlaza[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const [taskRows, projectRows, plazaRows] = await Promise.all([
        loadAllTasks(),
        apiJson<MgmtProject[]>("/api/projects"),
        apiJson<MgmtPlaza[]>("/api/plazas"),
      ]);
      setTasks(taskRows);
      setProjects(projectRows);
      setPlazas(plazaRows);
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the workspace.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addTask = useCallback((task: MgmtTask) => {
    setTasks((previous) => [
      task,
      ...previous.filter((row) => row.id !== task.id),
    ]);
    setUpdatedAt(new Date());
  }, []);

  const changePriority = useCallback(
    async (task: MgmtTask, priority: MgmtPriority) => {
      setTasks((previous) =>
        previous.map((row) => (row.id === task.id ? { ...row, priority } : row)),
      );
      try {
        const updated = await apiJson<MgmtTask>(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ priority }),
        });
        setTasks((previous) =>
          previous.map((row) =>
            row.id === updated.id ? { ...row, ...updated } : row,
          ),
        );
      } catch (cause) {
        setTasks((previous) =>
          previous.map((row) =>
            row.id === task.id ? { ...row, priority: task.priority } : row,
          ),
        );
        throw cause;
      }
    },
    [],
  );

  const changeStatus = useCallback(
    async (task: MgmtTask, status: MgmtStatus) => {
      setTasks((previous) =>
        previous.map((row) =>
          row.id === task.id
            ? {
                ...row,
                status,
                completedAt:
                  status === "COMPLETED"
                    ? new Date().toISOString()
                    : null,
              }
            : row,
        ),
      );
      try {
        const updated = await apiJson<MgmtTask>(
          `/api/tasks/${task.id}/status`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ to: status }),
          },
        );
        setTasks((previous) =>
          previous.map((row) =>
            row.id === updated.id ? { ...row, ...updated } : row,
          ),
        );
      } catch (cause) {
        setTasks((previous) =>
          previous.map((row) =>
            row.id === task.id
              ? {
                  ...row,
                  status: task.status,
                  completedAt: task.completedAt ?? null,
                }
              : row,
          ),
        );
        throw cause;
      }
    },
    [],
  );

  return {
    tasks,
    projects,
    plazas,
    loading,
    refreshing,
    error,
    updatedAt,
    reload: load,
    addTask,
    changePriority,
    changeStatus,
  };
}
