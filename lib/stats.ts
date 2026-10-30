import type { Prisma } from "@prisma/client";

import { startOfWeekIst, todayIst } from "./dates";
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

export type DepartmentStats = {
  memberCount: number;
  total: number;
  open: number;
  completed: number;
  blocked: number;
  overdue: number;
  progressPct: number;
};

export type HeadOfficeStats = {
  total: number;
  open: number;
  completed: number;
  blocked: number;
  overdue: number;
  progressPct: number;
};

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

/** Stats for one Head Office department, restricted to the caller's task scope. */
export async function departmentStats(
  departmentId: string,
  scope: Prisma.TaskWhereInput,
): Promise<DepartmentStats> {
  const [memberCount, total, completed, blocked, overdue] = await Promise.all([
    db.headOfficeMembership.count({ where: { departmentId } }),
    db.task.count({ where: scoped(scope, { departmentId }) }),
    db.task.count({
      where: scoped(scope, { departmentId, status: "COMPLETED" }),
    }),
    db.task.count({ where: scoped(scope, { departmentId, status: "BLOCKED" }) }),
    db.task.count({
      where: scoped(scope, {
        departmentId,
        status: { not: "COMPLETED" },
        dueDate: { lt: startOfToday() },
      }),
    }),
  ]);
  return {
    memberCount,
    total,
    open: total - completed,
    completed,
    blocked,
    overdue,
    progressPct: plazaProgress(completed, total),
  };
}

/**
 * Head Office totals: every task with a department, plus Head Office-level
 * tasks (no project, no department).
 */
export async function headOfficeStats(
  scope: Prisma.TaskWhereInput,
): Promise<HeadOfficeStats> {
  const headOffice: Prisma.TaskWhereInput = {
    OR: [{ departmentId: { not: null } }, { projectId: null }],
  };
  const [total, completed, blocked, overdue] = await Promise.all([
    db.task.count({ where: scoped(scope, headOffice) }),
    db.task.count({
      where: scoped(scope, { ...headOffice, status: "COMPLETED" }),
    }),
    db.task.count({
      where: scoped(scope, { ...headOffice, status: "BLOCKED" }),
    }),
    db.task.count({
      where: scoped(scope, {
        ...headOffice,
        status: { not: "COMPLETED" },
        dueDate: { lt: startOfToday() },
      }),
    }),
  ]);
  return {
    total,
    open: total - completed,
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
        completedAt: { gte: startOfWeekIst() },
      }),
    }),
  ]);
  return { open, overdue, blocked, completedWeek };
}

function startOfToday(): Date {
  return todayIst();
}
