import type { Prisma, TaskScopeKind } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  actorScopeRole,
  canAssignTo,
  canCreateTask,
  canManageProjects,
  getSessionUser,
  requirePlazaAccess,
  requireProjectAccess,
  taskScopeWhere,
  type SessionUser,
} from "@/lib/access";
import { todayIst } from "@/lib/dates";
import { db } from "@/lib/db";
import { taskInclude, serializeTask } from "@/lib/task-data";
import type { TaskScope } from "@/lib/task-scope";
import { createTaskSchema, createTasksSchema } from "@/lib/validations";

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

type ScopeInput = {
  projectId?: string;
  plazaId?: string;
  departmentId?: string;
};

type ResolvedScope = {
  projectId: string | null;
  plazaId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  scope: TaskScope;
};

/** The stored discriminator for a resolved scope. */
function scopeKindOf(resolved: ResolvedScope): TaskScopeKind {
  if (resolved.departmentId !== null) return "DEPARTMENT";
  if (resolved.plazaId !== null) return "PLAZA";
  if (resolved.projectId !== null) return "PROJECT";
  return "HEAD_OFFICE";
}

type TaskInput = {
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assigneeIds: string[];
  dueDate?: string;
  categoryId?: string;
};

/**
 * Resolve a requested scope to the three task columns plus the shared
 * `TaskScope` used for authorisation. Returns a ready-made `Response` when the
 * referenced project, plaza or department is missing or invalid.
 */
async function resolveScope(input: ScopeInput): Promise<ResolvedScope | Response> {
  const { projectId, plazaId, departmentId } = input;

  if (departmentId) {
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, active: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    if (!department.active) {
      return NextResponse.json(
        { error: "Department is not active" },
        { status: 422 },
      );
    }
    return {
      projectId: null,
      plazaId: null,
      departmentId: department.id,
      departmentName: department.name,
      scope: { kind: "department", departmentId: department.id },
    };
  }

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
    return {
      projectId: plaza.projectId,
      plazaId,
      departmentId: null,
      departmentName: null,
      scope: { kind: "project", projectId: plaza.projectId, plazaId },
    };
  }

  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return {
      projectId,
      plazaId: null,
      departmentId: null,
      departmentName: null,
      scope: { kind: "project", projectId, plazaId: null },
    };
  }

  // Neither column set is Head Office level.
  return {
    projectId: null,
    plazaId: null,
    departmentId: null,
    departmentName: null,
    scope: { kind: "department", departmentId: null },
  };
}

/** Validate the optional category once, before any write. */
async function categoryError(
  categoryId: string | undefined,
): Promise<Response | null> {
  if (!categoryId) return null;
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
  return null;
}

