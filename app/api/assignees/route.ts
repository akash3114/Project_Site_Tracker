import { NextResponse } from "next/server";

import {
  actorScopeRole,
  assigneeCandidates,
  getSessionUser,
  requireProjectAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import type { TaskScope } from "@/lib/task-scope";

/**
 * GET /api/assignees?projectId=&plazaId= | ?departmentId= | ?headOffice=true
 * Eligible assignees for the caller at the requested scope, already filtered by
 * the assignment ceiling and enriched with role/context labels.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || null;
    const plazaId = url.searchParams.get("plazaId") || null;
    const departmentId = url.searchParams.get("departmentId") || null;
    const headOffice = url.searchParams.get("headOffice") === "true";

    if (!projectId && !departmentId && !headOffice) {
      return NextResponse.json(
        { error: "projectId, departmentId or headOffice=true is required" },
        { status: 400 },
      );
    }

    let scope: TaskScope;
    if (headOffice) {
      scope = { kind: "department", departmentId: null };
    } else if (departmentId) {
      scope = { kind: "department", departmentId };
    } else if (projectId) {
      await requireProjectAccess(user, projectId);
      if (plazaId) {
        const plaza = await db.plaza.findUnique({
          where: { id: plazaId },
          select: { id: true, projectId: true },
        });
        if (!plaza) {
          return NextResponse.json({ error: "Plaza not found" }, { status: 404 });
        }
        if (plaza.projectId !== projectId) {
          return NextResponse.json(
            { error: "Plaza does not belong to the selected project" },
            { status: 422 },
          );
        }
      }
      scope = { kind: "project", projectId, plazaId };
    } else {
      return NextResponse.json(
        { error: "projectId, departmentId or headOffice=true is required" },
        { status: 400 },
      );
    }

    const role = await actorScopeRole(user, scope);
    if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (departmentId) {
      const department = await db.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 },
        );
      }
    }

    const items = await assigneeCandidates(role, scope);
    return NextResponse.json(items);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
