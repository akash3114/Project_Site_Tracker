import { NextResponse } from "next/server";

import { canManageProjects, getSessionUser } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { projectAssignmentSchema } from "@/lib/validations";

/**
 * GET /api/project-assignments?userId= → projects managed by one user.
 * GET /api/project-assignments?projectId= → managers of one project.
 * POST → add a Project Manager assignment.
 * DELETE /api/project-assignments?projectId=&userId= → remove it.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;

  const assignments = await db.projectAssignment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: {
        select: {
          id: true,
          name: true,
          acronym: true,
          round: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ project: { name: "asc" } }],
  });

  return NextResponse.json({ assignments });
}

export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = projectAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [project, target] = await Promise.all([
    db.project.findUnique({ where: { id: parsed.data.projectId } }),
    db.user.findUnique({ where: { id: parsed.data.userId } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const created = await db.$transaction(async (tx) => {
    const assignment = await tx.projectAssignment.upsert({
      where: {
        projectId_userId: {
          projectId: parsed.data.projectId,
          userId: parsed.data.userId,
        },
      },
      update: { isPrimary: parsed.data.isPrimary },
      create: {
        projectId: parsed.data.projectId,
        userId: parsed.data.userId,
        isPrimary: parsed.data.isPrimary,
        assignedById: user.id,
      },
    });
    await logAudit(tx, {
      actorId: user.id,
      entity: "ProjectAssignment",
      entityId: `${assignment.projectId}:${assignment.userId}`,
      action: "GRANT",
      after: {
        projectId: assignment.projectId,
        userId: assignment.userId,
        isPrimary: assignment.isPrimary,
      },
    });
    return assignment;
  });

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");
  if (!projectId || !userId) {
    return NextResponse.json(
      { error: "projectId and userId are required" },
      { status: 400 },
    );
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.projectAssignment.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { isPrimary: true },
    });
    await tx.projectAssignment.deleteMany({ where: { projectId, userId } });
    await logAudit(tx, {
      actorId: user.id,
      entity: "ProjectAssignment",
      entityId: `${projectId}:${userId}`,
      action: "REVOKE",
      before: { projectId, userId, isPrimary: existing?.isPrimary ?? false },
    });
  });
  return NextResponse.json({ ok: true });
}
