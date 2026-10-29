import type { Prisma, Task } from "@prisma/client";

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
  | "assigneeId"
  | "createdById"
>;

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
  // Head Office is global: membership is not scoped to a company/project.
  if (user.role === "HEAD_OFFICE") return "HEAD_OFFICE";

  // Head Office tasks (department scope or Head Office level) are invisible to
  // project/site users unless the task is assigned to them.
  if (task.departmentId !== null || task.projectId === null) {
    return task.assigneeId === user.id ? "SITE_MANAGER" : null;
  }

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
  // A site manager assigned a project-level task still needs status/comment
  // access even though they hold no plaza assignment on that task.
  if (task.assigneeId === user.id) return "SITE_MANAGER";
  return null;
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
): Promise<{ task: TaskWithScope; role: ScopeRole }> {
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
