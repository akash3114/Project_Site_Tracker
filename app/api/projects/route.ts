import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { accessiblePlazaIds, canManage, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { projectStats } from "@/lib/stats";
import { projectSchema } from "@/lib/validations";

/** GET /api/projects → scoped list with per-project stats. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visible = await accessiblePlazaIds(user.id, user.role);
  const projects = await db.project.findMany({
    where:
      user.role === "MANAGER"
        ? { plazas: { some: { id: { in: visible } } } }
        : undefined,
    orderBy: [{ round: "asc" }, { name: "asc" }],
  });

  const items = await Promise.all(
    projects.map(async (p) => {
      const s = await projectStats(p.id, visible);
      return {
        id: p.id,
        name: p.name,
        acronym: p.acronym,
        round: p.round,
        status: p.status,
        plazaCount: s.plazaCount,
        task: {
          total: s.total,
          completed: s.completed,
          blocked: s.blocked,
          overdue: s.overdue,
        },
        progressPct: s.progressPct,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }),
  );
  return NextResponse.json(items);
}

/** POST /api/projects → ADMIN + MANAGEMENT. 409 on duplicate (name, round). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const existing = await db.project.findFirst({
    where: { name: parsed.data.name, round: parsed.data.round },
  });
  if (existing)
    return NextResponse.json(
      { error: "Project already exists in this round" },
      { status: 409 },
    );

  try {
    const created = await db.project.create({
      data: {
        name: parsed.data.name,
        acronym: parsed.data.acronym,
        round: parsed.data.round,
        status: parsed.data.status ?? "ACTIVE",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Project already exists in this round" },
        { status: 409 },
      );
    throw e;
  }
}
