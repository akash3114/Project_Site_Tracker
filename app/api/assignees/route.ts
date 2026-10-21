import { NextResponse } from "next/server";

import {
  assigneeCandidates,
  getSessionUser,
  requireProjectAccess,
  type ScopeRole,
} from "@/lib/access";
import { db } from "@/lib/db";

/**
 * GET /api/assignees?projectId=&plazaId=
 * Eligible assignees for the caller, already filtered by the assignment ceiling.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const plazaId = url.searchParams.get("plazaId") || null;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  await requireProjectAccess(user, projectId);

  let role: ScopeRole | null = null;
  if (user.isAdmin) role = "ADMIN";
  else if (user.role === "HEAD_OFFICE") role = "HEAD_OFFICE";
  else {
    const [pm, site] = await Promise.all([
      db.projectAssignment.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { projectId: true },
      }),
      plazaId
        ? db.plazaAssignment.findFirst({
            where: { plazaId, userId: user.id },
            select: { plazaId: true },
          })
        : Promise.resolve(null),
    ]);
    if (pm) role = "PROJECT_MANAGER";
    else if (site) role = "SITE_MANAGER";
  }

  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await assigneeCandidates(role, projectId, plazaId);
  return NextResponse.json(items);
}
