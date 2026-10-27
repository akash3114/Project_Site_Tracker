"use client";

import { useMemo, useState } from "react";

import { isOverdue } from "@/lib/format";
import {
  ROUND_LABELS,
  ROUND_ORDER,
  isCompleted,
  projectIdOf,
  statusOf,
  type MgmtProject,
  type MgmtTask,
  type RoundKey,
} from "@/lib/management";

type Bucket = RoundKey | "NONE";

function roundKey(round?: string | null): Bucket {
  return round && (ROUND_ORDER as readonly string[]).includes(round)
    ? (round as RoundKey)
    : "NONE";
}

const BUCKET_ORDER: Bucket[] = [...ROUND_ORDER, "NONE"];
const BUCKET_LABELS: Record<Bucket, string> = {
  ...ROUND_LABELS,
  NONE: "No round",
};

export type PortfolioRailProps = {
  projects: MgmtProject[];
  tasks: MgmtTask[];
  plazaCount: number;
  selectedProjectId: string | null;
  /** The parent toggles: passing the selected id again clears the filter. */
  onSelectProject: (id: string | null) => void;
  onViewAll: () => void;
};

/**
 * Compact portfolio register beside the canvas. Clicking a project filters the
 * tasks in place; the arrow opens the full project page.
 */
export function PortfolioRail({
  projects,
  tasks,
  plazaCount,
  selectedProjectId,
  onSelectProject,
  onViewAll,
}: PortfolioRailProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<Bucket>>(new Set());

  const stats = useMemo(() => {
    const byProject = new Map<
      string,
      { total: number; completed: number; overdue: number; blocked: number }
    >();
    for (const task of tasks) {
      const id = projectIdOf(task);
      if (!id) continue;
      const entry =
        byProject.get(id) ?? {
          total: 0,
          completed: 0,
          overdue: 0,
          blocked: 0,
        };
      entry.total += 1;
      if (isCompleted(task)) {
        entry.completed += 1;
      } else {
        if (isOverdue(task.dueDate, task.status)) entry.overdue += 1;
        if (statusOf(task) === "BLOCKED") entry.blocked += 1;
      }
      byProject.set(id, entry);
    }
    return byProject;
  }, [tasks]);

  const openCount = useMemo(
    () => tasks.filter((task) => !isCompleted(task)).length,
    [tasks],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.acronym ?? ""} ${project.company?.name ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [projects, query]);

  const groups = useMemo(() => {
    const byRound = new Map<Bucket, MgmtProject[]>();
    for (const project of filtered) {
      const key = roundKey(project.round);
      const rows = byRound.get(key) ?? [];
      rows.push(project);
      byRound.set(key, rows);
    }
    return BUCKET_ORDER.filter((key) => byRound.has(key)).map((key) => ({
      key,
      label: BUCKET_LABELS[key],
      projects: (byRound.get(key) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  }, [filtered]);

  function toggleGroup(key: Bucket) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside className="mgmt-rail" aria-label="Portfolio">
      <div className="mgmt-rail-head">
        <h2 className="mgmt-rail-title">Portfolio</h2>
        <span className="mgmt-rail-stats">
          {projects.length} projects · {plazaCount} plazas · {openCount} open
        </span>
        <input
          className="mgmt-rail-search"
          type="search"
          placeholder="Find a project"
          aria-label="Find a project"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="mgmt-rail-scroll">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <div
              key={group.key}
              className="mgmt-rail-group"
              data-collapsed={isCollapsed ? "true" : "false"}
            >
              <button
                type="button"
                className="mgmt-rail-group-head"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.key)}
              >
                <span className="mgmt-rail-group-label">{group.label}</span>
                <span className="mgmt-rail-group-count">
                  {group.projects.length}
                </span>
              </button>

              <div className="mgmt-rail-group-body">
                {group.projects.map((project) => {
                  const entry = stats.get(project.id) ?? {
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    blocked: 0,
                  };
                  const percent = entry.total
                    ? Math.round((entry.completed / entry.total) * 100)
                    : 0;
                  const selected = selectedProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className="mgmt-rail-row"
                      data-selected={selected ? "true" : "false"}
                    >
                      <button
                        type="button"
                        className="mgmt-rail-row-main"
                        aria-pressed={selected}
                        title={`${project.name} — filter tasks`}
                        onClick={() => onSelectProject(project.id)}
                      >
                        <span className="mgmt-rail-acronym">
                          {project.acronym?.trim() || "—"}
                        </span>
                        <span className="mgmt-rail-copy">
                          <span className="mgmt-rail-name">{project.name}</span>
                          <span className="mgmt-rail-meta">
                            {project.plazaCount}{" "}
                            {project.plazaCount === 1 ? "plaza" : "plazas"} ·{" "}
                            {percent}%
                          </span>
                        </span>
                        <span className="mgmt-rail-risks">
                          {entry.overdue > 0 ? (
                            <span
                              className="mgmt-rail-risk"
                              data-tone="overdue"
                              title={`${entry.overdue} overdue`}
                            >
                              {entry.overdue}
                              <span className="sr-only"> overdue</span>
                            </span>
                          ) : null}
                          {entry.blocked > 0 ? (
                            <span
                              className="mgmt-rail-risk"
                              data-tone="blocked"
                              title={`${entry.blocked} blocked`}
                            >
                              {entry.blocked}
                              <span className="sr-only"> blocked</span>
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <span className="mgmt-rail-progress" aria-hidden="true">
                        <i style={{ width: `${percent}%` }} />
                      </span>
                      <a
                        className="mgmt-rail-open"
                        href={`/projects/${project.id}`}
                        aria-label={`Open ${project.name}`}
                      >
                        ↗
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {groups.length === 0 ? (
          <p className="mgmt-rail-empty">No projects match “{query}”.</p>
        ) : null}
      </div>

      <div className="mgmt-rail-foot">
        <button type="button" className="mgmt-rail-link" onClick={onViewAll}>
          View full register →
        </button>
      </div>
    </aside>
  );
}
