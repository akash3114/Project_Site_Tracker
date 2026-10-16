import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
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
      user.role === "ADMIN"
        ? undefined
        : { plazas: { some: { id: { in: visible } } } },
    orderBy: { name: "asc" },
  });

  const items = await Promise.all(
    projects.map(async (p) => {
      const s = await projectStats(p.id, visible);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        acronym: p.acronym,
        state: p.state,
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

/** POST /api/projects → ADMIN only. 409 on duplicate name. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const existing = await db.project.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing)
    return NextResponse.json(
      { error: "Project name already exists" },
      { status: 409 },
    );

  try {
    const created = await db.project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        acronym: parsed.data.acronym,
        state: parsed.data.state,
        round: parsed.data.round,
        status: parsed.data.status ?? "ACTIVE",
        createdById: user.id,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Project name already exists" },
        { status: 409 },
      );
    throw e;
  }
}
