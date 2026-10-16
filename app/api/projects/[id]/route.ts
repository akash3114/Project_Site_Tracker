import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { projectStats } from "@/lib/stats";
import { projectSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

/** GET /api/projects/:id → scoped detail with stats. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await db.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const visible = await accessiblePlazaIds(user.id, user.role);
  if (user.role !== "ADMIN") {
    const inScope = await db.plaza.findFirst({
      where: { projectId: project.id, id: { in: visible } },
      select: { id: true },
    });
    if (!inScope)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const s = await projectStats(project.id, visible);
  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: project.description,
    acronym: project.acronym,
    state: project.state,
    round: project.round,
    status: project.status,
    plazaCount: s.plazaCount,
    task: {
      total: s.total,
      completed: s.completed,
      blocked: s.blocked,
      overdue: s.overdue,
    },
    progressPct: s.progressPct,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/** PATCH /api/projects/:id → ADMIN only. 409 on duplicate name. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const project = await db.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectSchema.partial().safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  if (parsed.data.name && parsed.data.name !== project.name) {
    const dup = await db.project.findUnique({
      where: { name: parsed.data.name },
    });
    if (dup)
      return NextResponse.json(
        { error: "Project name already exists" },
        { status: 409 },
      );
  }

  try {
    const updated = await db.project.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Project name already exists" },
        { status: 409 },
      );
    throw e;
  }
}
