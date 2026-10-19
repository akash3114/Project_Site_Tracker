import type { PlazaRole, Role } from "@prisma/client";

/**
 * Human-readable names for account access levels (`User.role`).
 * The enum values stay ADMIN / MANAGEMENT / MANAGER in the DB and API;
 * only the display text lives here, so it can change without a migration.
 */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGEMENT: "Management",
  MANAGER: "Project Manager",
};

/** Display names for plaza job titles (`PlazaAssignment.role`). */
export const PLAZA_ROLE_LABELS: Record<PlazaRole, string> = {
  TOLL: "Toll Manager",
  MAINTENANCE: "Maintenance Manager",
  CORRIDOR: "Corridor Manager",
};

/** Picker order for account types. */
export const ROLE_OPTIONS: Role[] = ["MANAGER", "MANAGEMENT", "ADMIN"];

/** Picker order for plaza job titles. */
export const PLAZA_ROLE_OPTIONS: PlazaRole[] = [
  "TOLL",
  "MAINTENANCE",
  "CORRIDOR",
];

/** Label for an account level, tolerating a loosely-typed value. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/** Label for a plaza job title, tolerating a loosely-typed value. */
export function plazaRoleLabel(role: string): string {
  return PLAZA_ROLE_LABELS[role as PlazaRole] ?? role;
}
