import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "@prisma/client";

export type SessionUser = { id: string; role: Role };

/**
 * Current session user (id + role) or null when unauthenticated.
 * Middleware gates unauth API calls with 401; routes use this for
 * scoping and role checks.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as unknown as
    | { id?: string; role?: Role }
    | undefined;
  if (!u?.id || !u?.role) return null;
  return { id: u.id, role: u.role };
}

/**
 * Plaza IDs visible to a user. Single source of truth for scoping.
 * ADMIN + MANAGEMENT see everything. MANAGER sees plazas from direct
 * plaza assignments plus every plaza of projects they manage.
 */
export async function accessiblePlazaIds(
  userId: string,
  role: Role,
): Promise<string[]> {
  if (role === "ADMIN" || role === "MANAGEMENT") {
    const all = await db.plaza.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }
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
  for (const pa of viaProjects)
    for (const z of pa.project.plazas) ids.add(z.id);
  return Array.from(ids);
}

/**
 * Throw unless the session user may access the plaza.
 * Call at the top of every plaza/task API route.
 * Throws Response(401/403) so route handlers can `throw` directly.
 */
export async function requirePlazaAccess(
  user: SessionUser | null,
  plazaId: string,
): Promise<SessionUser> {
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (user.role === "ADMIN" || user.role === "MANAGEMENT") return user;
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
    db.projectAssignment.findFirst({
      where: { userId: user.id, projectId: plaza.projectId },
      select: { projectId: true },
    }),
  ]);
  if (!direct && !viaProject)
    throw new Response("Forbidden", { status: 403 });
  return user;
}

/** Create/edit projects, plazas, assignments and tasks. */
export function canManage(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGEMENT";
}

/** Assign/revoke managers. ADMIN + MANAGEMENT only. */
export function canAssign(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGEMENT";
}

/** Reopen completed tasks. ADMIN + MANAGEMENT only. */
export function canReopen(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGEMENT";
}

/** Delete projects/plazas and deactivate users. ADMIN only. */
export function canDelete(role: Role): boolean {
  return role === "ADMIN";
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/**
 * Expanded plaza ids for one user: direct plaza assignments plus every
 * plaza of assigned projects. Used to build scoped user listings.
 */
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
  for (const pa of viaProjects)
    for (const z of pa.project.plazas) ids.add(z.id);
  return Array.from(ids);
}

/**
 * Whether `assigneeId` may be assigned work in `plazaId` (parent
 * `projectId`). ADMIN/MANAGEMENT always qualify; MANAGER needs a plaza
 * assignment on the plaza or a project assignment on its project.
 */
export async function assigneeHasPlazaAccess(
  assigneeId: string,
  plazaId: string,
  projectId: string,
): Promise<boolean> {
  const assignee = await db.user.findUnique({
    where: { id: assigneeId },
    select: { role: true, active: true },
  });
  if (!assignee || !assignee.active) return false;
  if (assignee.role === "ADMIN" || assignee.role === "MANAGEMENT")
    return true;
  const [direct, viaProject] = await Promise.all([
    db.plazaAssignment.findFirst({
      where: { userId: assigneeId, plazaId },
      select: { plazaId: true },
    }),
    db.projectAssignment.findFirst({
      where: { userId: assigneeId, projectId },
      select: { projectId: true },
    }),
  ]);
  return !!direct || !!viaProject;
}
