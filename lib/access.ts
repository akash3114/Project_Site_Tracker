import { Prisma, type Task } from "@prisma/client";

import {
  headOfficeContext,
  plazaRoleLabel,
  type AssigneeCandidate,
  type CandidateRole,
  type PlazaRole,
} from "./assignee-groups";
import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "./labels";
import type { TaskScope } from "./task-scope";

export type SessionUser = {
  id: string;
  /** Display level only: Admin > Head Office > Project Manager (includes site managers). */
  role: Role;
  isAdmin: boolean;
  /** Primary Head Office department, else the lowest `sortOrder` one. Null when not HO. */
  departmentName: string | null;
  /** Head Office office/city. Null when unset. */
  officeName: string | null;
};

/** Highest role a person holds in a task's scope. */
export type ScopeRole =
  | "ADMIN"
  | "HEAD_OFFICE"
  | "PROJECT_MANAGER"
  | "SITE_MANAGER";

export type TaskWithScope = Pick<
  Task,
  | "scope"
  | "projectId"
  | "plazaId"
  | "departmentId"
  | "status"
  | "createdById"
>;

/** The task shape every access decision needs, including its assignees. */
export type TaskAccessTask = TaskWithScope & {
  assignees: { userId: string }[];
};

export type TaskAccess = {
  task: TaskAccessTask;
  /** Effective role used for capability rules. */
  role: ScopeRole;
  /**
   * Role held through a project/plaza assignment or a global role. Null when
   * access comes only from being an assignee, the creator, or a manager above.
   * Manager-only observers must not inherit PM-style edit/assign rights.
   */
  scopeRole: ScopeRole | null;
  isAssignee: boolean;
  isCreator: boolean;
  /** The caller is above an assignee/creator in the reporting chain. */
  isManagerAbove: boolean;
};

/** Department fields every membership select needs for display/ordering. */
const membershipDepartmentSelect = {
  name: true,
  sortOrder: true,
} as const;

type MembershipDepartment = {
  isPrimary: boolean;
  department: { name: string; sortOrder: number };
};

/**
 * Primary department name, falling back to the membership with the lowest
 * department `sortOrder`. Null when the person holds no department.
 */
function departmentNameOf(
  memberships: MembershipDepartment[],
): string | null {
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary.department.name;
  const ordered = [...memberships].sort(
    (a, b) => a.department.sortOrder - b.department.sortOrder,
  );
  return ordered[0]?.department.name ?? null;
}

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
      office: { select: { name: true } },
      headOfficeMemberships: {
        select: { isPrimary: true, department: { select: membershipDepartmentSelect } },
      },
    },
  });
  if (!user?.active) return null;

  return {
    id: user.id,
    isAdmin: user.isAdmin,
    role: user.isAdmin
      ? "ADMIN"
      : user.headOfficeMemberships.length > 0
        ? "HEAD_OFFICE"
        : "PROJECT_MANAGER",
    departmentName: departmentNameOf(user.headOfficeMemberships),
    officeName: user.office?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reporting line
// ---------------------------------------------------------------------------

/**
 * Everyone below a user in the reporting chain, at any depth. The `UNION`
 * (not `UNION ALL`) makes the recursion cycle-safe: a bad manager link cannot
 * loop forever.
 */
export async function descendantUserIds(userId: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE downline AS (
      SELECT "id" FROM "User" WHERE "managerId" = ${userId}
      UNION
      SELECT u."id" FROM "User" u
      JOIN downline d ON u."managerId" = d."id"
    )
    SELECT DISTINCT "id" FROM downline
  `;
  return rows.map((row) => row.id);
}

/** Every manager above the given people, including the people themselves. */
async function managerAncestorIds(userIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE upline AS (
      SELECT "id", "managerId" FROM "User"
      WHERE "id" IN (${Prisma.join(ids)})
      UNION
      SELECT u."id", u."managerId" FROM "User" u
      JOIN upline p ON u."id" = p."managerId"
    )
    SELECT DISTINCT "id" FROM upline
  `;
  return new Set(rows.map((row) => row.id));
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

  const downline = await descendantUserIds(user.id);
  const [pm, site, downAssignments, downTasks] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    }),
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plaza: { select: { projectId: true } } },
    }),
    downline.length > 0
      ? db.projectAssignment.findMany({
          where: { userId: { in: downline } },
          select: { projectId: true },
        })
      : Promise.resolve([] as Array<{ projectId: string }>),
    downline.length > 0
      ? db.task.findMany({
          where: {
            OR: [
              { assignees: { some: { userId: { in: downline } } } },
              { createdById: { in: downline } },
            ],
          },
          select: { projectId: true },
        })
      : Promise.resolve([] as Array<{ projectId: string | null }>),
  ]);
  return Array.from(
    new Set([
      ...pm.map((r) => r.projectId),
      ...site.map((r) => r.plaza.projectId),
      ...downAssignments.map((r) => r.projectId),
      ...downTasks
        .map((r) => r.projectId)
        .filter((id): id is string => id !== null),
    ]),
  );
}

