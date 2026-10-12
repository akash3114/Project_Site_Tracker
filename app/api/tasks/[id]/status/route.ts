import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { canTransition } from "@/lib/transitions";
import { statusSchema } from "@/lib/validations";

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

    const body: unknown = await req.json().catch(() => null);
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { to, text } = parsed.data;

    const task = await db.task.findUnique({ where: { id: params.id } });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    if (task.status === "COMPLETED") {
      return Response.json(
        { error: "Task is completed. Use /reopen to move it back." },
        { status: 422 },
      );
    }
    if (!canTransition(task.status, to)) {
      return Response.json(
        { error: `Illegal transition ${task.status} -> ${to}` },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          status: to,
          ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          type: "STATUS",
          fromStatus: task.status,
          toStatus: to,
          text: text ?? null,
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
