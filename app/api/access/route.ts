import { NextResponse } from "next/server";

import {
  accessiblePlazaIds,
  canAssign,
  getSessionUser,
} from "@/lib/access";
import { db } from "@/lib/db";
import { accessPutSchema } from "@/lib/validations";

/**
 * GET /api/access?userId= → { userId, projectIds, assignments[] }.
 * GET /api/access?plazaId= → { plazaId, assignments[] with user }.
 * GET /api/access → scoped { projectAssignments, plazaAssignments } matrix.
 * MANAGER: 403. MANAGEMENT: scoped to its own visible plazas.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "MANAGER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const plazaId = searchParams.get("plazaId") ?? undefined;

  const visible =
    user.role === "ADMIN" ? null : await accessiblePlazaIds(user.id, user.role);

  if (plazaId && visible && !visible.includes(plazaId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (userId) {
    const [projects, plazas] = await Promise.all([
      db.projectAssignment.findMany({
        where: { userId },
        select: { projectId: true, isPrimary: true, assignedAt: true },
        orderBy: { projectId: "asc" },
      }),
      db.plazaAssignment.findMany({
        where: {
          userId,
          ...(visible ? { plazaId: { in: visible } } : null),
        },
        select: { plazaId: true, role: true, isPrimary: true, assignedAt: true },
        orderBy: [{ plazaId: "asc" }, { role: "asc" }],
      }),
    ]);
    return NextResponse.json({
      userId,
      projectIds: projects.map((p) => p.projectId),
      projectAssignments: projects,
      assignments: plazas,
      plazaIds: Array.from(new Set(plazas.map((p) => p.plazaId))),
    });
  }

  if (plazaId) {
    const rows = await db.plazaAssignment.findMany({
      where: { plazaId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { userId: "asc" }],
    });
    return NextResponse.json({
      plazaId,
      assignments: rows.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        role: r.role,
        isPrimary: r.isPrimary,
      })),
    });
  }

  const [projectAssignments, plazaAssignments] = await Promise.all([
    db.projectAssignment.findMany({
      orderBy: [{ projectId: "asc" }, { userId: "asc" }],
    }),
    db.plazaAssignment.findMany({
      where: visible ? { plazaId: { in: visible } } : undefined,
      orderBy: [{ plazaId: "asc" }, { role: "asc" }, { userId: "asc" }],
    }),
  ]);
  return NextResponse.json({ projectAssignments, plazaAssignments });
}

/**
 * PUT /api/access { userId, assignments: [{ plazaId, role, isPrimary }] }.
 * ADMIN + MANAGEMENT only (canAssign). Replaces the user's plaza
 * assignments in one transaction, stamping assignedById. Setting
 * isPrimary=true clears other primaries for the same plaza+role.
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssign(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = accessPutSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Dedupe by (plazaId, role); last wins.
  const byKey = new Map<string, (typeof parsed.data.assignments)[number]>();
  for (const a of parsed.data.assignments)
    byKey.set(`${a.plazaId}::${a.role}`, a);
  const assignments = Array.from(byKey.values());

  if (assignments.length > 0) {
    const count = await db.plaza.count({
      where: { id: { in: assignments.map((a) => a.plazaId) } },
    });
    if (count !== new Set(assignments.map((a) => a.plazaId)).size)
      return NextResponse.json(
        { error: "One or more plazas not found" },
        { status: 422 },
      );
  }

  await db.$transaction(async (tx) => {
    await tx.plazaAssignment.deleteMany({
      where: { userId: parsed.data.userId },
    });
    for (const a of assignments) {
      if (a.isPrimary) {
        await tx.plazaAssignment.updateMany({
          where: { plazaId: a.plazaId, role: a.role, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.plazaAssignment.create({
        data: {
          plazaId: a.plazaId,
          userId: parsed.data.userId,
          role: a.role,
          isPrimary: a.isPrimary,
          assignedById: user.id,
        },
      });
    }
  });

  return NextResponse.json({ userId: parsed.data.userId, assignments });
}