/** Plaza ids visible to a user. PMs see every plaza in their projects. */
export async function accessiblePlazaIds(user: SessionUser): Promise<string[]> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") {
    const all = await db.plaza.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  const downline = await descendantUserIds(user.id);
  const [direct, viaProjects, downAssignments, downTasks] = await Promise.all([
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plazaId: true },
    }),
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { project: { select: { plazas: { select: { id: true } } } } },
    }),
    downline.length > 0
      ? db.plazaAssignment.findMany({
          where: { userId: { in: downline } },
          select: { plazaId: true },
        })
      : Promise.resolve([] as Array<{ plazaId: string }>),
    downline.length > 0
      ? db.task.findMany({
          where: {
            OR: [
              { assignees: { some: { userId: { in: downline } } } },
              { createdById: { in: downline } },
            ],
          },
          select: { plazaId: true },
        })
      : Promise.resolve([] as Array<{ plazaId: string | null }>),
  ]);
  const ids = new Set<string>(direct.map((r) => r.plazaId));
  for (const pa of viaProjects) {
    for (const z of pa.project.plazas) ids.add(z.id);
  }
  for (const row of downAssignments) ids.add(row.plazaId);
  for (const row of downTasks) {
    if (row.plazaId !== null) ids.add(row.plazaId);
  }
  return Array.from(ids);
}

/**
 * Task WHERE clause for a user's visible work.
 * Admin/HO: everything.
 * PM: every task in the projects they are assigned to, including project-level tasks.
 * Site manager: tasks in the plazas they are assigned to, plus any task
 * assigned to them (project-level tasks included).
 * Anyone: every task assigned to or created by a person below them in the
 * reporting chain, at any depth.
 *
 * A person can hold several kinds of relationship, so the clauses are unioned.
 */
