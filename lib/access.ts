import type { Prisma, Task } from "@prisma/client";

import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "./labels";

export type SessionUser = {
  id: string;
  /** Display level only: Admin > Head Office > Project Manager (includes site managers). */
  role: Role;
  isAdmin: boolean;
};

/** Highest role a person holds in a task's scope. */
export type ScopeRole =
  | "ADMIN"
  | "HEAD_OFFICE"
  | "PROJECT_MANAGER"
  | "SITE_MANAGER";

export type TaskWithScope = Pick<
  Task,
  "projectId" | "plazaId" | "status" | "assigneeId" | "createdById"
>;

/**
 * Current session user. The JWT only carries the id; the display role and
 * admin flag are re-read from the database so assignment changes take effect
 * without a new login.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as unknown as { id?: string } | undefined;
  if (!u?.id) return null;

  const user = await db.user.findUnique({
    where: { id: u.id },
    select: {
      id: true,
      active: true,
      isAdmin: true,
      companyAssignments: { select: { companyId: true }, take: 1 },
    },
  });
  if (!user?.active) return null;

  return {
    id: user.id,
    isAdmin: user.isAdmin,
    role: user.isAdmin
      ? "ADMIN"
      : user.companyAssignments.length > 0
        ? "HEAD_OFFICE"
        : "PROJECT_MANAGER",
  };
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/** Projects visible to a user. Admin/HO see every company. */
export async function accessibleProjectIds(
  user: SessionUser,
): Promise<string[]> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") {
    const all = await db.project.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  const [pm, site] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    }),
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plaza: { select: { projectId: true } } },
    }),
  ]);
  return Array.from(
    new Set([
      ...pm.map((r) => r.projectId),
      ...site.map((r) => r.plaza.projectId),
    ]),
  );
}

/** Plaza ids visible to a user. PMs see every plaza in their projects. */
export async function accessiblePlazaIds(user: SessionUser): Promise<string[]> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") {
    const all = await db.plaza.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  const [direct, viaProjects] = await Promise.all([
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plazaId: true },
    }),
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { project: { select: { plazas: { select: { id: true } } } } },
    }),
  ]);
  const ids = new Set<string>(direct.map((r) => r.plazaId));
  for (const pa of viaProjects) {
    for (const z of pa.project.plazas) ids.add(z.id);
  }
  return Array.from(ids);
}

/**
 * Task WHERE clause for a user's visible work.
 * Admin/HO: everything.
 * PM: every task in the projects they are assigned to, including project-level tasks.
 * Site manager: tasks in the plazas they are assigned to, plus any task
 * assigned to them (project-level tasks included).
 *
 * A person can hold both kinds of assignment, so the three clauses are unioned.
 */
export async function taskScopeWhere(
  user: SessionUser,
): Promise<Prisma.TaskWhereInput> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") return {};

  const [pmProjects, sitePlazas] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    }),
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plazaId: true },
    }),
  ]);

  const clauses: Prisma.TaskWhereInput[] = [];
  if (pmProjects.length > 0) {
    clauses.push({ projectId: { in: pmProjects.map((r) => r.projectId) } });
  }
  if (sitePlazas.length > 0) {
    clauses.push({ plazaId: { in: sitePlazas.map((r) => r.plazaId) } });
  }
  clauses.push({ assigneeId: user.id });

  return { OR: clauses };
}

export async function requireProjectAccess(
  user: SessionUser | null,
  projectId: string,
): Promise<SessionUser> {
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (user.isAdmin || user.role === "HEAD_OFFICE") return user;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new Response("Not found", { status: 404 });

  const [pm, site] = await Promise.all([
    db.projectAssignment.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { projectId: true },
    }),
    db.plazaAssignment.findFirst({
      where: { userId: user.id, plaza: { projectId } },
      select: { plazaId: true },
    }),
  ]);
  if (!pm && !site) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function requirePlazaAccess(
  user: SessionUser | null,
  plazaId: string,
): Promise<SessionUser> {
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (user.isAdmin || user.role === "HEAD_OFFICE") return user;

  const plaza = await db.plaza.findUnique({
    where: { id: plazaId },
    select: { id: true, projectId: true },
  });
  if (!plaza) throw new Response("Not found", { status: 404 });

  const [direct, viaProject] = await Promise.all([
    db.plazaAssignment.findFirst({
      where: { userId: user.id, plazaId },
      select: { plazaId: true },
    }),
    db.projectAssignment.findUnique({
      where: {
        projectId_userId: { projectId: plaza.projectId, userId: user.id },
      },
      select: { projectId: true },
    }),
  ]);
  if (!direct && !viaProject) throw new Response("Forbidden", { status: 403 });
  return user;
}

// ---------------------------------------------------------------------------
// Effective role on a task
// ---------------------------------------------------------------------------

