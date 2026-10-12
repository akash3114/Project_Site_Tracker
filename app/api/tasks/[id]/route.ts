import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { updateTaskSchema } from "@/lib/validations";

type SessionUser = { id: string; role: Role };

async function sessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as unknown as
    | { id?: string; role?: Role }
    | undefined;
  if (!u?.id || !u?.role) return null;
  return { id: u.id, role: u.role };
}

const detailInclude = {
  plaza: {
    select: {
      id: true,
      name: true,
      project: { select: { id: true, name: true } },
    },
  },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  events: {
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true } } },
  },
} as const;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const task = await db.task.findUnique({
      where: { id: params.id },
      include: detailInclude,
    });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    const { plaza, assignee, createdBy, events } = task;
    return Response.json({ task, plaza, assignee, createdBy, events });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const task = await db.task.findUnique({ where: { id: params.id } });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    await requirePlazaAccess(user, task.plazaId);

    if (task.status === "COMPLETED") {
      return Response.json(
        { error: "Task is completed. Reopen it before editing." },
        { status: 423 },
      );
    }

    const { title, description, priority, dueDate } = parsed.data;
    const changed: string[] = [];
    if (title !== undefined) changed.push("title");
    if (description !== undefined) changed.push("description");
    if (priority !== undefined) changed.push("priority");
    if (dueDate !== undefined) changed.push("dueDate");

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(dueDate !== undefined
            ? {
                dueDate:
                  dueDate === null
                    ? null
                    : new Date(`${dueDate}T00:00:00Z`),
              }
            : {}),
        },
        include: {
          plaza: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          type: "META",
          fromStatus: task.status,
          toStatus: task.status,
          text: changed.length > 0 ? `Updated ${changed.join(", ")}` : null,
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
