import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { commentSchema } from "@/lib/validations";

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
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const task = await db.task.findUnique({ where: { id: params.id } });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    const event = await db.$transaction(async (tx) => {
      return tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          type: "COMMENT",
          fromStatus: task.status,
          toStatus: task.status,
          text: parsed.data.text,
        },
        include: { actor: { select: { id: true, name: true } } },
      });
    });

    return Response.json(event, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
