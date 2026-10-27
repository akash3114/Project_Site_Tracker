"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import {
  EMPTY_FILTERS,
  countFacets,
  filterTasks,
  groupTasks,
  hasActiveFacets,
  hasActiveFilters,
  type GroupBy,
  type MgmtPriority,
  type MgmtStatus,
  type MgmtTask,
  type TaskFilters,
} from "@/lib/management";

import { TaskRow } from "./task-row";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "due", label: "Due urgency" },
  { value: "project", label: "Project" },
  { value: "level", label: "Task level" },
];

function laneId(key: string): string {
  return `lane-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export type TaskCanvasProps = {
  tasks: MgmtTask[];
  userId: string;
  filters: TaskFilters;
  groupBy: GroupBy;
  busyIds: Set<string>;
  activeProjectName?: string | null;
  activeAssigneeName?: string | null;
  onFiltersChange: (filters: TaskFilters) => void;
  onGroupByChange: (groupBy: GroupBy) => void;
  onPriorityChange: (task: MgmtTask, priority: MgmtPriority) => void;
  onStatusChange: (task: MgmtTask, status: MgmtStatus) => void;
  onOpen: (task: MgmtTask) => void;
};

/**
 * The task canvas: faceted counts on top, switchable lanes below. Every facet
 * is a filter, so reaching a slice of work is one click and never a drill-down.
 */
export function TaskCanvas({
  tasks,
  userId,
  filters,
  groupBy,
  busyIds,
  activeProjectName,
  activeAssigneeName,
  onFiltersChange,
  onGroupByChange,
  onPriorityChange,
  onStatusChange,
  onOpen,
}: TaskCanvasProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(["completed", "status:COMPLETED"]),
  );
  const seenDefaults = useRef(new Set<string>());

  const counts = useMemo(
    () => countFacets(tasks, filters, userId),
    [tasks, filters, userId],
  );
  const visible = useMemo(
    () => filterTasks(tasks, filters, userId),
    [tasks, filters, userId],
  );
  const groups = useMemo(() => groupTasks(visible, groupBy), [visible, groupBy]);

  // Collapse the completed lane (and other defaults) the first time it appears,
  // without overriding a lane the user has since opened.
  useEffect(() => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      for (const group of groups) {
        if (
          group.collapsedByDefault &&
          !seenDefaults.current.has(group.key)
        ) {
          seenDefaults.current.add(group.key);
          next.add(group.key);
        }
      }
      return next;
    });
  }, [groups]);

  const allOn = !hasActiveFilters(filters);

  function togglePriority(priority: MgmtPriority) {
    const has = filters.priorities.includes(priority);
    onFiltersChange({
      ...filters,
      priorities: has
        ? filters.priorities.filter((entry) => entry !== priority)
        : [...filters.priorities, priority],
    });
  }

  function toggleBlocked() {
    const has = filters.statuses.includes("BLOCKED");
    onFiltersChange({
      ...filters,
      statuses: has
        ? filters.statuses.filter((entry) => entry !== "BLOCKED")
        : ["BLOCKED"],
    });
  }

  function toggleLane(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const shown = visible.length.toLocaleString();
  const total = tasks.length.toLocaleString();

  return (
    <section className="mgmt-canvas" aria-label="Task workspace">
      <div className="mgmt-facets">
        <label className="mgmt-search-wrap">
          <Search size={14} aria-hidden="true" />
          <input
            id="mgmt-search"
            className="mgmt-search"
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks, projects, people…"
            value={filters.q}
            onChange={(event) =>
              onFiltersChange({ ...filters, q: event.target.value })
            }
          />
        </label>

        <button
          type="button"
          className="mgmt-facet"
          aria-pressed={allOn}
          onClick={() => onFiltersChange(EMPTY_FILTERS)}
        >
          All
          <span className="mgmt-facet-count">{counts.all}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          data-tone="high"
          aria-pressed={filters.priorities.includes("HIGH")}
          onClick={() => togglePriority("HIGH")}
        >
          High
          <span className="mgmt-facet-count">{counts.high}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          data-tone="medium"
          aria-pressed={filters.priorities.includes("MEDIUM")}
          onClick={() => togglePriority("MEDIUM")}
        >
          Medium
          <span className="mgmt-facet-count">{counts.medium}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          data-tone="low"
          aria-pressed={filters.priorities.includes("LOW")}
          onClick={() => togglePriority("LOW")}
        >
          Low
          <span className="mgmt-facet-count">{counts.low}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          data-tone="overdue"
          aria-pressed={filters.overdue}
          onClick={() =>
            onFiltersChange({ ...filters, overdue: !filters.overdue })
          }
        >
          Overdue
          <span className="mgmt-facet-count">{counts.overdue}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          data-tone="blocked"
          aria-pressed={filters.statuses.includes("BLOCKED")}
          onClick={toggleBlocked}
        >
          Blocked
          <span className="mgmt-facet-count">{counts.blocked}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          aria-pressed={filters.unassigned}
          onClick={() =>
            onFiltersChange({ ...filters, unassigned: !filters.unassigned })
          }
        >
          Unassigned
          <span className="mgmt-facet-count">{counts.unassigned}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          aria-pressed={filters.dueWeek}
          onClick={() =>
            onFiltersChange({ ...filters, dueWeek: !filters.dueWeek })
          }
        >
          Due this week
          <span className="mgmt-facet-count">{counts.dueWeek}</span>
        </button>

        <button
          type="button"
          className="mgmt-facet"
          aria-pressed={filters.mine}
          onClick={() => onFiltersChange({ ...filters, mine: !filters.mine })}
        >
          Mine
          <span className="mgmt-facet-count">{counts.mine}</span>
        </button>

        {filters.projectId ? (
          <span className="mgmt-scope-chip">
            Project: {activeProjectName ?? "selected"}
            <button
              type="button"
              aria-label="Clear project filter"
              onClick={() => onFiltersChange({ ...filters, projectId: null })}
            >
              ×
            </button>
          </span>
        ) : null}

        {filters.assigneeId ? (
          <span className="mgmt-scope-chip">
            Assignee: {activeAssigneeName ?? "selected"}
            <button
              type="button"
              aria-label="Clear assignee filter"
              onClick={() => onFiltersChange({ ...filters, assigneeId: null })}
            >
              ×
            </button>
          </span>
        ) : null}

        {hasActiveFilters(filters) ? (
          <button
            type="button"
            className="mgmt-clear"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mgmt-canvas-bar">
        <p className="mgmt-canvas-summary">
          {shown === total ? `${total} tasks` : `${shown} of ${total} tasks`}
          {hasActiveFacets(filters) ? " · filtered" : ""}
        </p>
        <label className="mgmt-groupby">
          Group by
          <select
            value={groupBy}
            onChange={(event) =>
              onGroupByChange(event.target.value as GroupBy)
            }
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="mgmt-empty">
          <p>No tasks match these filters.</p>
          {hasActiveFilters(filters) ? (
            <button
              type="button"
              className="mgmt-clear"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mgmt-lanes">
          {groups.map((group) => {
            const bodyId = laneId(group.key);
            const isCollapsed = collapsed.has(group.key);
            return (
              <section
                key={group.key}
                className="mgmt-lane"
                data-collapsed={isCollapsed ? "true" : "false"}
              >
                <button
                  type="button"
                  className="mgmt-lane-head"
                  aria-expanded={!isCollapsed}
                  aria-controls={bodyId}
                  onClick={() => toggleLane(group.key)}
                >
                  <span
                    className="mgmt-lane-dot"
                    data-tone={group.tone}
                    aria-hidden="true"
                  />
                  <span className="mgmt-lane-title">{group.label}</span>
                  <span className="mgmt-lane-count">{group.tasks.length}</span>
                  {group.hint ? (
                    <span className="mgmt-lane-hint">{group.hint}</span>
                  ) : null}
                  <ChevronDown
                    className="mgmt-lane-chevron"
                    size={15}
                    aria-hidden="true"
                  />
                </button>
                <div className="mgmt-lane-body" id={bodyId}>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      expanded={expandedId === task.id}
                      busy={busyIds.has(task.id)}
                      onToggle={() =>
                        setExpandedId((current) =>
                          current === task.id ? null : task.id,
                        )
                      }
                      onPriorityChange={onPriorityChange}
                      onStatusChange={onStatusChange}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
