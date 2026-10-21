/** Display level derived from assignments. Not a database enum. */
export type Role = "ADMIN" | "HEAD_OFFICE" | "PROJECT_MANAGER";

/**
 * Human-readable names for the display level shown in the header and in
 * admin consoles. Site managers deliberately roll up to "Project Manager"
 * for navigation; their real job title comes from plaza assignments.
 */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  HEAD_OFFICE: "Head Office",
  PROJECT_MANAGER: "Project Manager",
};

/** Display names for plaza job titles (`PlazaAssignment.role`). */
export const PLAZA_ROLE_LABELS: Record<
  "TOLL" | "MAINTENANCE" | "CORRIDOR",
  string
> = {
  TOLL: "Toll Manager",
  MAINTENANCE: "Maintenance Manager",
  CORRIDOR: "Corridor Manager",
};

/** Picker order for display levels. */
export const ROLE_OPTIONS: Role[] = [
  "PROJECT_MANAGER",
  "HEAD_OFFICE",
  "ADMIN",
];

/** Picker order for plaza job titles. */
export const PLAZA_ROLE_OPTIONS: ("TOLL" | "MAINTENANCE" | "CORRIDOR")[] = [
  "TOLL",
  "MAINTENANCE",
  "CORRIDOR",
];

export const SCOPE_ROLE_LABELS: Record<
  "ADMIN" | "HEAD_OFFICE" | "PROJECT_MANAGER" | "SITE_MANAGER",
  string
> = {
  ADMIN: "Admin",
  HEAD_OFFICE: "Head Office",
  PROJECT_MANAGER: "Project Manager",
  SITE_MANAGER: "Site Manager",
};

/** Label for an account level, tolerating a loosely-typed value. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/** Label for a plaza job title, tolerating a loosely-typed value. */
export function plazaRoleLabel(role: string): string {
  return PLAZA_ROLE_LABELS[role as keyof typeof PLAZA_ROLE_LABELS] ?? role;
}

/**
 * Join one or more plaza job titles in picker order, e.g.
 * `["CORRIDOR", "TOLL"]` -> "Toll Manager · Corridor Manager".
 */
export function plazaTitlesLabel(
  roles: ("TOLL" | "MAINTENANCE" | "CORRIDOR")[],
): string {
  return PLAZA_ROLE_OPTIONS.filter((role) => roles.includes(role))
    .map((role) => PLAZA_ROLE_LABELS[role])
    .join(" · ");
}
