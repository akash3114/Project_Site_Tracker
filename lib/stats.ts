import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { plazaProgress } from "./progress";

export type ProjectStats = {
  plazaCount: number;
  total: number;
  completed: number;
  blocked: number;
  overdue: number;
  progressPct: number;
};

export type GlobalStats = {
  open: number;
  overdue: number;
  blocked: number;
  completedWeek: number;
};

function startOfWeekIST(now: Date): Date {
  // Monday 00:00 IST ≈ Sunday 18:30 UTC previous day; approximate with UTC Monday.
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function scoped(scope: Prisma.TaskWhereInput, extra: Prisma.TaskWhereInput) {
  return { AND: [scope, extra] } satisfies Prisma.TaskWhereInput;
}

/** Stats for one project, restricted to the caller's task scope. */
export async function projectStats(
  projectId: string,
  scope: Prisma.TaskWhereInput,
): Promise<ProjectStats> {
  const [plazaCount, total, completed, blocked, overdue] = await Promise.all([
    db.plaza.count({ where: { projectId } }),
    db.task.count({ where: scoped(scope, { projectId }) }),
    db.task.count({
      where: scoped(scope, { projectId, status: "COMPLETED" }),
    }),
    db.task.count({ where: scoped(scope, { projectId, status: "BLOCKED" }) }),
    db.task.count({
      where: scoped(scope, {
        projectId,
        status: { not: "COMPLETED" },
        dueDate: { lt: startOfToday() },
      }),
    }),
  ]);
  return {
    plazaCount,
    total,
    completed,
    blocked,
    overdue,
    progressPct: plazaProgress(completed, total),
  };
}

/** Global KPIs across the caller's visible task scope. */
export async function globalStats(
  scope: Prisma.TaskWhereInput,
): Promise<GlobalStats> {
  const [open, overdue, blocked, completedWeek] = await Promise.all([
    db.task.count({ where: scoped(scope, { status: { not: "COMPLETED" } }) }),
    db.task.count({
      where: scoped(scope, {
        status: { not: "COMPLETED" },
        dueDate: { lt: startOfToday() },
      }),
    }),
    db.task.count({ where: scoped(scope, { status: "BLOCKED" }) }),
    db.task.count({
      where: scoped(scope, {
        status: "COMPLETED",
        completedAt: { gte: startOfWeekIST(new Date()) },
      }),
    }),
  ]);
  return { open, overdue, blocked, completedWeek };
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
