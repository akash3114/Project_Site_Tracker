"use client";

import { ChevronDown } from "lucide-react";

import { fmtDate, isOverdue } from "@/lib/format";
import {
  ALLOWED_TRANSITIONS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_TONES,
  departmentNameOf,
  isCompleted,
  isHeadOfficeTask,
  priorityOf,
  statusOf,
  type MgmtPriority,
  type MgmtStatus,
  type MgmtTask,
} from "@/lib/management";

function transitionLabel(from: MgmtStatus, to: MgmtStatus): string {
  if (to === "COMPLETED") return "Complete";
  if (to === "BLOCKED") return "Block";
  if (to === "IN_PROGRESS") return from === "BLOCKED" ? "Unblock" : "Start";
  return "Move to To do";
}

function projectLine(task: MgmtTask): string {
  if (isHeadOfficeTask(task)) return "Head Office";
  const project = task.project ?? task.plaza?.project ?? null;
  if (!project) return "Project";
  const acronym = "acronym" in project ? project.acronym : null;
  return acronym ? `${acronym} · ${project.name}` : project.name;
}

export type TaskRowProps = {
  task: MgmtTask;
  expanded: boolean;
  busy?: boolean;
  onToggle: () => void;
  onPriorityChange: (task: MgmtTask, priority: MgmtPriority) => void;
  onStatusChange: (task: MgmtTask, status: MgmtStatus) => void;
  onOpen: (task: MgmtTask) => void;
};

/**
 * One task in the canvas. Collapsed it carries every answering detail; expanded
 * it exposes description, provenance and in-place status/priority controls so
 * the drawer is only for deep work.
 */
export function TaskRow({
  task,
  expanded,
  busy = false,
  onToggle,
  onPriorityChange,
  onStatusChange,
  onOpen,
}: TaskRowProps) {
  const status = statusOf(task);
  const priority = priorityOf(task);
  const completed = isCompleted(task);
  const late = isOverdue(task.dueDate, task.status);
  const transitions = ALLOWED_TRANSITIONS[status];
  const detailId = `task-detail-${task.id}`;

  return (
    <article
      className="mgmt-row"
      data-expanded={expanded ? "true" : "false"}
      data-status={STATUS_TONES[status]}
      data-priority={priority}
    >
      <button
        type="button"
        className="mgmt-row-main"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="mgmt-pill" data-status={STATUS_TONES[status]}>
          {STATUS_LABELS[status]}
        </span>

        <span className="mgmt-row-copy">
          <strong className="mgmt-row-title" title={task.title}>
            {task.title}
          </strong>
          {isHeadOfficeTask(task) ? (
            <span className="mgmt-ho-badge">HO</span>
          ) : null}
          <span className="mgmt-row-context">
            {isHeadOfficeTask(task) ? (
              <span className="mgmt-row-tag" data-level="department">
                {departmentNameOf(task) ?? "Head Office"}
              </span>
            ) : task.plaza ? (
              <span className="mgmt-row-tag">{task.plaza.name}</span>
            ) : (
              <span className="mgmt-row-tag" data-level="project">
                Project-level
              </span>
            )}
            <span>{projectLine(task)}</span>
            {task.category ? (
              <span className="mgmt-row-tag">{task.category.name}</span>
            ) : null}
          </span>
        </span>

        <span className="mgmt-priority-chip" data-priority={priority}>
          {PRIORITY_LABELS[priority]}
        </span>

        <span className="mgmt-row-owner">
          {task.assignee?.name ?? "Unassigned"}
        </span>

        <span className="mgmt-row-due" data-late={late ? "true" : "false"}>
          {task.dueDate ? `Due ${fmtDate(task.dueDate)}` : "No due date"}
          {late ? " · late" : ""}
        </span>

        <ChevronDown
          className="mgmt-row-chevron"
          size={15}
          aria-hidden="true"
        />

        {busy ? (
          <span className="mgmt-row-saving" aria-live="polite">
            Saving…
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mgmt-row-detail" id={detailId}>
          <p className="mgmt-row-description">
            {task.description?.trim() || "No description."}
          </p>

          <dl className="mgmt-row-meta">
            <div className="mgmt-row-meta-item">
              <dt>Category</dt>
              <dd>{task.category?.name ?? "None"}</dd>
            </div>
            <div className="mgmt-row-meta-item">
              <dt>Created by</dt>
              <dd>{task.createdBy?.name ?? "—"}</dd>
            </div>
            <div className="mgmt-row-meta-item">
              <dt>Updated</dt>
              <dd>{fmtDate(task.updatedAt)}</dd>
            </div>
            {completed ? (
              <div className="mgmt-row-meta-item">
                <dt>Completed by</dt>
                <dd>
                  {task.completedBy?.name ?? "—"}
                  {task.completedAt ? ` · ${fmtDate(task.completedAt)}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mgmt-row-actions">
            {completed ? (
              <p className="mgmt-row-note">
                Completed tasks are locked. Reopen from the full task view.
              </p>
            ) : (
              <>
                <div className="mgmt-action-group">
                  {transitions.map((to, index) => (
                    <button
                      key={to}
                      type="button"
                      className="mgmt-action"
                      data-primary={index === 0 ? "true" : "false"}
                      disabled={busy}
                      onClick={() => onStatusChange(task, to)}
                    >
                      {transitionLabel(status, to)}
                    </button>
                  ))}
                </div>
                <div
                  className="mgmt-mini-priority"
                  role="group"
                  aria-label="Priority"
                >
                  {PRIORITY_ORDER.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="mgmt-mini-priority-option"
                      data-priority={value}
                      aria-pressed={priority === value}
                      disabled={busy}
                      onClick={() => onPriorityChange(task, value)}
                    >
                      {PRIORITY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              className="mgmt-open-full"
              onClick={() => onOpen(task)}
            >
              Open full task →
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