export async function effectiveTaskRole(
  user: SessionUser,
  task: TaskWithScope,
): Promise<ScopeRole | null> {
  if (user.isAdmin) return "ADMIN";

  const project = await db.project.findUnique({
    where: { id: task.projectId },
    select: { companyId: true },
  });
  if (!project) return null;

  const [ho, pm, site] = await Promise.all([
    db.companyAssignment.findUnique({
      where: {
        companyId_userId: {
          companyId: project.companyId,
          userId: user.id,
        },
      },
      select: { companyId: true },
    }),
    db.projectAssignment.findUnique({
      where: {
        projectId_userId: { projectId: task.projectId, userId: user.id },
      },
      select: { projectId: true },
    }),
    task.plazaId
      ? db.plazaAssignment.findFirst({
          where: { plazaId: task.plazaId, userId: user.id },
          select: { plazaId: true },
        })
      : Promise.resolve(null),
  ]);

  if (ho) return "HEAD_OFFICE";
  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  // A site manager assigned a project-level task still needs status/comment
  // access even though they hold no plaza assignment on that task.
  if (task.assigneeId === user.id) return "SITE_MANAGER";
  return null;
}

/** Highest role the caller holds in a project/plaza scope, for creation. */
export async function actorScopeRole(
  user: SessionUser,
  projectId: string,
  plazaId: string | null,
): Promise<ScopeRole | null> {
  if (user.isAdmin) return "ADMIN";
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { companyId: true },
  });
  if (!project) return null;

  const [ho, pm, site] = await Promise.all([
    db.companyAssignment.findUnique({
      where: {
        companyId_userId: {
          companyId: project.companyId,
          userId: user.id,
        },
      },
      select: { companyId: true },
    }),
    db.projectAssignment.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { projectId: true },
    }),
    plazaId
      ? db.plazaAssignment.findFirst({
          where: { plazaId, userId: user.id },
          select: { plazaId: true },
        })
      : Promise.resolve(null),
  ]);

  if (ho) return "HEAD_OFFICE";
  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  return null;
}

export async function requireTaskAccess(
  user: SessionUser | null,
  taskId: string,
): Promise<{ task: TaskWithScope; role: ScopeRole }> {
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      plazaId: true,
      status: true,
      assigneeId: true,
      createdById: true,
    },
  });
  if (!task) throw new Response("Not found", { status: 404 });

  const role = await effectiveTaskRole(user, task);
  if (!role) throw new Response("Forbidden", { status: 403 });
  return { task, role };
}

// ---------------------------------------------------------------------------
// Capability rules
// ---------------------------------------------------------------------------

export function canManageProjects(user: SessionUser): boolean {
  return user.isAdmin || user.role === "HEAD_OFFICE";
}

export function canManageUsers(user: SessionUser): boolean {
  return user.isAdmin;
}

export function canManageCategories(user: SessionUser): boolean {
  return user.isAdmin;
}

export function canViewAudit(user: SessionUser): boolean {
  return user.isAdmin || user.role === "HEAD_OFFICE";
}

export function canDeleteProject(user: SessionUser): boolean {
  return user.isAdmin;
}

/** Core field edits: creator, PM, HO, Admin. Completed tasks lock edits. */
export function canEditTaskCore(
  user: SessionUser,
  task: TaskWithScope,
  role: ScopeRole,
): boolean {
  if (task.status === "COMPLETED") return false;
  if (role === "ADMIN" || role === "HEAD_OFFICE" || role === "PROJECT_MANAGER")
    return true;
  return task.createdById === user.id;
}

/** Status changes are open to anyone with task access, except completed tasks. */
export function canChangeTaskStatus(
  task: TaskWithScope,
  role: ScopeRole | null,
): boolean {
  return role !== null && task.status !== "COMPLETED";
}

export function canReopenDirectly(role: ScopeRole): boolean {
  return role === "ADMIN" || role === "HEAD_OFFICE";
}

export function canRequestReopen(
  task: TaskWithScope,
  role: ScopeRole | null,
): boolean {
  return (
    task.status === "COMPLETED" &&
    (role === "PROJECT_MANAGER" || role === "SITE_MANAGER")
  );
}

export function canApproveReopen(role: ScopeRole): boolean {
  return role === "ADMIN" || role === "HEAD_OFFICE";
}

/** Who may create a task at this project/plaza scope. */
export async function canCreateTask(
  user: SessionUser,
  projectId: string,
  plazaId: string | null,
): Promise<boolean> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") return true;

  // A project manager may file at project level or inside any of its plazas.
  const pm = await db.projectAssignment.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { projectId: true },
  });
  if (pm) return true;

  // Site managers file only at plaza level, and only on their own plazas.
  if (!plazaId) return false;
  const site = await db.plazaAssignment.findFirst({
    where: { plazaId, userId: user.id, plaza: { projectId } },
    select: { plazaId: true },
  });
  return Boolean(site);
}

type TargetRole = "ADMIN" | "HEAD_OFFICE" | "PROJECT_MANAGER" | "SITE_MANAGER";

