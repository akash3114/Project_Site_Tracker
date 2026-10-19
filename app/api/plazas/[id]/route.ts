import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { canManage, getSessionUser, requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { plazaProgress } from "@/lib/progress";
import { updatePlazaSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

/** GET /api/plazas/:id → scoped detail with task stats. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plaza = await db.plaza.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requirePlazaAccess(user, plaza.id);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [total, completed, blocked, overdue] = await Promise.all([
    db.task.count({ where: { plazaId: plaza.id } }),
    db.task.count({ where: { plazaId: plaza.id, status: "COMPLETED" } }),
    db.task.count({ where: { plazaId: plaza.id, status: "BLOCKED" } }),
    db.task.count({
      where: {
        plazaId: plaza.id,
        status: { not: "COMPLETED" },
        dueDate: { lt: today },
      },
    }),
  ]);

  return NextResponse.json({
    id: plaza.id,
    projectId: plaza.projectId,
    project: plaza.project,
    name: plaza.name,
    lengthKm: plaza.lengthKm,
    state: plaza.state,
    piu: plaza.piu,
    ro: plaza.ro,
    status: plaza.status,
    task: { total, completed, blocked, overdue },
    progressPct: plazaProgress(completed, total),
    createdAt: plaza.createdAt,
    updatedAt: plaza.updatedAt,
  });
}

/** PATCH /api/plazas/:id → ADMIN + MANAGEMENT. 409 on (projectId, name) duplicate. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plaza = await db.plaza.findUnique({ where: { id: params.id } });
  if (!plaza) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = updatePlazaSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  if (parsed.data.name && parsed.data.name !== plaza.name) {
    const dup = await db.plaza.findUnique({
      where: {
        projectId_name: { projectId: plaza.projectId, name: parsed.data.name },
      },
    });
    if (dup)
      return NextResponse.json(
        { error: "Plaza name already exists in this project" },
        { status: 409 },
      );
  }

  try {
    const updated = await db.plaza.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Plaza name already exists in this project" },
        { status: 409 },
      );
    throw e;
  }
}
