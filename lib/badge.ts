import { db } from "@/lib/db";
import { plazaTitlesLabel, ROLE_LABELS } from "@/lib/labels";
import type { SessionUser } from "@/lib/access";

/**
 * Text for the header badge.
 *
 * Admin and Head Office show their display level. Everyone else shows the
 * job they actually hold: Project Manager when they run at least one
 * project, otherwise the plaza job titles assigned to them.
 */
export async function badgeTitle(user: SessionUser): Promise<string> {
  if (user.role === "HEAD_OFFICE") {
    return user.departmentName
      ? `${ROLE_LABELS.HEAD_OFFICE} · ${user.departmentName}`
      : ROLE_LABELS.HEAD_OFFICE;
  }
  if (user.role !== "PROJECT_MANAGER") return ROLE_LABELS[user.role];

  const [projectCount, plazaAssignments] = await Promise.all([
    db.projectAssignment.count({ where: { userId: user.id } }),
    db.plazaAssignment.findMany({
      where: { userId: user.id },
      select: { role: true },
    }),
  ]);

  if (projectCount > 0) return ROLE_LABELS.PROJECT_MANAGER;

  const titles = plazaTitlesLabel(plazaAssignments.map((row) => row.role));
  return titles || ROLE_LABELS.PROJECT_MANAGER;
}
