"use client";

import { fmtDate, isOverdue } from "@/lib/format";
import { StatusBadge } from "./status-badge";

type TaskProjectRef = {
  id: string;
  name: string;
  acronym?: string | null;
  round?: string | null;
  company?: { id: string; name: string; code?: string | null } | null;
};

export type PlazaTaskItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  updatedAt?: string | null;
  /** Always present on task API rows (project-level tasks have no plaza). */
  project?: TaskProjectRef | null;
  /** Null for project-level tasks. */
  plaza?: {
    id: string;
    name: string;
    lengthKm?: number | null;
    project?: { id: string; name: string } | null;
  } | null;
  category?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  completedBy?: { id: string; name: string } | null;
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-500/10 text-slate-600 border-slate-500/25",
  MEDIUM: "bg-[#173B33]/10 text-[#173B33] border-[#173B33]/30",
  HIGH: "bg-[#FFF1CC] text-[#704900] border-amber-500/40",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM;
  return (
    <span
      data-testid={`priority-badge-${priority.toLowerCase()}`}
      className={`inline-flex min-h-[28px] min-w-[44px] items-center justify-center rounded-[6px] border px-2 py-1 font-mono text-xs font-medium pst-transition ${style}`}
    >
      {priority}
    </span>
  );
}

/** Project/company context shared by the table and mobile cards. */
function taskContext(task: PlazaTaskItem) {
  const project = task.project ?? task.plaza?.project ?? null;
  const company = task.project?.company ?? null;
  return {
    projectName: project?.name ?? null,
    projectAcronym: task.project?.acronym ?? null,
    companyName: company?.name ?? null,
  };
}

function TaskContextLine({ task }: { task: PlazaTaskItem }) {
  const { projectName, projectAcronym, companyName } = taskContext(task);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[#66756D]">
      {task.plaza ? (
        <span>{task.plaza.name}</span>
      ) : (
        <span className="rounded-[4px] border border-[#CDD6CE] bg-[#F5F5EF] px-1.5 py-0.5 font-medium text-[#173B33]">
          Project-level
        </span>
      )}
      {projectName ? (
        <span>
          {projectAcronym ? `${projectAcronym} · ` : ""}
          {projectName}
        </span>
      ) : null}
      {companyName ? <span>{companyName}</span> : null}
      {task.category ? (
        <span className="rounded-[4px] border border-[#CDD6CE] bg-white px-1.5 py-0.5 text-[#586760]">
          {task.category.name}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Task list: full table on ≥768px, stacked cards below (no horizontal scroll).
 * Row click opens the drawer via ?task= (handled by the parent).
 */
export function TaskTable({
  tasks,
  onSelect,
}: {
  tasks: PlazaTaskItem[];
  onSelect: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-[12px] border border-[#CDD6CE] bg-white p-8 text-center font-body text-sm text-[#586760]">
        No tasks match these filters.
      </p>
    );
  }
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-[12px] border border-[#CDD6CE] bg-white shadow-[0_1px_2px_rgba(23,34,44,0.04)] md:block">
        <table className="w-full min-w-[820px] text-left font-body text-sm">
          <thead>
            <tr className="border-b border-[#CDD6CE] font-mono text-xs uppercase text-[#586760]">
              <th scope="col" className="p-4 font-medium">
                Status
              </th>
              <th scope="col" className="p-4 font-medium">
                Task
              </th>
              <th scope="col" className="p-4 font-medium">
                Assignee
              </th>
              <th scope="col" className="p-4 font-medium">
                Priority
              </th>
              <th scope="col" className="p-4 font-medium">
                Due
              </th>
              <th scope="col" className="p-4 font-medium">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.status);
              return (
                <tr
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelect(task.id);
                  }}
                  tabIndex={0}
                  className="cursor-pointer border-b border-[#CDD6CE] pst-transition last:border-0 hover:bg-[#FAFBFC]"
                >
                  <td className="p-4 align-top">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-[#1C2824]">
                      {task.title}
                    </span>
                    <span className="mt-1 block">
                      <TaskContextLine task={task} />
                    </span>
                  </td>
                  <td className="p-4 align-top text-[#1C2824]">
                    {task.assignee?.name ?? "—"}
                  </td>
                  <td className="p-4 align-top">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td
                    className={`p-4 align-top font-mono text-xs ${overdue ? "font-medium text-[#8F2824]" : "text-[#586760]"}`}
                  >
                    {fmtDate(task.dueDate)}
                    {overdue ? " · overdue" : ""}
                  </td>
                  <td className="p-4 align-top font-mono text-xs text-[#586760]">
                    {fmtDate(task.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (<768px) */}
      <div className="flex flex-col gap-3 md:hidden">
        {tasks.map((task) => {
          const overdue = isOverdue(task.dueDate, task.status);
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect(task.id)}
              className="flex min-h-[44px] flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white p-4 text-left shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
            >
              <span className="flex items-center justify-between gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </span>
              <span className="font-display text-base font-semibold tracking-[-0.02em] text-[#1C2824]">
                {task.title}
              </span>
              <TaskContextLine task={task} />
              <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#586760]">
                <span>{task.assignee?.name ?? "Unassigned"}</span>
                <span
                  className={overdue ? "font-medium text-[#8F2824]" : undefined}
                >
                  Due {fmtDate(task.dueDate)}
                  {overdue ? " · overdue" : ""}
                </span>
                <span>Upd {fmtDate(task.updatedAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
