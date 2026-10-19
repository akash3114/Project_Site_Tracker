import { cn } from "@/lib/utils";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed";

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-slate-500/10 text-slate-600 border-slate-500/25",
  in_progress: "bg-[#173B33]/10 text-[#173B33] border-[#173B33]/30",
  blocked: "bg-[#FFF1CC] text-[#704900] border-amber-500/40",
  completed: "bg-[#E8F0DD] text-[#385A2B] border-green-500/40",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
};

/** Accepts API (UPPERCASE) and UI (lowercase) status spellings. */
export function normalizeStatus(status: string): TaskStatus {
  const s = status.toLowerCase();
  if (s === "todo" || s === "in_progress" || s === "blocked" || s === "completed") {
    return s;
  }
  return "todo";
}

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus | string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  return (
    <span
      data-testid={`status-badge-${key}`}
      className={cn(
        "inline-flex min-h-[28px] min-w-[44px] items-center justify-center rounded-[6px] border px-2 py-1 font-mono text-xs font-medium pst-transition",
        STATUS_STYLES[key],
        className
      )}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}
