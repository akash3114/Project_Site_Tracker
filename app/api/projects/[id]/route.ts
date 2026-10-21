import { NextResponse } from "next/server";

import {
  canManageProjects,
  getSessionUser,
  requireProjectAccess,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";
import { projectStats } from "@/lib/stats";
import { updateProjectSchema } from "@/lib/validations";

type Ctx = { params: { id: string } };

/** GET /api/projects/:id → scoped detail with stats. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await requireProjectAccess(user, params.id);

  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true, code: true } },
      _count: { select: { plazas: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stats = await projectStats(project.id, await taskScopeWhere(user));

  return NextResponse.json({
    id: project.id,
    name: project.name,
    description: null,
    acronym: project.acronym,
    state: project.state,
    round: project.round,
    lengthKm: project.lengthKm,
    piu: project.piu,
    ro: project.ro,
    active: project.active,
    status: project.active ? "ACTIVE" : "ARCHIVED",
    company: project.company,
    plazaCount: project._count.plazas,
    task: {
      total: stats.total,
      completed: stats.completed,
      blocked: stats.blocked,
      overdue: stats.overdue,
    },
    progressPct: stats.progressPct,
  });
}

/** PATCH /api/projects/:id → Admin / Head Office. */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await db.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.companyId) {
    const company = await db.company.findUnique({
      where: { id: parsed.data.companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
  }

  const updated = await db.project.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.companyId !== undefined
        ? { companyId: parsed.data.companyId }
        : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.acronym !== undefined
        ? { acronym: parsed.data.acronym ?? null }
        : {}),
      ...(parsed.data.round !== undefined ? { round: parsed.data.round } : {}),
      ...(parsed.data.state !== undefined
        ? { state: parsed.data.state ?? null }
        : {}),
      ...(parsed.data.lengthKm !== undefined
        ? { lengthKm: parsed.data.lengthKm ?? null }
        : {}),
      ...(parsed.data.piu !== undefined
        ? { piu: parsed.data.piu ?? null }
        : {}),
      ...(parsed.data.ro !== undefined ? { ro: parsed.data.ro ?? null } : {}),
      ...(parsed.data.active !== undefined
        ? { active: parsed.data.active }
        : {}),
    },
    include: { company: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json(updated);
}
