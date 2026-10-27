"use client";

import { useMemo } from "react";

import { isOverdue } from "@/lib/format";
import {
  ROUND_LABELS,
  ROUND_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_TONES,
  countStatuses,
  isCompleted,
  projectIdOf,
  statusOf,
  type MgmtPlaza,
  type MgmtProject,
  type MgmtStatus,
  type MgmtTask,
  type RoundKey,
} from "@/lib/management";

function StatusDonut({ counts }: { counts: Record<MgmtStatus, number> }) {
  const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = STATUS_ORDER.map((status) => {
    const length = total ? (counts[status] / total) * circumference : 0;
    const segment = { status, length, offset };
    offset += length;
    return segment;
  });
  const description = STATUS_ORDER.map(
    (status) => `${STATUS_LABELS[status]} ${counts[status]}`,
  ).join(", ");

  return (
    <div className="cockpit-donut-layout">
      <svg
        className="cockpit-donut"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${total} tasks: ${description}`}
      >
        <circle className="track" cx="50" cy="50" r={radius} />
        <g transform="rotate(-90 50 50)">
          {segments.map(({ status, length, offset: segmentOffset }) => (
            <circle
              key={status}
              className={`segment ${STATUS_TONES[status]}`}
              cx="50"
              cy="50"
              r={radius}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-segmentOffset}
            />
          ))}
        </g>
        <text className="total" x="50" y="49">
          {total}
        </text>
        <text className="caption" x="50" y="59">
          TOTAL TASKS
        </text>
      </svg>
      <div className="cockpit-status-legend" aria-label="Task status counts">
        {STATUS_ORDER.map((status) => (
          <div className="legend-item" key={status}>
            <i
              className={`swatch ${STATUS_TONES[status]}`}
              aria-hidden="true"
            />
            <span>{STATUS_LABELS[status]}</span>
            <strong>{counts[status]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundChart({
  rounds,
}: {
  rounds: {
    round: RoundKey;
    projectCount: number;
    taskCounts: Record<MgmtStatus, number>;
  }[];
}) {
  const max = Math.max(
    1,
    ...rounds.map(({ taskCounts }) =>
      STATUS_ORDER.reduce((sum, status) => sum + taskCounts[status], 0),
    ),
  );
  return (
    <div className="cockpit-round-chart">
      {rounds.map(({ round, projectCount, taskCounts }) => {
        const total = STATUS_ORDER.reduce(
          (sum, status) => sum + taskCounts[status],
          0,
        );
        const detail = STATUS_ORDER.map(
          (status) => `${STATUS_LABELS[status]} ${taskCounts[status]}`,
        ).join(", ");
        return (
          <div
            className="cockpit-round-line"
            key={round}
            role="img"
            aria-label={`${ROUND_LABELS[round]}: ${projectCount} projects, ${total} tasks; ${detail}`}
          >
            <span className="round-name">
              {ROUND_LABELS[round]}
              <small>{projectCount} projects</small>
            </span>
            <span className="round-track" aria-hidden="true">
              {STATUS_ORDER.map((status) => (
                <i
                  key={status}
                  className={STATUS_TONES[status]}
                  style={{ width: `${(taskCounts[status] / max) * 100}%` }}
                />
              ))}
            </span>
            <strong>{total} tasks</strong>
          </div>
        );
      })}
      <div className="cockpit-chart-scale" aria-hidden="true">
        <span>0</span>
        <span>{Math.ceil(max / 2)}</span>
        <span>{max} tasks</span>
      </div>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="cockpit-chart-legend" aria-label="Chart colors">
      {STATUS_ORDER.map((status) => (
        <span key={status}>
          <i className={`swatch ${STATUS_TONES[status]}`} aria-hidden="true" />
          {STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}

export type InsightsProps = {
  tasks: MgmtTask[];
  projects: MgmtProject[];
  plazas: MgmtPlaza[];
};

/** Portfolio diagnosis: what the task canvas deliberately keeps off the fold. */
export function Insights({ tasks, projects, plazas }: InsightsProps) {
  const now = useMemo(() => new Date(), []);
  const statusCounts = useMemo(() => countStatuses(tasks), [tasks]);
  const total = tasks.length;
  const open = total - statusCounts.COMPLETED;

  const overdue = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !isCompleted(task) && isOverdue(task.dueDate, task.status),
      ).length,
    [tasks],
  );

  const completedWeek = useMemo(() => {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const weekday = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7));
    const startMs = start.getTime();
    return tasks.filter((task) => {
      if (!isCompleted(task) || !task.completedAt) return false;
      return new Date(task.completedAt).getTime() >= startMs;
    }).length;
  }, [tasks, now]);

  const rounds = useMemo(
    () =>
      ROUND_ORDER.map((round) => {
        const rows = tasks.filter((task) => task.project?.round === round);
        const taskCounts: Record<MgmtStatus, number> = {
          TODO: 0,
          IN_PROGRESS: 0,
          BLOCKED: 0,
          COMPLETED: 0,
        };
        for (const task of rows) taskCounts[statusOf(task)] += 1;
        return {
          round,
          projectCount: projects.filter((project) => project.round === round)
            .length,
          taskCounts,
        };
      }),
    [tasks, projects],
  );

  const risks = useMemo(() => {
    return projects
      .map((project) => {
        const rows = tasks.filter(
          (task) => projectIdOf(task) === project.id,
        );
        const completed = rows.filter(isCompleted).length;
        const late = rows.filter(
          (task) =>
            !isCompleted(task) && isOverdue(task.dueDate, task.status),
        ).length;
        const blocked = rows.filter(
          (task) => statusOf(task) === "BLOCKED",
        ).length;
        return {
          project,
          overdue: late,
          blocked,
          percent: rows.length
            ? Math.round((completed / rows.length) * 100)
            : 0,
          score: late * 2 + blocked,
        };
      })
      .filter((row) => row.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.project.name.localeCompare(b.project.name),
      )
      .slice(0, 5);
  }, [projects, tasks]);

  return (
    <div className="mgmt-insights">
      <div className="mgmt-insight-metrics" role="group" aria-label="Portfolio summary">
        <div className="mgmt-insight-metric">
          <span>Total tasks</span>
          <strong>{total.toLocaleString()}</strong>
        </div>
        <div className="mgmt-insight-metric">
          <span>Open</span>
          <strong>{open.toLocaleString()}</strong>
        </div>
        <div className="mgmt-insight-metric">
          <span>Overdue</span>
          <strong>{overdue.toLocaleString()}</strong>
        </div>
        <div className="mgmt-insight-metric">
          <span>Blocked</span>
          <strong>{statusCounts.BLOCKED.toLocaleString()}</strong>
        </div>
        <div className="mgmt-insight-metric">
          <span>Completed this week</span>
          <strong>{completedWeek.toLocaleString()}</strong>
        </div>
      </div>

      <div className="mgmt-insight-grid">
        <section className="mgmt-insight-card" aria-label="Task status">
          <div className="mgmt-insight-head">
            <h2>Task status</h2>
            <span>{total} tasks</span>
          </div>
          <StatusDonut counts={statusCounts} />
        </section>

        <section className="mgmt-insight-card" aria-label="Workload by round">
          <div className="mgmt-insight-head">
            <h2>Workload by round</h2>
            <span>Task volume and status</span>
          </div>
          <RoundChart rounds={rounds} />
          <StatusLegend />
        </section>

        <section className="mgmt-insight-card" aria-label="Projects needing attention">
          <div className="mgmt-insight-head">
            <h2>Projects needing attention</h2>
            <span>
              {projects.length} projects · {plazas.length} plaza sites
            </span>
          </div>
          {risks.length === 0 ? (
            <p className="mgmt-empty">
              No overdue or blocked work in the current scope.
            </p>
          ) : (
            <div className="mgmt-risk-list">
              {risks.map((row) => (
                <div className="mgmt-risk-row" key={row.project.id}>
                  <a
                    className="mgmt-risk-name"
                    href={`/projects/${row.project.id}`}
                  >
                    {row.project.name}
                  </a>
                  <span className="mgmt-risk-bar" aria-hidden="true">
                    <i style={{ width: `${row.percent}%` }} />
                  </span>
                  <span className="mgmt-risk-counts">
                    {row.overdue > 0 ? `${row.overdue} overdue` : ""}
                    {row.overdue > 0 && row.blocked > 0 ? " · " : ""}
                    {row.blocked > 0 ? `${row.blocked} blocked` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
