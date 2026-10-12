import type { TaskStatus } from "@prisma/client";

/** Allowed status transitions. COMPLETED exits only via /reopen (TASKS.md T-020). */
export const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "COMPLETED"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED", "TODO"],
  BLOCKED: ["IN_PROGRESS", "TODO", "COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}
