import { NextResponse } from "next/server";

import {
  canManageProjects,
  getSessionUser,
  requirePlazaAccess,
  taskScopeWhere,
} from "@/lib/access";
import { todayIst } from "@/lib/dates";
import { logAudit, snapshot } from "@/lib/audit";
import { db } from "@/lib/db";
import { plazaProgress } from "@/lib/progress";
import { updatePlazaSchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/plazas/:id → scoped detail with task stats. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plaza = await db.plaza.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          acronym: true,
          state: true,
          piu: true,
          ro: true,
          company: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await requirePlazaAccess(user, plaza.id);

  const today = todayIst();
  const scope = await taskScopeWhere(user);
  const base = { AND: [scope, { plazaId: plaza.id }] };
  const [total, completed, blocked, overdue] = await Promise.all([
    db.task.count({ where: base }),
    db.task.count({ where: { AND: [scope, { plazaId: plaza.id, status: "COMPLETED" }] } }),
    db.task.count({ where: { AND: [scope, { plazaId: plaza.id, status: "BLOCKED" }] } }),
    db.task.count({
      where: {
        AND: [
          scope,
          {
            plazaId: plaza.id,
            status: { not: "COMPLETED" },
            dueDate: { lt: today },
          },
        ],
      },
    }),
  ]);

  return NextResponse.json({
    id: plaza.id,
    projectId: plaza.projectId,
    project: plaza.project,
    name: plaza.name,
    lengthKm: plaza.lengthKm,
    active: plaza.active,
    status: plaza.active ? "ACTIVE" : "ARCHIVED",
    task: { total, completed, blocked, overdue },
    progressPct: plazaProgress(completed, total),
  });
}

/** PATCH /api/plazas/:id → Admin / Head Office. */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = updatePlazaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const plaza = await db.plaza.findUnique({ where: { id } });
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.plaza.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.lengthKm !== undefined
          ? { lengthKm: parsed.data.lengthKm ?? null }
          : {}),
        ...(parsed.data.active !== undefined
          ? { active: parsed.data.active }
          : {}),
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
      entityId: next.id,
      action: parsed.data.active === false ? "ARCHIVE" : "UPDATE",
      before: snapshot(plaza, ["projectId", "name", "lengthKm", "active"]),
      after: snapshot(next, ["projectId", "name", "lengthKm", "active"]),
    });
    return next;
  });

  return NextResponse.json(updated);
}
