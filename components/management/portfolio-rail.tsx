"use client";

import { useEffect, useMemo, useState } from "react";

import { isOverdue } from "@/lib/format";
import {
  ROUND_LABELS,
  ROUND_ORDER,
  isCompleted,
  isHeadOfficeTask,
  projectIdOf,
  statusOf,
  type MgmtDepartment,
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

/** Departments shown before the rail asks whether to expand. */
const VISIBLE_DEPARTMENTS = 6;

/**
 * Search haystack for the fixed "All Head Office" row. Covers "all", "head",
 * "office", "ho" and the full phrase.
 */
const HEAD_OFFICE_HAYSTACK = "all head office ho";

export type PortfolioRailProps = {
  projects: MgmtProject[];
  departments: MgmtDepartment[];
  tasks: MgmtTask[];
  plazaCount: number;
  /** Scope keys (`project:<id>`, `department:<id>`, `head-office`, …). */
  selectedScopes: string[];
  /** The parent toggles: passing an active key again clears it. */
  onToggleScope: (key: string) => void;
  onViewAll: () => void;
};

/**
 * Compact portfolio register beside the canvas. Head Office departments sit
 * pinned above the round groups; clicking any row filters the tasks in place.
 * The arrow opens the full project page.
 */
export function PortfolioRail({
  projects,
  departments,
  tasks,
  selectedScopes,
  onToggleScope,
  onViewAll,
}: PortfolioRailProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<Bucket>>(
    () => new Set(BUCKET_ORDER),
  );
  const [hoCollapsed, setHoCollapsed] = useState(true);
  const [showAllDepartments, setShowAllDepartments] = useState(false);

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

  const headOffice = useMemo(() => {
    const rows = tasks.filter(isHeadOfficeTask);
    return {
      total: rows.length,
      open: rows.filter((task) => !isCompleted(task)).length,
    };
  }, [tasks]);

  const activeDepartments = useMemo(
    () =>
      departments
        .filter((department) => department.active !== false)
        .slice()
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            a.name.localeCompare(b.name),
        ),
    [departments],
  );

  const needle = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!needle) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.acronym ?? ""} ${project.company?.name ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [projects, needle]);

  const filteredDepartments = useMemo(() => {
    if (!needle) return activeDepartments;
    return activeDepartments.filter((department) =>
      `${department.name} ${department.code ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [activeDepartments, needle]);

  // While searching, every matching department is shown; otherwise the list is
  // capped so the rail stays short.
  const shownDepartments = needle
    ? filteredDepartments
    : showAllDepartments
      ? filteredDepartments
      : filteredDepartments.slice(0, VISIBLE_DEPARTMENTS);

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

  // Stable dependency keys so the effect re-runs when the match set changes,
  // not on every render of the derived arrays.
  const matchingRounds = groups.map((group) => group.key).join("|");
  const matchingDepartments = filteredDepartments
    .map((department) => department.id)
    .join("|");

  // The "All Head Office" row is a fixed entry, not a department, so it has to
  // be matched against its own haystack. Without this it shows up beside every
  // department match but disappears when searched for by name.
  const headOfficeRowMatches =
    !needle || HEAD_OFFICE_HAYSTACK.includes(needle);
  const headOfficeHasMatches =
    headOfficeRowMatches || filteredDepartments.length > 0;
  // During a search the header counts matching entries (the fixed row plus
  // matching departments); otherwise it counts all active departments.
  const headOfficeCount = needle
    ? filteredDepartments.length + (headOfficeRowMatches ? 1 : 0)
    : activeDepartments.length;

  /**
   * Collapsed by default. A search opens only the categories that hold
   * matches and keeps the rest closed, so results are visible without the
   * full register spilling open. Clearing the query returns to the default.
   */
  useEffect(() => {
    if (!needle) {
      setCollapsed(new Set(BUCKET_ORDER));
      setHoCollapsed(true);
      return;
    }
    const matches = new Set(matchingRounds ? matchingRounds.split("|") : []);
    setCollapsed(new Set(BUCKET_ORDER.filter((key) => !matches.has(key))));
    setHoCollapsed(!headOfficeHasMatches);
  }, [needle, matchingRounds, matchingDepartments, headOfficeHasMatches]);

  function toggleGroup(key: Bucket) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const headOfficeSelected = selectedScopes.includes("head-office");

  return (
    <aside className="mgmt-rail" aria-label="Projects">
      <div className="mgmt-rail-head">
        <h2 className="mgmt-rail-title">Projects</h2>
        <span className="mgmt-rail-stats">
          {projects.length} projects · {activeDepartments.length} departments ·{" "}
          {openCount} open
        </span>
        <input
          className="mgmt-rail-search"
          type="search"
          placeholder="Find a project or department"
          aria-label="Find a project or department"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="mgmt-rail-scroll">
        <div
          className="mgmt-rail-ho"
          data-ho="true"
          data-collapsed={hoCollapsed ? "true" : "false"}
        >
          <button
            type="button"
            className="mgmt-rail-ho-head"
            aria-expanded={!hoCollapsed}
            onClick={() => setHoCollapsed((value) => !value)}
          >
            <span className="mgmt-rail-group-label">Head Office</span>
            <span className="mgmt-rail-group-count">
              {headOfficeCount}
            </span>
          </button>

          <div className="mgmt-rail-ho-body">
            {headOfficeRowMatches ? (
              <div
                className="mgmt-rail-ho-row"
                data-selected={headOfficeSelected ? "true" : "false"}
              >
                <button
                  type="button"
                  className="mgmt-rail-ho-main"
                  aria-pressed={headOfficeSelected}
                  title="All Head Office — filter tasks"
                  onClick={() => onToggleScope("head-office")}
                >
                  <span className="mgmt-rail-acronym">HO</span>
                  <span className="mgmt-rail-copy">
                    <span className="mgmt-rail-name">All Head Office</span>
                    <span className="mgmt-rail-meta">
                      {headOffice.open} open · {headOffice.total} tasks
                    </span>
                  </span>
                </button>
              </div>
            ) : null}

            {shownDepartments.map((department) => {
              const key = `department:${department.id}`;
              const selected = selectedScopes.includes(key);
              const percent = Math.max(
                0,
                Math.min(100, department.progressPct ?? 0),
              );
              return (
                <div
                  key={department.id}
                  className="mgmt-rail-ho-row"
                  data-selected={selected ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="mgmt-rail-ho-main"
                    aria-pressed={selected}
                    title={`${department.name} — filter tasks`}
                    onClick={() => onToggleScope(key)}
                  >
                    <span className="mgmt-rail-acronym">
                      {department.code?.trim() || "—"}
                    </span>
                    <span className="mgmt-rail-copy">
                      <span className="mgmt-rail-name">{department.name}</span>
                      <span className="mgmt-rail-meta">
                        {department.memberCount ?? 0} members ·{" "}
                        {department.open ?? 0} open
                      </span>
                    </span>
                  </button>
                  <span
                    className="mgmt-rail-progress mgmt-rail-ho-progress"
                    aria-hidden="true"
                  >
                    <i style={{ width: `${percent}%` }} />
                  </span>
                </div>
              );
            })}

            {!needle &&
            filteredDepartments.length > VISIBLE_DEPARTMENTS ? (
              <button
                type="button"
                className="mgmt-rail-ho-more"
                aria-expanded={showAllDepartments}
                onClick={() => setShowAllDepartments((value) => !value)}
              >
                {showAllDepartments
                  ? "Show fewer departments"
                  : `Show all ${filteredDepartments.length} departments`}
              </button>
            ) : null}
          </div>
        </div>

        {needle && groups.length === 0 && !headOfficeHasMatches ? (
          <p className="mgmt-rail-empty" role="status">
            No projects or departments match “{query.trim()}”.
          </p>
        ) : null}

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
                  const selected = selectedScopes.includes(
                    `project:${project.id}`,
                  );
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
                        onClick={() => onToggleScope(`project:${project.id}`)}
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
      </div>

      <div className="mgmt-rail-foot">
        <button type="button" className="mgmt-rail-link" onClick={onViewAll}>
          View full register →
        </button>
      </div>
    </aside>
  );
}
