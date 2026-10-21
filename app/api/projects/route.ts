import { NextResponse } from "next/server";

import {
  accessibleProjectIds,
  canManageProjects,
  getSessionUser,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";
import { projectStats } from "@/lib/stats";
import { projectSchema } from "@/lib/validations";

/** GET /api/projects → scoped list with per-project stats. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [ids, scope] = await Promise.all([
    accessibleProjectIds(user),
    taskScopeWhere(user),
  ]);
  const projects = await db.project.findMany({
    where: { id: { in: ids } },
    include: { company: { select: { id: true, name: true, code: true } } },
    orderBy: [{ company: { name: "asc" } }, { round: "asc" }, { name: "asc" }],
  });

  const items = await Promise.all(
    projects.map(async (p) => {
      const s = await projectStats(p.id, scope);
      return {
        id: p.id,
        name: p.name,
        acronym: p.acronym,
        state: p.state,
        round: p.round,
        active: p.active,
        status: p.active ? "ACTIVE" : "ARCHIVED",
        company: p.company,
        plazaCount: s.plazaCount,
        task: {
          total: s.total,
          completed: s.completed,
          blocked: s.blocked,
          overdue: s.overdue,
        },
        progressPct: s.progressPct,
      };
    }),
  );

  return NextResponse.json(items);
}

/** POST /api/projects → Admin / Head Office. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const company = await db.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const created = await db.project.create({
    data: {
      companyId: parsed.data.companyId,
      name: parsed.data.name,
      acronym: parsed.data.acronym ?? null,
      round: parsed.data.round,
      state: parsed.data.state ?? null,
      lengthKm: parsed.data.lengthKm ?? null,
      piu: parsed.data.piu ?? null,
      ro: parsed.data.ro ?? null,
      active: parsed.data.active ?? true,
    },
    include: { company: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json(created, { status: 201 });
}
