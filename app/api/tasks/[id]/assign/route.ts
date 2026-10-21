import { NextResponse } from "next/server";

import {
  canAssignTo,
  getSessionUser,
  requireTaskAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import { assignSchema } from "@/lib/validations";

/** POST /api/tasks/:id/assign → change or clear the assignee. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
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
    const { assigneeId } = parsed.data;

    const access = await requireTaskAccess(user, params.id);
    if (access.task.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Task is completed. Reopen it before reassigning." },
        { status: 423 },
      );
    }

    if (
      assigneeId &&
      !(await canAssignTo(
        access.role,
        access.task.projectId,
        access.task.plazaId,
        assigneeId,
      ))
    ) {
      return NextResponse.json(
        { error: "That person cannot be assigned in this scope" },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: params.id },
        data: { assigneeId: assigneeId ?? null },
        include: { assignee: { select: { id: true, name: true } } },
      });
      await tx.taskActivity.create({
        data: {
          taskId: params.id,
          actorId: user.id,
          type: "ASSIGNED",
          fromStatus: access.task.status,
          toStatus: access.task.status,
          fromAssigneeId: access.task.assigneeId,
          toAssigneeId: assigneeId ?? null,
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
