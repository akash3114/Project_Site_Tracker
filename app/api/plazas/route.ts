import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { plazaProgress } from "@/lib/progress";
import { plazaSchema } from "@/lib/validations";

/** GET /api/plazas?projectId= → scoped list with per-plaza task stats. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;

  const visible = await accessiblePlazaIds(user.id, user.role);
  const plazas = await db.plaza.findMany({
    where: {
      ...(projectId ? { projectId } : null),
      ...(user.role === "ADMIN" ? null : { id: { in: visible } }),
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = await Promise.all(
    plazas.map(async (plaza) => {
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
      return {
        id: plaza.id,
        projectId: plaza.projectId,
        project: plaza.project,
        name: plaza.name,
        chainage: plaza.chainage,
        highway: plaza.highway,
        location: plaza.location,
        status: plaza.status,
        task: { total, completed, blocked, overdue },
        progressPct: plazaProgress(completed, total),
        createdAt: plaza.createdAt,
        updatedAt: plaza.updatedAt,
      };
    }),
  );
  return NextResponse.json(items);
}

/** POST /api/plazas → ADMIN only. 409 on (projectId, name) duplicate. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = plazaSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const project = await db.project.findUnique({
    where: { id: parsed.data.projectId },
  });
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const dup = await db.plaza.findUnique({
    where: {
      projectId_name: {
        projectId: parsed.data.projectId,
        name: parsed.data.name,
      },
    },
  });
  if (dup)
    return NextResponse.json(
      { error: "Plaza name already exists in this project" },
      { status: 409 },
    );

  try {
    const created = await db.plaza.create({
      data: {
        projectId: parsed.data.projectId,
        name: parsed.data.name,
        chainage: parsed.data.chainage,
        highway: parsed.data.highway,
        location: parsed.data.location,
        status: parsed.data.status ?? "ACTIVE",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Plaza name already exists in this project" },
        { status: 409 },
      );
    throw e;
  }
}
