"use client";

import { fmtDate, isOverdue } from "@/lib/format";
import { StatusBadge } from "./status-badge";

export type PlazaTaskItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  updatedAt?: string | null;
  plaza?: { id: string; name: string; project?: { id: string; name: string } };
  assignee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-500/10 text-slate-600 border-slate-500/25",
  MEDIUM: "bg-[#5E6AD2]/10 text-[#5E6AD2] border-[#5E6AD2]/30",
  HIGH: "bg-[#FEF3C7] text-[#92400E] border-amber-500/40",
  CRITICAL: "bg-[#FEE2E2] text-[#DC2626] border-red-500/40",
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
      <p className="rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-8 text-center font-body text-sm text-[#5C6F7E]">
        No tasks match these filters.
      </p>
    );
  }
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white shadow-[0_1px_2px_rgba(23,34,44,0.04)] md:block">
        <table className="w-full min-w-[720px] text-left font-body text-sm">
          <thead>
            <tr className="border-b border-[rgba(23,34,44,0.08)] font-mono text-xs uppercase text-[#5C6F7E]">
              <th scope="col" className="p-4 font-medium">
                Status
              </th>
              <th scope="col" className="p-4 font-medium">
                Title
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
                  className="cursor-pointer border-b border-[rgba(23,34,44,0.08)] pst-transition last:border-0 hover:bg-[#FAFBFC]"
                >
                  <td className="p-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-[#17222C]">
                      {task.title}
                    </span>
                  </td>
                  <td className="p-4 text-[#17222C]">
                    {task.assignee?.name ?? "—"}
                  </td>
                  <td className="p-4">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td
                    className={`p-4 font-mono text-xs ${overdue ? "font-medium text-[#DC2626]" : "text-[#5C6F7E]"}`}
                  >
                    {fmtDate(task.dueDate)}
                    {overdue ? " · overdue" : ""}
                  </td>
                  <td className="p-4 font-mono text-xs text-[#5C6F7E]">
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
              className="flex min-h-[44px] flex-col gap-2 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 text-left shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
            >
              <span className="flex items-center justify-between gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </span>
              <span className="font-display text-base font-semibold tracking-[-0.02em] text-[#17222C]">
                {task.title}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#5C6F7E]">
                <span>{task.assignee?.name ?? "Unassigned"}</span>
                <span
                  className={overdue ? "font-medium text-[#DC2626]" : undefined}
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
