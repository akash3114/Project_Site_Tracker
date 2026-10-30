"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProjectRegister } from "@/components/role-dashboards";
import { TaskDrawer } from "@/components/task-drawer";
import {
  EMPTY_FILTERS,
  type GroupBy,
  type MgmtPriority,
  type MgmtStatus,
  type MgmtTask,
  type TaskFilters,
  type ViewKey,
} from "@/lib/management";

import { CommandComposer } from "./command-composer";
import { Insights } from "./insights";
import { PortfolioRail } from "./portfolio-rail";
import { TaskCanvas } from "./task-canvas";
import { useTaskCatalogue } from "./use-task-catalogue";

type Toast = { tone: "ok" | "error"; text: string };

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Update failed.";
}

export function ManagementWorkspace({ userId }: { userId: string }) {
  const {
    tasks,
    projects,
    plazas,
    departments,
    loading,
    refreshing,
    error,
    updatedAt,
    reload,
    addTask,
    changePriority,
    changeStatus,
  } = useTaskCatalogue();

  const [view, setView] = useState<ViewKey>("tasks");
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);

  // The topbar is sticky, so the rail must stick below its measured height.
  // The composer grows (scope chips, description), so measure instead of
  // hard-coding the offset in CSS.
  const topbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const topbar = topbarRef.current;
    const main = topbar?.parentElement;
    if (!topbar || !main) return;
    const update = () => {
      main.style.setProperty("--mgmt-topbar-h", `${topbar.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    return () => {
      observer.disconnect();
      main.style.removeProperty("--mgmt-topbar-h");
    };
  }, []);

  // N focuses the composer, / focuses search. Ignore while typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        setView("tasks");
        setFocusSignal((value) => value + 1);
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("mgmt-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // A refresh failure while rows are already on screen used to be silent.
  const lastRefreshError = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      lastRefreshError.current = null;
      return;
    }
    if (tasks.length === 0 || lastRefreshError.current === error) return;
    lastRefreshError.current = error;
    setToast({ tone: "error", text: `Refresh failed: ${error}` });
  }, [error, tasks.length]);

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handlePriority = useCallback(
    async (task: MgmtTask, priority: MgmtPriority) => {
      if (task.priority === priority) return;
      markBusy(task.id, true);
      try {
        await changePriority(task, priority);
      } catch (cause) {
        setToast({ tone: "error", text: errorText(cause) });
      } finally {
        markBusy(task.id, false);
      }
    },
    [changePriority, markBusy],
  );

  const handleStatus = useCallback(
    async (task: MgmtTask, status: MgmtStatus) => {
      if (task.status === status) return;
      markBusy(task.id, true);
      try {
        await changeStatus(task, status);
      } catch (cause) {
        setToast({ tone: "error", text: errorText(cause) });
      } finally {
        markBusy(task.id, false);
      }
    },
    [changeStatus, markBusy],
  );

  const handleCreated = useCallback(
    (task: MgmtTask) => {
      addTask(task);
      setToast({ tone: "ok", text: `Added “${task.title}”.` });
    },
    [addTask],
  );

  const toggleScope = useCallback((key: string) => {
    setFilters((previous) => ({
      ...previous,
      scopes: previous.scopes.includes(key)
        ? previous.scopes.filter((row) => row !== key)
        : [...previous.scopes, key],
    }));
  }, []);

  const assignees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) {
      if (task.assignee?.id) seen.set(task.assignee.id, task.assignee.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [tasks]);

  const activeAssigneeName = useMemo(
    () =>
      filters.assigneeId
        ? (assignees.find((person) => person.id === filters.assigneeId)?.name ??
          null)
        : null,
    [filters.assigneeId, assignees],
  );

  const showSkeleton = loading && tasks.length === 0;

  return (
    <main className="cockpit-main mgmt-main">
      <div className="mgmt-topbar" ref={topbarRef}>
        <div className="mgmt-topbar-composer">
          <CommandComposer
            projects={projects}
            plazas={plazas}
            departments={departments}
            focusSignal={focusSignal}
            onCreated={handleCreated}
          />
        </div>
        <div className="mgmt-topbar-controls">
          <span className="cockpit-live">
            <i aria-hidden="true" />
            {refreshing
              ? "Refreshing…"
              : `Live · updated ${
                  updatedAt
                    ? updatedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"
                }`}
          </span>
          <div className="mgmt-views" role="group" aria-label="Management view">
            {(["tasks", "portfolio", "insights"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {key === "tasks"
                  ? "Tasks"
                  : key === "portfolio"
                    ? "Projects"
                    : "Insights"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showSkeleton ? (
        <div
          className="mgmt-loading"
          role="status"
          aria-live="polite"
          aria-label="Loading workspace"
        >
          <i />
          <i />
          <i />
        </div>
      ) : error && tasks.length === 0 ? (
        <div className="mgmt-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="cockpit-secondary-button"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      ) : view === "tasks" ? (
        <div className="mgmt-workspace">
          <div className="mgmt-primary">
            <TaskCanvas
              tasks={tasks}
              userId={userId}
              projects={projects}
              plazas={plazas}
              departments={departments}
              filters={filters}
              groupBy={groupBy}
              busyIds={busyIds}
              activeAssigneeName={activeAssigneeName}
              onFiltersChange={setFilters}
              onGroupByChange={setGroupBy}
              onPriorityChange={(task, priority) =>
                void handlePriority(task, priority)
              }
              onStatusChange={(task, status) => void handleStatus(task, status)}
              onOpen={(task) => setSelectedTaskId(task.id)}
            />
          </div>
          <PortfolioRail
            projects={projects}
            departments={departments}
            tasks={tasks}
            plazaCount={plazas.length}
            selectedScopes={filters.scopes}
            onToggleScope={toggleScope}
            onViewAll={() => setView("portfolio")}
          />
        </div>
      ) : view === "portfolio" ? (
        <ProjectRegister projects={projects} />
      ) : (
        <Insights
          tasks={tasks}
          projects={projects}
          plazas={plazas}
          departments={departments}
        />
      )}

      <p className="cockpit-footnote">
        Select a row to expand it; every status and priority change saves in
        place.
      </p>

      <TaskDrawer
        taskId={selectedTaskId}
        assignees={assignees}
        open={selectedTaskId !== null}
        onClose={() => {
          setSelectedTaskId(null);
          void reload();
        }}
        onChanged={() => void reload()}
      />

      {toast ? (
        <div
          className="mgmt-toast"
          data-tone={toast.tone}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
