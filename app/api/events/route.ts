import { NextResponse } from "next/server";

import {
  canViewAudit,
  getSessionUser,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";

/** GET /api/events?take=100 — append-only task activity feed. */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewAudit(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const take = Math.min(
    Math.max(Number(url.searchParams.get("take") ?? 100), 1),
    500,
  );
  const scope = await taskScopeWhere(user);

  const events = await db.taskActivity.findMany({
    where: { task: scope },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, name: true } },
      fromAssignee: { select: { id: true, name: true } },
      toAssignee: { select: { id: true, name: true } },
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
          plaza: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ items: events });
}
