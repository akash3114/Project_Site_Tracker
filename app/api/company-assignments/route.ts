import { NextResponse } from "next/server";

import { canManageProjects, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { companyAssignmentSchema } from "@/lib/validations";

/**
 * GET /api/company-assignments?userId= → Head Office company assignments.
 * POST → grant Head Office access to a company.
 * DELETE ?companyId=&userId= → revoke it.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && user.role !== "HEAD_OFFICE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const companyId = searchParams.get("companyId") ?? undefined;

  const assignments = await db.companyAssignment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(companyId ? { companyId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ company: { name: "asc" } }],
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
  const parsed = companyAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [company, target] = await Promise.all([
    db.company.findUnique({ where: { id: parsed.data.companyId } }),
    db.user.findUnique({ where: { id: parsed.data.userId } }),
  ]);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const created = await db.companyAssignment.upsert({
    where: {
      companyId_userId: {
        companyId: parsed.data.companyId,
        userId: parsed.data.userId,
      },
    },
    update: {},
    create: {
      companyId: parsed.data.companyId,
      userId: parsed.data.userId,
      role: "HEAD_OFFICE",
      assignedById: user.id,
    },
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
  const companyId = searchParams.get("companyId");
  const userId = searchParams.get("userId");
  if (!companyId || !userId) {
    return NextResponse.json(
      { error: "companyId and userId are required" },
      { status: 400 },
    );
  }

  await db.companyAssignment.deleteMany({ where: { companyId, userId } });
  return NextResponse.json({ ok: true });
}
