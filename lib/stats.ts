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

/** Stats for one project, restricted to plazaIds the caller may see. */
export async function projectStats(
  projectId: string,
  plazaIds: string[],
): Promise<ProjectStats> {
  const plazas = await db.plaza.findMany({
    where: { projectId, id: { in: plazaIds } },
    select: { id: true },
  });
  const ids = plazas.map((p) => p.id);
  if (ids.length === 0) {
    return { plazaCount: 0, total: 0, completed: 0, blocked: 0, overdue: 0, progressPct: 0 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [total, completed, blocked, overdue] = await Promise.all([
    db.task.count({ where: { plazaId: { in: ids } } }),
    db.task.count({ where: { plazaId: { in: ids }, status: "COMPLETED" } }),
    db.task.count({ where: { plazaId: { in: ids }, status: "BLOCKED" } }),
    db.task.count({
      where: { plazaId: { in: ids }, status: { not: "COMPLETED" }, dueDate: { lt: today } },
    }),
  ]);
  return {
    plazaCount: ids.length,
    total,
    completed,
    blocked,
    overdue,
    progressPct: plazaProgress(completed, total),
  };
}

/** Global KPIs across visible plazas. Single groupBy-style queries, no N+1. */
export async function globalStats(plazaIds: string[]): Promise<GlobalStats> {
  if (plazaIds.length === 0) return { open: 0, overdue: 0, blocked: 0, completedWeek: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [open, overdue, blocked, completedWeek] = await Promise.all([
    db.task.count({ where: { plazaId: { in: plazaIds }, status: { not: "COMPLETED" } } }),
    db.task.count({
      where: { plazaId: { in: plazaIds }, status: { not: "COMPLETED" }, dueDate: { lt: today } },
    }),
    db.task.count({ where: { plazaId: { in: plazaIds }, status: "BLOCKED" } }),
    db.task.count({
      where: { plazaId: { in: plazaIds }, status: "COMPLETED", completedAt: { gte: startOfWeekIST(new Date()) } },
    }),
  ]);
  return { open, overdue, blocked, completedWeek };
}
