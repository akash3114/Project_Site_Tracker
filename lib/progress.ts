import type { Prisma, TaskStatus } from "@prisma/client";

/** Task progress derived from status (locked mapping). */
export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 50,
  BLOCKED: -1, // sentinel: keep last non-blocked value, flagged in UI
  COMPLETED: 100,
};

export function taskProgress(
  status: TaskStatus,
  lastNonBlocked = 50,
): number {
  if (status === "BLOCKED") return lastNonBlocked;
  return STATUS_PROGRESS[status];
}

export function plazaProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((100 * completed) / total);
}

export type TaskScopeWhere = Prisma.TaskWhereInput;