export async function taskScopeWhere(
  user: SessionUser,
): Promise<Prisma.TaskWhereInput> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") return {};

  const [pmProjects, sitePlazas, downline] = await Promise.all([
    db.projectAssignment.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    }),
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { plazaId: true },
    }),
    descendantUserIds(user.id),
  ]);

  const clauses: Prisma.TaskWhereInput[] = [];
  if (pmProjects.length > 0) {
    clauses.push({ projectId: { in: pmProjects.map((r) => r.projectId) } });
  }
  if (sitePlazas.length > 0) {
    clauses.push({ plazaId: { in: sitePlazas.map((r) => r.plazaId) } });
  }
  clauses.push({ assignees: { some: { userId: user.id } } });
  clauses.push({ createdById: user.id });

  if (downline.length > 0) {
    clauses.push({ assignees: { some: { userId: { in: downline } } } });
    clauses.push({ createdById: { in: downline } });
  }

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
  if (pm || site) return user;

  // A manager above someone working on this project may open the project page.
  const downline = await descendantUserIds(user.id);
  if (downline.length > 0) {
    const [downAssignment, downTask] = await Promise.all([
      db.projectAssignment.findFirst({
        where: { projectId, userId: { in: downline } },
        select: { projectId: true },
      }),
      db.task.findFirst({
        where: {
          projectId,
          OR: [
            { assignees: { some: { userId: { in: downline } } } },
            { createdById: { in: downline } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (downAssignment || downTask) return user;
  }

  throw new Response("Forbidden", { status: 403 });
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
  if (!direct && !viaProject) {
    // A manager above someone working on this plaza may open the plaza page.
    const downline = await descendantUserIds(user.id);
    if (downline.length > 0) {
      const [downAssignment, downTask] = await Promise.all([
        db.plazaAssignment.findFirst({
          where: { plazaId, userId: { in: downline } },
          select: { plazaId: true },
        }),
        db.task.findFirst({
          where: {
            plazaId,
            OR: [
              { assignees: { some: { userId: { in: downline } } } },
              { createdById: { in: downline } },
            ],
          },
          select: { id: true },
        }),
      ]);
      if (downAssignment || downTask) return user;
    }
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

// ---------------------------------------------------------------------------
// Effective role on a task
// ---------------------------------------------------------------------------

/** Role held through a project/plaza assignment. Null for task-only access. */
async function scopeRoleOnTask(
  user: SessionUser,
  task: TaskAccessTask,
): Promise<ScopeRole | null> {
  // Head Office tasks (department scope or Head Office level) are invisible to
  // project/site users unless the task is assigned to them or a junior owns it.
  if (task.departmentId !== null || task.projectId === null) return null;

  const projectId = task.projectId;
  const [pm, site] = await Promise.all([
    db.projectAssignment.findUnique({
      where: {
        projectId_userId: { projectId, userId: user.id },
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

  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  return null;
}

/**
 * Resolve how (and whether) a user may act on a task.
 *
 * Access comes from one of:
 * - a global role (Admin, Head Office);
 * - a project/plaza assignment (`scopeRole`);
 * - being an assignee or the creator;
 * - being above an assignee/creator in the reporting chain.
 *
 * The first three keep their existing rights. A manager-only observer gets
 * view/comment/status but no edit or reassign rights, because `scopeRole` is
 * null and `isManagerAbove` is true.
 */
export async function resolveTaskAccess(
  user: SessionUser,
  task: TaskAccessTask,
): Promise<TaskAccess | null> {
  const isAssignee = task.assignees.some((row) => row.userId === user.id);
  const isCreator = task.createdById === user.id;

  if (user.isAdmin) {
    return {
      task,
      role: "ADMIN",
      scopeRole: "ADMIN",
      isAssignee,
      isCreator,
      isManagerAbove: false,
    };
  }
  // Head Office is global: membership is not scoped to a company/project.
  if (user.role === "HEAD_OFFICE") {
    return {
      task,
      role: "HEAD_OFFICE",
      scopeRole: "HEAD_OFFICE",
      isAssignee,
      isCreator,
      isManagerAbove: false,
    };
  }

  const owners = [
    ...task.assignees.map((row) => row.userId),
    task.createdById,
  ];
  const ancestors = await managerAncestorIds(owners);
  const isManagerAbove =
    !isAssignee && !isCreator && ancestors.has(user.id);

  const scopeRole = await scopeRoleOnTask(user, task);
  if (scopeRole) {
    return {
      task,
      role: scopeRole,
      scopeRole,
      isAssignee,
      isCreator,
      isManagerAbove,
    };
  }

  if (isAssignee || isCreator || isManagerAbove) {
    return {
      task,
      role: "SITE_MANAGER",
      scopeRole: null,
      isAssignee,
      isCreator,
      isManagerAbove,
    };
  }

  return null;
}

export async function effectiveTaskRole(
  user: SessionUser,
  task: TaskAccessTask,
): Promise<ScopeRole | null> {
  const access = await resolveTaskAccess(user, task);
  return access?.role ?? null;
}

/** Highest role the caller holds in a scope, for creation and assignment. */
export async function actorScopeRole(
  user: SessionUser,
  scope: TaskScope,
): Promise<ScopeRole | null> {
  if (user.isAdmin) return "ADMIN";
  // Head Office is global: membership is not scoped to a company/project.
  if (user.role === "HEAD_OFFICE") return "HEAD_OFFICE";

  // Department scope is Admin/Head Office only.
  if (scope.kind === "department") return null;

  const { projectId, plazaId } = scope;
  const [pm, site] = await Promise.all([
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

  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  return null;
}

export async function requireTaskAccess(
  user: SessionUser | null,
  taskId: string,
): Promise<TaskAccess> {
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      scope: true,
      projectId: true,
      plazaId: true,
      departmentId: true,
      status: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new Response("Not found", { status: 404 });

  const access = await resolveTaskAccess(user, task);
  if (!access) throw new Response("Forbidden", { status: 403 });
  return access;
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

/**
 * Status changes belong to the people who own the work, not every peer who can
 * see it: an assignee, the creator, a manager above them in the reporting
 * chain, or Admin/Head Office/Project Manager.
 */
export function canChangeTaskStatus(access: TaskAccess): boolean {
  if (access.task.status === "COMPLETED") return false;
  if (
    access.role === "ADMIN" ||
    access.role === "HEAD_OFFICE" ||
    access.role === "PROJECT_MANAGER"
  ) {
    return true;
  }
  return access.isAssignee || access.isCreator || access.isManagerAbove;
}

export function canReopenDirectly(role: ScopeRole): boolean {
  return role === "ADMIN" || role === "HEAD_OFFICE";
}

export function canRequestReopen(access: TaskAccess): boolean {
  if (access.task.status !== "COMPLETED") return false;
  if (access.role === "PROJECT_MANAGER") return true;
  if (access.role === "SITE_MANAGER") {
    return access.isAssignee || access.isCreator || access.isManagerAbove;
  }
  return false;
}

export function canApproveReopen(role: ScopeRole): boolean {
  return role === "ADMIN" || role === "HEAD_OFFICE";
}

/** Who may create a task at this scope. Department scope is Admin/HO only. */
export async function canCreateTask(
  user: SessionUser,
  scope: TaskScope,
): Promise<boolean> {
  if (user.isAdmin || user.role === "HEAD_OFFICE") return true;
  if (scope.kind === "department") return false;

  const { projectId, plazaId } = scope;
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

  // Any Head Office membership makes the target HO — global, no company check.
  const ho = await db.headOfficeMembership.findFirst({
    where: { userId: targetUserId },
    select: { userId: true },
  });
  if (ho) return "HEAD_OFFICE";

  const [pm, site] = await Promise.all([
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

  if (pm) return "PROJECT_MANAGER";
  if (site) return "SITE_MANAGER";
  return null;
}

/**
 * Assignment ceiling:
 * - Admin/HO may assign any active user, at any scope.
 * - Department scope is Admin/HO only.
 * - PM may assign HO/Admin, project PMs, and site managers in the project.
 * - Site managers may assign the project PM and site managers on the same plaza,
 *   never HO/Admin.
 */
export async function canAssignTo(
  actorRole: ScopeRole,
  scope: TaskScope,
  targetUserId: string,
): Promise<boolean> {
  if (actorRole === "ADMIN" || actorRole === "HEAD_OFFICE") {
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { active: true },
    });
    return Boolean(target?.active);
  }

  // Department scope is Admin/Head Office only.
  if (scope.kind === "department") return false;

  const targetRole = await targetRoleOnScope(
    targetUserId,
    scope.projectId,
    scope.plazaId,
  );
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

// ---------------------------------------------------------------------------
// Assignee picker payload
// ---------------------------------------------------------------------------

/** The user shape every assignee derivation needs. */
const assigneeSelect = {
  id: true,
  name: true,
  title: true,
  isAdmin: true,
  office: { select: { name: true } },
  headOfficeMemberships: {
    select: {
      isPrimary: true,
      department: { select: { id: true, name: true, sortOrder: true } },
    },
  },
  projectAssignments: {
    select: {
      projectId: true,
      project: { select: { id: true, name: true, acronym: true } },
    },
  },
  plazaAssignments: {
    select: {
      plazaId: true,
      role: true,
      plaza: {
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true, acronym: true } },
        },
      },
    },
  },
} as const;

type AssigneeUser = Prisma.UserGetPayload<{ select: typeof assigneeSelect }>;
type PlazaAssignmentRow = AssigneeUser["plazaAssignments"][number];
type ProjectAssignmentRow = AssigneeUser["projectAssignments"][number];

const PLAZA_ROLE_ORDER: Record<PlazaRole, number> = {
  TOLL: 0,
  MAINTENANCE: 1,
  CORRIDOR: 2,
};

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function candidateRoleOf(user: AssigneeUser): CandidateRole {
  if (user.isAdmin) return "ADMIN";
  if (user.headOfficeMemberships.length > 0) return "HEAD_OFFICE";
  if (user.projectAssignments.length > 0) return "PROJECT_MANAGER";
  return "SITE_MANAGER";
}

/** Is this person assigned to the scope being filled? */
function inScope(user: AssigneeUser, scope: TaskScope): boolean {
  if (scope.kind === "department") {
    return (
      scope.departmentId !== null &&
      user.headOfficeMemberships.some(
        (m) => m.department.id === scope.departmentId,
      )
    );
  }
  if (user.projectAssignments.some((p) => p.projectId === scope.projectId)) {
    return true;
  }
  if (scope.plazaId !== null) {
    return user.plazaAssignments.some((a) => a.plazaId === scope.plazaId);
  }
  return user.plazaAssignments.some(
    (a) => a.plaza.project.id === scope.projectId,
  );
}

/**
 * Primary department: the flagged primary, else the scope's department, else
 * the lowest `sortOrder`.
 */
function primaryMembership(user: AssigneeUser, scope: TaskScope) {
  const memberships = user.headOfficeMemberships;
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary;

  if (scope.kind === "department" && scope.departmentId !== null) {
    const match = memberships.find(
      (m) => m.department.id === scope.departmentId,
    );
    if (match) return match;
  }

  return (
    [...memberships].sort(
      (a, b) =>
        a.department.sortOrder - b.department.sortOrder ||
        a.department.name.localeCompare(b.department.name),
    )[0] ?? null
  );
}

/** Primary project: the scope's project, else alphabetical by project name. */
function primaryProject(
  user: AssigneeUser,
  scope: TaskScope,
): ProjectAssignmentRow["project"] | null {
  if (scope.kind === "project") {
    const match = user.projectAssignments.find(
      (p) => p.projectId === scope.projectId,
    );
    if (match) return match.project;
  }
  return (
    [...user.projectAssignments].sort((a, b) =>
      a.project.name.localeCompare(b.project.name),
    )[0]?.project ?? null
  );
}

function plazaContext(plaza: PlazaAssignmentRow["plaza"]): string {
  return plaza.project.acronym
    ? `${plaza.name} · ${plaza.project.acronym}`
    : plaza.name;
}

function byPlazaRoleThenName(
  a: PlazaAssignmentRow,
  b: PlazaAssignmentRow,
): number {
  return (
    PLAZA_ROLE_ORDER[a.role] - PLAZA_ROLE_ORDER[b.role] ||
    a.plaza.name.localeCompare(b.plaza.name)
  );
}

/** Primary plaza: the scope's plaza, else one of its project's, else role order. */
function primaryPlaza(
  user: AssigneeUser,
  scope: TaskScope,
): PlazaAssignmentRow | null {
  if (scope.kind === "project") {
    if (scope.plazaId !== null) {
      const match = user.plazaAssignments.find(
        (a) => a.plazaId === scope.plazaId,
      );
      if (match) return match;
    }
    const inProject = user.plazaAssignments.filter(
      (a) => a.plaza.project.id === scope.projectId,
    );
    if (inProject.length > 0) {
      return [...inProject].sort(byPlazaRoleThenName)[0];
    }
  }
  return [...user.plazaAssignments].sort(byPlazaRoleThenName)[0] ?? null;
}

function searchHaystack(fields: {
  name: string;
  title: string | null;
  role: CandidateRole;
  roleLabel: string;
  contextLabel: string | null;
  department: string | null;
  office: string | null;
  contexts: string[];
}): string {
  return [
    fields.name,
    fields.title ?? "",
    fields.role,
    fields.roleLabel,
    fields.contextLabel ?? "",
    fields.department ?? "",
    fields.office ?? "",
    ...fields.contexts,
    "administrator head office project manager site manager toll manager maintenance manager corridor manager",
  ]
    .join(" ")
    .toLowerCase();
}

function toCandidate(
  user: AssigneeUser,
  scope: TaskScope,
): AssigneeCandidate {
  const role = candidateRoleOf(user);
  const office = user.office?.name ?? null;
  const scoped = inScope(user, scope);

  let roleLabel: string;
  let contextLabel: string | null = null;
  let department: string | null = null;
  let departmentId: string | null = null;
  let departmentSortOrder: number | null = null;
  let contexts: string[] = [];
  let extraContextCount = 0;
  let tier: AssigneeCandidate["tier"];

  if (role === "ADMIN") {
    roleLabel = user.title || "Administrator";
    tier = "admin";
  } else if (role === "HEAD_OFFICE") {
    const membership = primaryMembership(user, scope);
    department = membership?.department.name ?? null;
    departmentId = membership?.department.id ?? null;
    departmentSortOrder = membership?.department.sortOrder ?? null;
    contexts = distinct(
      user.headOfficeMemberships.map((m) => m.department.name),
    );
    extraContextCount = Math.max(0, contexts.length - 1);
    roleLabel = user.title || department || "Head Office";
    contextLabel = headOfficeContext(office);
    tier = scoped ? "this-scope" : "head-office";
  } else if (role === "PROJECT_MANAGER") {
    const project = primaryProject(user, scope);
    contexts = distinct(
      user.projectAssignments.map((p) => p.project.name),
    );
    extraContextCount = Math.max(0, contexts.length - 1);
    roleLabel = user.title || "Project Manager";
    contextLabel = project?.name ?? null;
    tier = scoped ? "this-scope" : "project-manager";
  } else {
    const plaza = primaryPlaza(user, scope);
    const plazaIds = distinct(user.plazaAssignments.map((a) => a.plazaId));
    contexts = distinct(
      user.plazaAssignments.map((a) => plazaContext(a.plaza)),
    );
    extraContextCount = Math.max(0, plazaIds.length - 1);
    if (plaza) {
      roleLabel = user.title || plazaRoleLabel(plaza.role);
      contextLabel = plazaContext(plaza.plaza);
    } else {
      roleLabel = user.title || "Site Manager";
    }
    tier = scoped ? "this-scope" : "site-manager";
  }

  return {
    id: user.id,
    name: user.name,
    role,
    title: user.title,
    roleLabel,
    contextLabel,
    department,
    departmentId,
    departmentSortOrder,
    office,
    extraContextCount,
    contexts,
    tier,
    search: searchHaystack({
      name: user.name,
      title: user.title,
      role,
      roleLabel,
      contextLabel,
      department,
      office,
      contexts,
    }),
  };
}

/**
 * Eligible assignees for the picker: active people associated with the selected
 * scope. One query: the `where` clause is the association filter.
 *
 * A candidate is associated with the scope when they hold:
 * - a Head Office membership in the scope's department (any membership at Head
 *   Office level, where `departmentId` is null);
 * - a project assignment on the scope's project; or
 * - a plaza assignment on the scope's plaza (or, at project level, on any of
 *   the project's plazas).
 *
 * Only active users qualify. The caller (`viewerId`) is always included even
 * when unassociated, so "Assign to me" keeps working; that is the only
 * exception. A site-manager actor still never sees admin or Head Office
 * accounts, the viewer included, because they may not assign them.
 */
export async function assigneeCandidates(
  actorRole: ScopeRole,
  scope: TaskScope,
  viewerId?: string | null,
): Promise<AssigneeCandidate[]> {
  const privileged = actorRole === "ADMIN" || actorRole === "HEAD_OFFICE";
  if (scope.kind === "department" && !privileged) return [];

  const associations: Prisma.UserWhereInput[] = [];
  if (scope.kind === "department") {
    associations.push({
      headOfficeMemberships: {
        some:
          scope.departmentId === null
            ? {}
            : { departmentId: scope.departmentId },
      },
    });
  } else {
    const { projectId, plazaId } = scope;
    associations.push({ projectAssignments: { some: { projectId } } });
    associations.push({
      plazaAssignments: {
        some: plazaId !== null ? { plazaId } : { plaza: { projectId } },
      },
    });
  }

  const candidates: Prisma.UserWhereInput[] = viewerId
    ? [...associations, { id: viewerId }]
    : associations;

  // Site managers may never assign Head Office or admin accounts. The viewer
  // is a site manager themselves, so the exclusions hold for them too.
  const where: Prisma.UserWhereInput =
    actorRole === "SITE_MANAGER"
      ? {
          active: true,
          isAdmin: false,
          headOfficeMemberships: { none: {} },
          OR: candidates,
        }
      : { active: true, OR: candidates };

  const users = await db.user.findMany({
    where,
    select: assigneeSelect,
    orderBy: { name: "asc" },
  });

  const seen = new Set<string>();
  return users
    .map((user) => toCandidate(user, scope))
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
