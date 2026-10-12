import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { canReopen, requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { reopenSchema } from "@/lib/validations";

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

    if (!canReopen(user.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = reopenSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const task = await db.task.findUnique({ where: { id: params.id } });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    if (task.status !== "COMPLETED") {
      return Response.json(
        { error: "Only COMPLETED tasks can be reopened" },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS", completedAt: null },
      });
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          type: "REOPEN",
          fromStatus: "COMPLETED",
          toStatus: "IN_PROGRESS",
          text: parsed.data.text ?? null,
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
