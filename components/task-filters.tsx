"use client";

export type TaskStatusFilter =
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED";
export type TaskPriorityFilter = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TaskFilters = {
  status?: TaskStatusFilter[];
  priority?: TaskPriorityFilter[];
  assigneeId?: string;
  overdueOnly?: boolean;
  q?: string;
};

export type AssigneeOption = { id: string; name: string };

const STATUSES: TaskStatusFilter[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
];
const PRIORITIES: TaskPriorityFilter[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function selectClass(extra = "") {
  return `min-h-[44px] rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm text-[#17222C] pst-transition ${extra}`;
}

/**
 * Sticky-friendly filter controls for the plaza tasks view.
 * Single-select status/priority map to the API's `status=`/`priority=`
 * params; the TaskFilters type keeps arrays for forward-compat.
 */
export function TaskFiltersBar({
  filters,
  onChange,
  assignees,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  assignees: AssigneeOption[];
}) {
  const status = filters.status?.[0] ?? "";
  const priority = filters.priority?.[0] ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks…"
        value={filters.q ?? ""}
        onChange={(e) => onChange({ ...filters, q: e.target.value })}
        className="min-h-[44px] min-w-[180px] flex-1 rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm text-[#17222C] placeholder:text-[#8A97A3] md:max-w-xs"
      />
      <select
        aria-label="Filter by status"
        value={status}
        onChange={(e) =>
          onChange({
            ...filters,
            status: e.target.value
              ? [e.target.value as TaskStatusFilter]
              : undefined,
          })
        }
        className={selectClass()}
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by priority"
        value={priority}
        onChange={(e) =>
          onChange({
            ...filters,
            priority: e.target.value
              ? [e.target.value as TaskPriorityFilter]
              : undefined,
          })
        }
        className={selectClass()}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by assignee"
        value={filters.assigneeId ?? ""}
        onChange={(e) =>
          onChange({ ...filters, assigneeId: e.target.value || undefined })
        }
        className={selectClass()}
      >
        <option value="">All assignees</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-pressed={filters.overdueOnly ?? false}
        onClick={() =>
          onChange({ ...filters, overdueOnly: !filters.overdueOnly })
        }
        className={`min-h-[44px] rounded-[6px] border px-3 font-body text-sm pst-transition ${
          filters.overdueOnly
            ? "border-[#DC2626] bg-[#FEF2F2] font-medium text-[#DC2626]"
            : "border-[rgba(23,34,44,0.08)] bg-white text-[#5C6F7E] hover:text-[#17222C]"
        }`}
      >
        Overdue only
      </button>
      {(status || priority || filters.assigneeId || filters.overdueOnly || filters.q) ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="min-h-[44px] rounded-[6px] px-3 font-body text-sm text-[#5C6F7E] pst-transition hover:text-[#17222C]"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
