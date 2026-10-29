import { NextResponse } from "next/server";

import { canViewAudit, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";

/**
 * GET /api/audit?entity=&entityId=&actorId=&take=100
 * Master-data audit trail, newest first. Admin / Head Office only.
 * Task history is served by GET /api/events.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewAudit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity") ?? undefined;
  const entityId = searchParams.get("entityId") ?? undefined;
  const actorId = searchParams.get("actorId") ?? undefined;
  const take = Math.min(
    Math.max(Number(searchParams.get("take") ?? 100), 1),
    500,
  );

  const items = await db.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ items });
}
