import { NextResponse } from "next/server";

import {
  assigneeCandidates,
  canEditTaskCore,
  getSessionUser,
  requireTaskAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import { taskDetailInclude, taskPermissions } from "@/lib/task-data";
import { updateTaskSchema } from "@/lib/validations";

/** GET /api/tasks/:id → full detail, activity feed, permissions, assignees. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await requireTaskAccess(user, params.id);
    const task = await db.task.findUnique({
      where: { id: params.id },
      include: taskDetailInclude,
    });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const permissions = taskPermissions(user, access.task, access.role);
    const [assignees, pendingReopen] = await Promise.all([
      permissions.canAssign && (access.role === "ADMIN" || access.role === "HEAD_OFFICE" || access.role === "PROJECT_MANAGER" || access.role === "SITE_MANAGER")
        ? assigneeCandidates(access.role, task.projectId, task.plazaId)
        : Promise.resolve([]),
      db.taskReopenRequest.findFirst({
        where: { taskId: task.id, status: "PENDING" },
        include: {
          requestedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      task,
      events: task.activities,
      permissions,
      assignees,
      reopenRequest: pendingReopen,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** PATCH /api/tasks/:id → core field edits. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const access = await requireTaskAccess(user, params.id);
    if (access.task.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Task is completed. Reopen it before editing." },
        { status: 423 },
      );
    }
    if (!canEditTaskCore(user, access.task, access.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, description, priority, categoryId, dueDate } = parsed.data;
    const changed: string[] = [];
    if (title !== undefined) changed.push("title");
    if (description !== undefined) changed.push("description");
    if (priority !== undefined) changed.push("priority");
    if (categoryId !== undefined) changed.push("category");
    if (dueDate !== undefined) changed.push("due date");

    if (changed.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (categoryId) {
      const category = await db.taskCategory.findUnique({
        where: { id: categoryId },
        select: { active: true },
      });
      if (!category?.active) {
        return NextResponse.json(
          { error: "Category not found or inactive" },
          { status: 422 },
        );
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: params.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined
            ? { description: description ?? null }
            : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(dueDate !== undefined
            ? {
                dueDate:
                  dueDate === null
                    ? null
                    : new Date(`${dueDate}T00:00:00Z`),
              }
            : {}),
        },
        include: taskDetailInclude,
      });
      await tx.taskActivity.create({
        data: {
          taskId: params.id,
          actorId: user.id,
          type: "UPDATED",
          fromStatus: access.task.status,
          toStatus: access.task.status,
          text: `Updated ${changed.join(", ")}`,
        },
      });
      return next;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
