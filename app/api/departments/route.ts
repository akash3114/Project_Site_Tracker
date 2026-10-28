import { NextResponse } from "next/server";

import { canManageProjects, getSessionUser, taskScopeWhere } from "@/lib/access";
import { db } from "@/lib/db";
import { departmentStats } from "@/lib/stats";

/**
 * GET /api/departments → Head Office department catalogue with member counts
 * and task stats, restricted to the caller's visible task scope.
 * Admin/Head Office only.
 */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = await taskScopeWhere(user);
  const departments = await db.department.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      sortOrder: true,
      active: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const items = await Promise.all(
    departments.map(async (department) => {
      const stats = await departmentStats(department.id, scope);
      return {
        id: department.id,
        name: department.name,
        code: department.code,
        sortOrder: department.sortOrder,
        active: department.active,
        memberCount: stats.memberCount,
        open: stats.open,
        progressPct: stats.progressPct,
        task: {
          total: stats.total,
          completed: stats.completed,
          blocked: stats.blocked,
          overdue: stats.overdue,
        },
      };
    }),
  );

  return NextResponse.json(items);
}
