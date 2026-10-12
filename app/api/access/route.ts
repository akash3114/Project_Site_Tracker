import { NextResponse } from "next/server";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { accessSchema } from "@/lib/validations";

/**
 * GET /api/access?userId= or ?plazaId= (or full scoped matrix).
 * ADMIN: full read. PROJECT_LEAD: read scoped to its own plazas.
 * SITE_USER: 403.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "SITE_USER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const plazaId = searchParams.get("plazaId") ?? undefined;

  const visible =
    user.role === "ADMIN" ? null : await accessiblePlazaIds(user.id, user.role);

  if (plazaId && visible && !visible.includes(plazaId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (userId) {
    const rows = await db.userPlazaAccess.findMany({
      where: {
        userId,
        ...(visible ? { plazaId: { in: visible } } : null),
      },
      select: { plazaId: true },
      orderBy: { plazaId: "asc" },
    });
    return NextResponse.json({
      userId,
      plazaIds: rows.map((r) => r.plazaId),
    });
  }

  if (plazaId) {
    const rows = await db.userPlazaAccess.findMany({
      where: { plazaId },
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    return NextResponse.json({
      plazaId,
      userIds: rows.map((r) => r.userId),
    });
  }

  const rows = await db.userPlazaAccess.findMany({
    where: visible ? { plazaId: { in: visible } } : undefined,
    select: { userId: true, plazaId: true, grantedById: true, grantedAt: true },
    orderBy: [{ userId: "asc" }, { plazaId: "asc" }],
  });
  return NextResponse.json({ items: rows });
}

/**
 * PUT /api/access { userId, plazaIds } → ADMIN only.
 * Replaces the user's matrix rows in one transaction,
 * stamping grantedById with the session user.
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = accessSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );

  const plazaIds = Array.from(new Set(parsed.data.plazaIds));
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (plazaIds.length > 0) {
    const count = await db.plaza.count({
      where: { id: { in: plazaIds } },
    });
    if (count !== plazaIds.length)
      return NextResponse.json(
        { error: "One or more plazas not found" },
        { status: 422 },
      );
  }

  await db.$transaction([
    db.userPlazaAccess.deleteMany({ where: { userId: parsed.data.userId } }),
    ...(plazaIds.length > 0
      ? [
          db.userPlazaAccess.createMany({
            data: plazaIds.map((plazaId) => ({
              userId: parsed.data.userId,
              plazaId,
              grantedById: user.id,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ userId: parsed.data.userId, plazaIds });
}