async function targetRoleOnScope(
  targetUserId: string,
  projectId: string,
  plazaId: string | null,
): Promise<TargetRole | null> {
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { isAdmin: true, active: true },
  });
  if (!target?.active) return null;
  if (target.isAdmin) return "ADMIN";

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { companyId: true },
  });
  if (!project) return null;

  const [ho, pm, site] = await Promise.all([
    db.companyAssignment.findUnique({
      where: {
        companyId_userId: {
          companyId: project.companyId,
          userId: targetUserId,
        },
      },
      select: { companyId: true },
    }),
    db.projectAssignment.findUnique({
      where: {
        projectId_userId: { projectId, userId: targetUserId },
      },
      select: { projectId: true },
    }),
    plazaId
      ? db.plazaAssignment.findFirst({
          where: { plazaId, userId: targetUserId },
          select: { plazaId: true },
        })
      : db.plazaAssignment.findFirst({
          where: { userId: targetUserId, plaza: { projectId } },
          select: { plazaId: true },
        }),
  ]);

  if (ho) return "HEAD_OFFICE";
  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  return null;
}

/**
 * Assignment ceiling:
 * - Admin/HO may assign any active user.
 * - PM may assign HO/Admin, project PMs, and site managers in the project.
 * - Site managers may assign the project PM and site managers on the same plaza,
 *   never HO/Admin.
 */
export async function canAssignTo(
  actorRole: ScopeRole,
  projectId: string,
  plazaId: string | null,
  targetUserId: string,
): Promise<boolean> {
  if (actorRole === "ADMIN" || actorRole === "HEAD_OFFICE") {
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { active: true },
    });
    return Boolean(target?.active);
  }

  const targetRole = await targetRoleOnScope(targetUserId, projectId, plazaId);
  if (!targetRole) return false;

  if (actorRole === "PROJECT_MANAGER") {
    return (
      targetRole === "ADMIN" ||
      targetRole === "HEAD_OFFICE" ||
      targetRole === "PROJECT_MANAGER" ||
      targetRole === "SITE_MANAGER"
    );
  }

  if (actorRole === "SITE_MANAGER") {
    return targetRole === "PROJECT_MANAGER" || targetRole === "SITE_MANAGER";
  }

  return false;
}

/** Eligible assignees for the picker, already filtered by the ceiling. */
export async function assigneeCandidates(
  actorRole: ScopeRole,
  projectId: string,
  plazaId: string | null,
): Promise<{ id: string; name: string; role: TargetRole }[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { companyId: true },
  });
  if (!project) return [];

  if (actorRole === "ADMIN" || actorRole === "HEAD_OFFICE") {
    const users = await db.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        isAdmin: true,
        companyAssignments: { select: { companyId: true }, take: 1 },
        projectAssignments: { select: { projectId: true }, take: 1 },
        plazaAssignments: { select: { plazaId: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    });
    return users.map((u) => {
      let role: TargetRole = "SITE_MANAGER";
      if (u.isAdmin) role = "ADMIN";
      else if (u.companyAssignments.length > 0) role = "HEAD_OFFICE";
      else if (u.projectAssignments.length > 0) role = "PROJECT_MANAGER";
      return { id: u.id, name: u.name, role };
    });
  }

  const [ho, pms, site] = await Promise.all([
    db.companyAssignment.findMany({
      where: { companyId: project.companyId, user: { active: true } },
      select: { user: { select: { id: true, name: true } } },
    }),
    db.projectAssignment.findMany({
      where: { projectId, user: { active: true } },
      select: { user: { select: { id: true, name: true } } },
    }),
    plazaId
      ? db.plazaAssignment.findMany({
          where: { plazaId, user: { active: true } },
          select: { user: { select: { id: true, name: true } } },
        })
      : db.plazaAssignment.findMany({
          where: { plaza: { projectId }, user: { active: true } },
          select: { user: { select: { id: true, name: true } } },
        }),
  ]);

  const rows: { id: string; name: string; role: TargetRole }[] = [
    ...pms.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      role: "PROJECT_MANAGER" as const,
    })),
    ...site.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      role: "SITE_MANAGER" as const,
    })),
  ];

  if (actorRole === "PROJECT_MANAGER") {
    rows.push(
      ...ho.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        role: "HEAD_OFFICE" as const,
      })),
    );
    const admins = await db.user.findMany({
      where: { isAdmin: true, active: true },
      select: { id: true, name: true },
    });
    rows.push(
      ...admins.map((u) => ({
        id: u.id,
        name: u.name,
        role: "ADMIN" as const,
      })),
    );
  }

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Expanded plaza ids for one user (direct + all plazas of PM projects). */
export async function expandedPlazaIds(userId: string): Promise<string[]> {
  const [direct, viaProjects] = await Promise.all([
    db.plazaAssignment.findMany({
      where: { userId },
      select: { plazaId: true },
    }),
    db.projectAssignment.findMany({
      where: { userId },
      select: { project: { select: { plazas: { select: { id: true } } } } },
    }),
  ]);
  const ids = new Set<string>(direct.map((r) => r.plazaId));
  for (const pa of viaProjects) {
    for (const z of pa.project.plazas) ids.add(z.id);
  }
  return Array.from(ids);
}
