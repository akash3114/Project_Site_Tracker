import { NextResponse } from "next/server";

import {
  canAssignTo,
  getSessionUser,
  requireTaskAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import { serializeTask, taskInclude, taskPermissions } from "@/lib/task-data";
import type { TaskScope } from "@/lib/task-scope";
import { assignSchema } from "@/lib/validations";

/**
 * POST /api/tasks/:id/assign → replace the assignee set.
 *
 * The body is `{ assigneeIds: string[] }`; an empty array clears every
 * assignee. One ASSIGNED activity row is written per added/removed person.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { assigneeIds } = parsed.data;

    const access = await requireTaskAccess(user, id);
    if (access.task.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Task is completed. Reopen it before reassigning." },
        { status: 423 },
      );
    }

    const permissions = taskPermissions(user, access.task, access);
    if (!permissions.canAssign) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { projectId, plazaId, departmentId } = access.task;
    const scope: TaskScope =
      departmentId !== null || projectId === null
        ? { kind: "department", departmentId }
        : { kind: "project", projectId, plazaId };

    for (const assigneeId of assigneeIds) {
      if (!(await canAssignTo(access.role, scope, assigneeId))) {
        return NextResponse.json(
          { error: "That person cannot be assigned in this scope" },
          { status: 422 },
        );
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const current = await tx.taskAssignee.findMany({
        where: { taskId: id },
        select: { userId: true },
      });
      const before = new Set(current.map((row) => row.userId));
      const after = new Set(assigneeIds);

      const removed = Array.from(before).filter((id) => !after.has(id));
      const added = Array.from(after).filter((id) => !before.has(id));

      if (removed.length > 0) {
        await tx.taskAssignee.deleteMany({
          where: { taskId: id, userId: { in: removed } },
        });
      }
      if (added.length > 0) {
        await tx.taskAssignee.createMany({
          data: added.map((userId) => ({
            taskId: id,
            userId,
            assignedById: user.id,
          })),
        });
      }

      // Touch the parent row so `updatedAt desc` lists stay accurate.
      const next = await tx.task.update({
        where: { id },
        data: { updatedAt: new Date() },
        include: taskInclude,
      });

      for (const userId of removed) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId: user.id,
            type: "ASSIGNED",
            fromStatus: access.task.status,
            toStatus: access.task.status,
            fromAssigneeId: userId,
          },
        });
      }
      for (const userId of added) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId: user.id,
            type: "ASSIGNED",
            fromStatus: access.task.status,
            toStatus: access.task.status,
            toAssigneeId: userId,
          },
        });
      }

      return next;
    });

    return NextResponse.json(serializeTask(updated));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
