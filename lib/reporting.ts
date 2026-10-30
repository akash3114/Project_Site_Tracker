import { db } from "./db";

/**
 * Validate a proposed reporting link.
 *
 * Returns a human-readable error, or null when the link is safe. The walk is
 * iterative (not recursive) and remembers visited ids, so an existing bad cycle
 * cannot hang it.
 */
export async function managerCycleError(
  userId: string,
  managerId: string | null | undefined,
): Promise<string | null> {
  if (!managerId) return null;
  if (managerId === userId) return "A person cannot report to themselves";

  const manager = await db.user.findUnique({
    where: { id: managerId },
    select: { id: true, active: true },
  });
  if (!manager) return "Manager not found";
  if (!manager.active) return "Manager is not active";

  const seen = new Set<string>();
  let current: string | null = managerId;
  while (current) {
    if (current === userId) {
      return "That reporting line would create a cycle";
    }
    if (seen.has(current)) {
      return "The existing reporting line already contains a cycle";
    }
    seen.add(current);
    const row: { managerId: string | null } | null = await db.user.findUnique({
      where: { id: current },
      select: { managerId: true },
    });
    current = row?.managerId ?? null;
  }

  return null;
}
