import { NextResponse } from "next/server";

import { accessiblePlazaIds, getSessionUser } from "@/lib/access";
import { db } from "@/lib/db";
import { globalStats } from "@/lib/stats";

type Status = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
const ROUNDS = ["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"] as const;

type Round = (typeof ROUNDS)[number];

export const dynamic = "force-dynamic";

/** Aggregated dashboard totals, scoped to the signed-in user's visible plazas. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plazaIds = await accessiblePlazaIds(user.id, user.role);
  const [stats, projects, groupedTasks] = await Promise.all([
    globalStats(plazaIds),
    db.project.findMany({
      where:
        user.role === "MANAGER"
          ? { plazas: { some: { id: { in: plazaIds } } } }
          : undefined,
      select: {
        id: true,
        round: true,
        plazas: {
          where: { id: { in: plazaIds } },
          select: { id: true },
        },
      },
      orderBy: [{ round: "asc" }, { name: "asc" }],
    }),
    plazaIds.length
      ? db.task.groupBy({
          by: ["plazaId", "status"],
          where: { plazaId: { in: plazaIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const statusCounts: Record<Status, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    COMPLETED: 0,
  };
  const plazaRounds = new Map<string, Round>();
  const rounds = Object.fromEntries(
    ROUNDS.map((round) => [
      round,
      {
        projectCount: projects.filter((project) => project.round === round).length,
        taskCounts: { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 },
      },
    ]),
  ) as Record<Round, { projectCount: number; taskCounts: Record<Status, number> }>;

  for (const project of projects) {
    for (const plaza of project.plazas) plazaRounds.set(plaza.id, project.round);
  }

  for (const group of groupedTasks) {
    const count = group._count._all;
    const status = group.status as Status;
    const round = plazaRounds.get(group.plazaId);
    statusCounts[status] += count;
    if (round) rounds[round].taskCounts[status] += count;
  }

  return NextResponse.json({
    projectCount: projects.length,
    plazaCount: projects.reduce((sum, project) => sum + project.plazas.length, 0),
    kpis: stats,
    statusCounts,
    rounds: ROUNDS.map((round) => ({
      round,
      projectCount: rounds[round].projectCount,
      taskCounts: rounds[round].taskCounts,
    })),
  });
}
