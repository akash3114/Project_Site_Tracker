import { fmtDate, isOverdue } from "@/lib/format";
import type { SpotlightTask } from "@/lib/dashboard";
import { StatusBadge } from "./status-badge";

export type { SpotlightTask };

/**
 * Overdue + Blocked spotlight (top 20). Props-driven; rows come from
 * GET /api/tasks (live) or seed-shaped fallback — no business data inside.
 */
export function SpotlightTable({ tasks }: { tasks: SpotlightTask[] }) {
  const rows = tasks.slice(0, 20);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left font-body text-sm">
        <thead>
          <tr className="border-b border-[#CDD6CE] font-mono text-xs uppercase text-[#586760]">
            <th scope="col" className="p-4 font-medium">Status</th>
            <th scope="col" className="p-4 font-medium">Task</th>
            <th scope="col" className="p-4 font-medium">Plaza</th>
            <th scope="col" className="p-4 font-medium">Length</th>
            <th scope="col" className="p-4 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            return (
              <tr
                key={task.id}
                className="border-b border-[#CDD6CE] pst-transition last:border-0 hover:bg-[#FAFBFC]"
              >
                <td className="p-4">
                  <StatusBadge status={task.status} />
                </td>
                <td className="p-4">
                  <span className="font-medium text-[#1C2824]">{task.title}</span>
                  <span className="mt-0.5 block font-mono text-xs text-[#66756D]">
                    {task.plaza.projectName}
                    {task.assignee ? ` · ${task.assignee.name}` : ""}
                  </span>
                </td>
                <td className="p-4 text-[#1C2824]">{task.plaza.name}</td>
                <td className="p-4 font-mono text-xs text-[#586760]">
                  {typeof task.plaza.lengthKm === "number"
                    ? `${task.plaza.lengthKm} km`
                    : (task.plaza.chainage ?? "—")}
                </td>
                <td
                  className={`p-4 font-mono text-xs ${overdue ? "font-medium text-[#8F2824]" : "text-[#586760]"}`}
                >
                  {fmtDate(task.dueDate)}
                  {overdue ? " · overdue" : ""}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-8 text-center font-body text-sm text-[#586760]">
                No overdue or blocked tasks. Field work is on track.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
