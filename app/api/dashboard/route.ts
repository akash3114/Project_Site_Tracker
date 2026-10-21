import { NextResponse } from "next/server";

import {
  accessiblePlazaIds,
  getSessionUser,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";
import { globalStats } from "@/lib/stats";

const ROUNDS = ["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"] as const;
type Status = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
type StatusCounts = Record<Status, number>;

export const dynamic = "force-dynamic";

function emptyCounts(): StatusCounts {
  return { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 };
}

/** Aggregated dashboard totals, scoped to the signed-in user's visible work. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [scope, plazaIds] = await Promise.all([
    taskScopeWhere(user),
    accessiblePlazaIds(user),
  ]);

  const projects = await db.project.findMany({
    where:
      user.isAdmin || user.role === "HEAD_OFFICE"
        ? undefined
        : { id: { in: (await db.project.findMany({
            where: { plazas: { some: { id: { in: plazaIds } } } },
            select: { id: true },
          })).map((p) => p.id) } },
    select: {
      id: true,
      name: true,
      round: true,
      companyId: true,
      company: { select: { id: true, name: true, code: true } },
    },
  });

  const [stats, statusGroups, roundGroups, companyStats] = await Promise.all([
    globalStats(scope),
    Promise.all(
      (["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as Status[]).map(
        async (status) => ({
          status,
          count: await db.task.count({
            where: { AND: [scope, { status }] },
          }),
        }),
      ),
    ),
    Promise.all(
      ROUNDS.map(async (round) => {
        const counts = emptyCounts();
        const rows = await db.task.groupBy({
          by: ["status"],
          where: { AND: [scope, { project: { round } }] },
          _count: { _all: true },
        });
        for (const row of rows) counts[row.status] = row._count._all;
        return {
          round,
          projectCount: projects.filter((p) => p.round === round).length,
          taskCounts: counts,
        };
      }),
    ),
    Promise.all(
      Array.from(
        new Map(
          projects.map((p) => [
            p.companyId,
            { id: p.company.id, name: p.company.name, code: p.company.code },
          ]),
        ).values(),
      ).map(async (company) => {
        const projectIds = projects
          .filter((p) => p.companyId === company.id)
          .map((p) => p.id);
        const counts = emptyCounts();
        if (projectIds.length > 0) {
          const rows = await db.task.groupBy({
            by: ["status"],
            where: { AND: [scope, { projectId: { in: projectIds } }] },
            _count: { _all: true },
          });
          for (const row of rows) counts[row.status] = row._count._all;
        }
        return {
          ...company,
          projectCount: projectIds.length,
          taskCounts: counts,
        };
      }),
    ),
  ]);

  const statusCounts = emptyCounts();
  for (const row of statusGroups) statusCounts[row.status] = row.count;

  return NextResponse.json({
    projectCount: projects.length,
    plazaCount: plazaIds.length,
    companyCount: companyStats.length,
    kpis: stats,
    statusCounts,
    rounds: roundGroups,
    companies: companyStats,
  });
}
