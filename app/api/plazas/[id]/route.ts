import { NextResponse } from "next/server";

import {
  canManageProjects,
  getSessionUser,
  requirePlazaAccess,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";
import { plazaProgress } from "@/lib/progress";
import { updatePlazaSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

/** GET /api/plazas/:id → scoped detail with task stats. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plaza = await db.plaza.findUnique({
    where: { id: params.id },
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
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await requirePlazaAccess(user, plaza.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
    state: plaza.state,
    piu: plaza.piu,
    ro: plaza.ro,
    lengthKm: plaza.lengthKm,
    active: plaza.active,
    status: plaza.active ? "ACTIVE" : "ARCHIVED",
    task: { total, completed, blocked, overdue },
    progressPct: plazaProgress(completed, total),
  });
}

/** PATCH /api/plazas/:id → Admin / Head Office. */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
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

  const plaza = await db.plaza.findUnique({ where: { id: params.id } });
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.plaza.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.state !== undefined
        ? { state: parsed.data.state ?? null }
        : {}),
      ...(parsed.data.piu !== undefined
        ? { piu: parsed.data.piu ?? null }
        : {}),
      ...(parsed.data.ro !== undefined ? { ro: parsed.data.ro ?? null } : {}),
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

  return NextResponse.json(updated);
}