/** Creation + assignment authorisation for one resolved scope. */
async function scopeAccessError(
  user: SessionUser,
  resolved: ResolvedScope,
  assigneeIds: string[],
): Promise<Response | null> {
  if (!(await canCreateTask(user, resolved.scope))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorRole = await actorScopeRole(user, resolved.scope);
  if (!actorRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  for (const assigneeId of assigneeIds) {
    if (!(await canAssignTo(actorRole, resolved.scope, assigneeId))) {
      return NextResponse.json(
        { error: "That person cannot be assigned in this scope" },
        { status: 422 },
      );
    }
  }

  return null;
}

function createdActivityText(resolved: ResolvedScope): string {
  if (resolved.departmentId) {
    return resolved.departmentName
      ? `Department task created · ${resolved.departmentName}`
      : "Department task created";
  }
  if (resolved.projectId === null) return "Head Office task created";
  if (resolved.plazaId) return "Task created";
  return "Project-level task created";
}

/** Create one task and its creation/assignment activity inside a transaction. */
async function createScopedTask(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  resolved: ResolvedScope,
  input: TaskInput,
) {
  const created = await tx.task.create({
    data: {
      scope: scopeKindOf(resolved),
      projectId: resolved.projectId,
      plazaId: resolved.plazaId,
      departmentId: resolved.departmentId,
      categoryId: input.categoryId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      assignees: {
        create: input.assigneeIds.map((userId) => ({
          userId,
          assignedById: user.id,
        })),
      },
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
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
      toAssigneeId: input.assigneeIds[0] ?? null,
      text: createdActivityText(resolved),
    },
  });

  for (const assigneeId of input.assigneeIds) {
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
}

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const plazaId = url.searchParams.get("plazaId") ?? undefined;
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const departmentId = url.searchParams.get("departmentId") ?? undefined;
    const headOffice = url.searchParams.get("headOffice") === "true";
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

    const constraints: Prisma.TaskWhereInput[] = [];

    if (departmentId) {
      if (!canManageProjects(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const department = await db.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
      }
      constraints.push({ departmentId });
    }

    if (headOffice) {
      if (!canManageProjects(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      constraints.push({
        scope: { in: ["DEPARTMENT", "HEAD_OFFICE"] },
      });
    }

    if (plazaId) {
      await requirePlazaAccess(user, plazaId);
      constraints.push({ plazaId });
    }
    if (projectId) {
      await requireProjectAccess(user, projectId);
      constraints.push({ projectId });
    }

    if (overdue) {
      constraints.push({ dueDate: { lt: todayIst() } });
      constraints.push({ status: { not: "COMPLETED" } });
    } else if (status && (TASK_STATUSES as readonly string[]).includes(status)) {
      constraints.push({ status: status as (typeof TASK_STATUSES)[number] });
    }
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
      constraints.push({ priority: priority as (typeof PRIORITIES)[number] });
    }
    if (categoryId) constraints.push({ categoryId });
    if (assigneeParam) {
      constraints.push({
        assignees: {
          some: { userId: assigneeParam === "me" ? user.id : assigneeParam },
        },
      });
    }
    if (q) {
      constraints.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          {
            assignees: {
              some: {
                user: { name: { contains: q, mode: "insensitive" } },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.TaskWhereInput = {
      AND: [await taskScopeWhere(user), ...constraints],
    };

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

    return NextResponse.json({
      items: items.map(serializeTask),
      total,
      page,
      pageSize,
    });
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
    const isBatch =
      typeof body === "object" &&
      body !== null &&
      Array.isArray((body as { scopes?: unknown }).scopes);

    if (isBatch) {
      const parsed = createTasksSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const {
        scopes,
        title,
        description,
        priority,
        assigneeIds,
        assigneeId,
        dueDate,
        categoryId,
      } = parsed.data;
      const resolvedAssigneeIds =
        assigneeIds ?? (assigneeId ? [assigneeId] : []);

      const categoryFailure = await categoryError(categoryId);
      if (categoryFailure) return categoryFailure;

      // Resolve and authorise every scope before opening the transaction, so a
      // single bad scope writes nothing.
      const resolved: ResolvedScope[] = [];
      for (const scopeInput of scopes) {
        const target = await resolveScope(scopeInput);
        if (target instanceof Response) return target;

        const accessFailure = await scopeAccessError(
          user,
          target,
          resolvedAssigneeIds,
        );
        if (accessFailure) return accessFailure;

        resolved.push(target);
      }

      const items = await db.$transaction(async (tx) => {
        const created = [];
        for (const target of resolved) {
          created.push(
            await createScopedTask(tx, user, target, {
              title,
              description,
              priority,
              assigneeIds: resolvedAssigneeIds,
              dueDate,
              categoryId,
            }),
          );
        }
        return created;
      });

      return NextResponse.json(
        { items: items.map(serializeTask), count: items.length },
        { status: 201 },
      );
    }

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      projectId,
      plazaId,
      departmentId,
      title,
      description,
      priority,
      assigneeIds,
      assigneeId,
      dueDate,
      categoryId,
    } = parsed.data;
    const resolvedAssigneeIds =
      assigneeIds ?? (assigneeId ? [assigneeId] : []);

    const categoryFailure = await categoryError(categoryId);
    if (categoryFailure) return categoryFailure;

    const target = await resolveScope({ projectId, plazaId, departmentId });
    if (target instanceof Response) return target;

    const accessFailure = await scopeAccessError(
      user,
      target,
      resolvedAssigneeIds,
    );
    if (accessFailure) return accessFailure;

    const task = await db.$transaction((tx) =>
      createScopedTask(tx, user, target, {
        title,
        description,
        priority,
        assigneeIds: resolvedAssigneeIds,
        dueDate,
        categoryId,
      }),
    );

    return NextResponse.json(serializeTask(task), { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
