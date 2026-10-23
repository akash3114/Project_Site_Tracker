import { NextResponse } from "next/server";

import { canManageProjects, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";

/**
 * GET /api/departments → Head Office department catalogue with member counts.
 * Admin/Head Office only.
 */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const departments = await db.department.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      sortOrder: true,
      active: true,
      _count: { select: { members: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      sortOrder: d.sortOrder,
      active: d.active,
      memberCount: d._count.members,
    })),
  );
}
