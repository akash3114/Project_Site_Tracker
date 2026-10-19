import { NextResponse } from "next/server";

import { canAssign, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { projectAssignmentSchema } from "@/lib/validations";

/**
 * GET /api/project-assignments?userId= → { userId, assignments[] }.
 * GET /api/project-assignments?projectId= → { projectId, assignments[] with user }.
 * MANAGER: 403.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "MANAGER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;

  if (userId) {
    const rows = await db.projectAssignment.findMany({
      where: { userId },
      select: { projectId: true, isPrimary: true, assignedAt: true },
      orderBy: { projectId: "asc" },
    });
    return NextResponse.json({ userId, assignments: rows });
  }

  if (projectId) {
    const rows = await db.projectAssignment.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { userId: "asc" },
    });
    return NextResponse.json({
      projectId,
      assignments: rows.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        isPrimary: r.isPrimary,
      })),
    });
  }

  const rows = await db.projectAssignment.findMany({
    orderBy: [{ projectId: "asc" }, { userId: "asc" }],
  });
  return NextResponse.json({ assignments: rows });
}

/**
 * POST /api/project-assignments { projectId, userId, isPrimary }.
 * ADMIN + MANAGEMENT only. Upserts the PM assignment; isPrimary=true
 * clears other primaries on the same project.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssign(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectAssignmentSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const [project, target] = await Promise.all([
    db.project.findUnique({ where: { id: parsed.data.projectId } }),
    db.user.findUnique({ where: { id: parsed.data.userId } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const saved = await db.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.projectAssignment.updateMany({
        where: { projectId: parsed.data.projectId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.projectAssignment.upsert({
      where: {
        projectId_userId: {
          projectId: parsed.data.projectId,
          userId: parsed.data.userId,
        },
      },
      update: { isPrimary: parsed.data.isPrimary, assignedById: user.id },
      create: {
        projectId: parsed.data.projectId,
        userId: parsed.data.userId,
        isPrimary: parsed.data.isPrimary,
        assignedById: user.id,
      },
    });
  });
  return NextResponse.json(saved, { status: 201 });
}

/**
 * DELETE /api/project-assignments?projectId=&userId= → remove a PM
 * assignment. ADMIN + MANAGEMENT only.
 */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssign(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");
  if (!projectId || !userId)
    return NextResponse.json(
      { error: "projectId and userId are required" },
      { status: 400 },
    );

  await db.projectAssignment.deleteMany({ where: { projectId, userId } });
  return NextResponse.json({ projectId, userId, removed: true });
}
