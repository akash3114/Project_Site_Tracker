import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  accessiblePlazaIds,
  canManageProjects,
  getSessionUser,
  requireProjectAccess,
  taskScopeWhere,
} from "@/lib/access";
import { todayIst } from "@/lib/dates";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import { plazaProgress } from "@/lib/progress";
import { plazaSchema } from "@/lib/validations";

/** GET /api/plazas?projectId= → scoped list with per-plaza task stats. */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  if (projectId) await requireProjectAccess(user, projectId);

  const ids = await accessiblePlazaIds(user);
  const scope = await taskScopeWhere(user);
  const where: Prisma.PlazaWhereInput = {
    ...(projectId ? { projectId } : {}),
    ...(user.isAdmin || user.role === "HEAD_OFFICE"
      ? {}
      : { id: { in: ids } }),
  };

  const plazas = await db.plaza.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          name: true,
          acronym: true,
          company: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
  });

  const plazaIds = plazas.map((z) => z.id);
  const today = todayIst();

  const [statusCounts, overdueCounts] = await Promise.all([
    db.task.groupBy({
      by: ["plazaId", "status"],
      where: { AND: [scope, { plazaId: { in: plazaIds } }] },
      _count: { _all: true },
    }),
    db.task.groupBy({
      by: ["plazaId"],
      where: {
        AND: [
          scope,
          {
            plazaId: { in: plazaIds },
            status: { not: "COMPLETED" },
            dueDate: { lt: today },
          },
        ],
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<
    string,
    { total: number; completed: number; blocked: number; overdue: number }
  >();
  for (const id of plazaIds) {
    counts.set(id, { total: 0, completed: 0, blocked: 0, overdue: 0 });
  }
  for (const row of statusCounts) {
    if (!row.plazaId) continue;
    const entry = counts.get(row.plazaId);
    if (!entry) continue;
    entry.total += row._count._all;
    if (row.status === "COMPLETED") entry.completed += row._count._all;
    if (row.status === "BLOCKED") entry.blocked += row._count._all;
  }
  for (const row of overdueCounts) {
    if (!row.plazaId) continue;
    const entry = counts.get(row.plazaId);
    if (entry) entry.overdue += row._count._all;
  }

  return NextResponse.json(
    plazas.map((z) => {
      const c = counts.get(z.id) ?? {
        total: 0,
        completed: 0,
        blocked: 0,
        overdue: 0,
      };
      return {
        id: z.id,
        projectId: z.projectId,
        project: z.project,
        name: z.name,
        lengthKm: z.lengthKm,
        active: z.active,
        status: z.active ? "ACTIVE" : "ARCHIVED",
        task: c,
        progressPct: plazaProgress(c.completed, c.total),
      };
    }),
  );
}

/** POST /api/plazas → Admin / Head Office. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = plazaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await db.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const created = await db.$transaction(async (tx) => {
    const plaza = await tx.plaza.create({
      data: {
        projectId: parsed.data.projectId,
        name: parsed.data.name,
        lengthKm: parsed.data.lengthKm ?? null,
        active: parsed.data.active ?? true,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            acronym: true,
            company: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    await logAudit(tx, {
      actorId: user.id,
      entity: "Plaza",
      entityId: plaza.id,
      action: "CREATE",
      after: snapshot(plaza, [
        "projectId",
        "name",
        "lengthKm",
        "active",
      ]),
    });
    return plaza;
  });

  return NextResponse.json(created, { status: 201 });
}
