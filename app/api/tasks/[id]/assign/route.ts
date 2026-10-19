import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  assigneeHasPlazaAccess,
  canAssign,
  requirePlazaAccess,
} from "@/lib/access";
import { db } from "@/lib/db";
import { assignSchema } from "@/lib/validations";

type SessionUser = { id: string; role: Role };

async function sessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as unknown as
    | { id?: string; role?: Role }
    | undefined;
  if (!u?.id || !u?.role) return null;
  return { id: u.id, role: u.role };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (!canAssign(user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { assigneeId } = parsed.data;

    const task = await db.task.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, plazaId: true, plaza: { select: { projectId: true } } },
    });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    if (
      !(await assigneeHasPlazaAccess(
        assigneeId,
        task.plazaId,
        task.plaza.projectId,
      ))
    ) {
      return Response.json(
        { error: "Assignee has no access to this plaza" },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { assigneeId },
        include: { assignee: { select: { id: true, name: true } } },
      });
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          type: "ASSIGN",
          fromStatus: task.status,
          toStatus: task.status,
          text: assigneeId,
        },
      });
      return next;
    });

    return Response.json(updated, { status: 200 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
