import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "@prisma/client";

export type SessionUser = { id: string; role: Role };

/**
 * Current session user (id + role) or null when unauthenticated.
 * Middleware already gates unauth API calls with 401; routes use this
 * for scoping and role checks.
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
 * Plaza IDs visible to a user.
 * ADMIN → every plaza. Others → UserPlazaAccess join.
 * Single source of truth for scoping (TASKS.md T-011).
 */
export async function accessiblePlazaIds(
  userId: string,
  role: Role,
): Promise<string[]> {
  if (role === "ADMIN") {
    const all = await db.plaza.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }
  const rows = await db.userPlazaAccess.findMany({
    where: { userId },
    select: { plazaId: true },
  });
  return rows.map((r) => r.plazaId);
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
  if (user.role === "ADMIN") return user;
  const hit = await db.userPlazaAccess.findUnique({
    where: { userId_plazaId: { userId: user.id, plazaId } },
  });
  if (!hit) throw new Response("Forbidden", { status: 403 });
  return user;
}

export function canAssign(role: Role): boolean {
  return role === "ADMIN" || role === "PROJECT_LEAD";
}

export function canReopen(role: Role): boolean {
  return role === "ADMIN" || role === "PROJECT_LEAD";
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}
