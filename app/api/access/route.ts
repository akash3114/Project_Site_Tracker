import { NextResponse } from "next/server";

import {
  canManageProjects,
  getSessionUser,
} from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { accessPutSchema } from "@/lib/validations";

/**
 * GET /api/access?userId= → plaza roles for one user.
 * GET /api/access?plazaId= → plaza roles at one plaza.
 * PUT /api/access → replace one user's plaza role set.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const plazaId = searchParams.get("plazaId") ?? undefined;

  const assignments = await db.plazaAssignment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(plazaId ? { plazaId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      plaza: {
        select: {
          id: true,
          name: true,
          project: {
            select: {
              id: true,
              name: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { plaza: { name: "asc" } }],
  });

  return NextResponse.json({ assignments });
}

/** PUT /api/access → Admin/Head Office replaces a user's plaza roles. */
export async function PUT(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = accessPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const deduped = new Map<string, (typeof parsed.data.assignments)[number]>();
  for (const row of parsed.data.assignments) {
    deduped.set(`${row.plazaId}:${row.role}`, row);
  }

  await db.$transaction(async (tx) => {
    const before = await tx.plazaAssignment.findMany({
      where: { userId: parsed.data.userId },
      select: { plazaId: true, role: true, isPrimary: true },
      orderBy: [{ plazaId: "asc" }, { role: "asc" }],
    });
    await tx.plazaAssignment.deleteMany({
      where: { userId: parsed.data.userId },
    });
    for (const row of Array.from(deduped.values())) {
      await tx.plazaAssignment.create({
        data: {
          userId: parsed.data.userId,
          plazaId: row.plazaId,
          role: row.role,
          isPrimary: row.isPrimary,
          assignedById: user.id,
        },
      });
    }
    const after = Array.from(deduped.values())
      .map((row) => ({
        plazaId: row.plazaId,
        role: row.role,
        isPrimary: row.isPrimary,
      }))
      .sort((a, b) =>
        a.plazaId === b.plazaId
          ? a.role.localeCompare(b.role)
          : a.plazaId.localeCompare(b.plazaId),
      );
    await logAudit(tx, {
      actorId: user.id,
      entity: "PlazaAssignment",
      entityId: parsed.data.userId,
      action: "UPDATE",
      before,
      after,
    });
  });

  return NextResponse.json({ ok: true, count: deduped.size });
}
