import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  actorScopeRole,
  canAssignTo,
  canCreateTask,
  getSessionUser,
  requirePlazaAccess,
  requireProjectAccess,
  taskScopeWhere,
} from "@/lib/access";
import { db } from "@/lib/db";
import { taskInclude } from "@/lib/task-data";
import { createTaskSchema } from "@/lib/validations";

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const plazaId = url.searchParams.get("plazaId") ?? undefined;
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const priority = url.searchParams.get("priority") ?? undefined;
    const categoryId = url.searchParams.get("categoryId") ?? undefined;
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

    const where: Prisma.TaskWhereInput = { ...(await taskScopeWhere(user)) };

    if (plazaId) {
      await requirePlazaAccess(user, plazaId);
      where.plazaId = plazaId;
    }
    if (projectId) {
      await requireProjectAccess(user, projectId);
      where.projectId = projectId;
    }

    if (status && (TASK_STATUSES as readonly string[]).includes(status)) {
      where.status = status as (typeof TASK_STATUSES)[number];
    }
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
      where.priority = priority as (typeof PRIORITIES)[number];
    }
    if (categoryId) where.categoryId = categoryId;
    if (assigneeParam) {
      where.assigneeId = assigneeParam === "me" ? user.id : assigneeParam;
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
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, description, priority, assigneeId, dueDate, categoryId } =
      parsed.data;

    let projectId = parsed.data.projectId ?? null;
    const plazaId = parsed.data.plazaId ?? null;

    if (plazaId) {
      const plaza = await db.plaza.findUnique({
        where: { id: plazaId },
        select: { id: true, projectId: true },
      });
      if (!plaza) {
        return NextResponse.json({ error: "Plaza not found" }, { status: 404 });
      }
      if (projectId && projectId !== plaza.projectId) {
        return NextResponse.json(
          { error: "Plaza does not belong to the selected project" },
          { status: 422 },
        );
      }
      projectId = plaza.projectId;
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId or plazaId is required" },
        { status: 400 },
      );
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await canCreateTask(user, projectId, plazaId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const actorRole = await actorScopeRole(user, projectId, plazaId);
    if (!actorRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (assigneeId) {
      if (!(await canAssignTo(actorRole, projectId, plazaId, assigneeId))) {
        return NextResponse.json(
          { error: "That person cannot be assigned in this scope" },
          { status: 422 },
        );
      }
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

    const task = await db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          plazaId,
          categoryId: categoryId ?? null,
          title,
          description: description ?? null,
          priority,
          assigneeId: assigneeId ?? null,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
          createdById: user.id,
        },
        include: taskInclude,
      });

      await tx.taskActivity.create({
        data: {
          taskId: created.id,
          actorId: user.id,
          type: "CREATED",
          toStatus: "TODO",
          toAssigneeId: assigneeId ?? null,
          text: plazaId ? "Task created" : "Project-level task created",
        },
      });

      if (assigneeId) {
        await tx.taskActivity.create({
          data: {
            taskId: created.id,
            actorId: user.id,
            type: "ASSIGNED",
            fromStatus: "TODO",
            toStatus: "TODO",
            toAssigneeId: assigneeId,
          },
        });
      }

      return created;
    });

    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
