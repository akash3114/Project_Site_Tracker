import type { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { accessiblePlazaIds, requirePlazaAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { createTaskSchema } from "@/lib/validations";

type SessionUser = { id: string; role: Role };

async function sessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as unknown as
    | { id?: string; role?: Role }
    | undefined;
  if (!u?.id || !u?.role) return null;
  return { id: u.id, role: u.role };
}

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const taskInclude = {
  plaza: {
    select: {
      id: true,
      name: true,
      lengthKm: true,
      state: true,
      project: { select: { id: true, name: true, acronym: true, state: true } },
    },
  },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const plazaId = url.searchParams.get("plazaId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const priority = url.searchParams.get("priority") ?? undefined;
    const assigneeParam = url.searchParams.get("assigneeId") ?? undefined;
    const overdue = url.searchParams.get("overdue") === "true";
    const q = url.searchParams.get("q") ?? undefined;
    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50,
      ),
    );

    const where: Prisma.TaskWhereInput = {};

    if (plazaId) {
      await requirePlazaAccess(user, plazaId);
      where.plazaId = plazaId;
    } else {
      const ids = await accessiblePlazaIds(user.id, user.role);
      if (ids.length === 0) {
        return Response.json({ items: [], total: 0, page, pageSize });
      }
      where.plazaId = { in: ids };
    }

    if (
      status &&
      (TASK_STATUSES as readonly string[]).includes(status)
    ) {
      where.status = status as (typeof TASK_STATUSES)[number];
    }
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
      where.priority = priority as (typeof PRIORITIES)[number];
    }
    if (assigneeParam) {
      where.assigneeId =
        assigneeParam === "me" ? user.id : assigneeParam;
    }
    if (overdue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.dueDate = { lt: today };
      where.status = { not: "COMPLETED" };
    }
    if (q) {
      where.title = { contains: q, mode: "insensitive" };
    }

    const [total, items] = await Promise.all([
      db.task.count({ where }),
      db.task.findMany({
        where,
        include: taskInclude,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return Response.json({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await sessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { plazaId, title, description, priority, assigneeId, dueDate } =
      parsed.data;

    await requirePlazaAccess(user, plazaId);

    if (assigneeId) {
      const assignee = await db.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, role: true, active: true },
      });
      if (!assignee || !assignee.active) {
        return Response.json(
          { error: "Assignee has no access to this plaza" },
          { status: 422 },
        );
      }
      if (assignee.role !== "ADMIN") {
        const hit = await db.userPlazaAccess.findUnique({
          where: { userId_plazaId: { userId: assigneeId, plazaId } },
        });
        if (!hit) {
          return Response.json(
            { error: "Assignee has no access to this plaza" },
            { status: 422 },
          );
        }
      }
    }

    const task = await db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          plazaId,
          title,
          description,
          priority,
          assigneeId,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : undefined,
          createdById: user.id,
        },
        include: taskInclude,
      });
      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          actorId: user.id,
          type: "CREATED",
          toStatus: created.status,
        },
      });
      if (assigneeId) {
        await tx.taskEvent.create({
          data: {
            taskId: created.id,
            actorId: user.id,
            type: "ASSIGN",
            toStatus: created.status,
            text: assigneeId,
          },
        });
      }
      return created;
    });

    return Response.json(task, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
