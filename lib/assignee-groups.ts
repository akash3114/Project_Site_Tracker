/**
 * Assignee labels, grouping and matching — the single source of truth shared
 * by the server (`lib/access.ts` builds the payload) and every picker.
 *
 * This module is intentionally dependency-free (no Prisma, no React) so it can
 * be imported from route handlers, server helpers and client components.
 */

export type CandidateRole =
  | "ADMIN"
  | "HEAD_OFFICE"
  | "PROJECT_MANAGER"
  | "SITE_MANAGER";

export type PlazaRole = "TOLL" | "MAINTENANCE" | "CORRIDOR";

export type AssigneeTier =
  | "this-scope"
  | "head-office"
  | "project-manager"
  | "site-manager"
  | "admin"
  | "other";

export type AssigneeCandidate = {
  id: string;
  name: string;
  role?: CandidateRole | null;
  /** Job title override, e.g. "Operations Manager". */
  title?: string | null;
  /** Server-derived label, e.g. "Toll Manager", "Project Manager", "Finance & Accounts". */
  roleLabel?: string | null;
  /** Server-derived context, e.g. "AP Plaza · NH-48", "Head Office · Delhi". */
  contextLabel?: string | null;
  department?: string | null;
  departmentId?: string | null;
  departmentSortOrder?: number | null;
  office?: string | null;
  /** Contexts beyond the primary one (e.g. 2 more projects). */
  extraContextCount?: number;
  /** All contexts, for tooltips/search. */
  contexts?: string[];
  /** Relevance tier computed against the current scope. */
  tier?: AssigneeTier | null;
  /** Pre-computed lowercase search haystack. */
  search?: string | null;
};

export type AssigneeGroup = {
  key: string;
  label: string;
  rows: AssigneeCandidate[];
};

const HEAD_OFFICE_LABEL = "Head Office";

const DERIVED_ROLE_LABELS: Record<CandidateRole, string> = {
  ADMIN: "Administrator",
  HEAD_OFFICE: HEAD_OFFICE_LABEL,
  PROJECT_MANAGER: "Project Manager",
  SITE_MANAGER: "Site Manager",
};

const PLAZA_ROLE_LABELS: Record<PlazaRole, string> = {
  TOLL: "Toll Manager",
  MAINTENANCE: "Maintenance Manager",
  CORRIDOR: "Corridor Manager",
};

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** Display label for a candidate: explicit label, then title, then role. */
export function roleLabelOf(row: AssigneeCandidate): string {
  const explicit = trimmed(row.roleLabel);
  if (explicit) return explicit;

  const title = trimmed(row.title);
  if (title) return title;

  if (row.role === "HEAD_OFFICE") {
    return trimmed(row.department) ?? HEAD_OFFICE_LABEL;
  }
  if (row.role) return DERIVED_ROLE_LABELS[row.role];
  return "Team member";
}

/** Secondary context line, e.g. "AP Plaza · NH-48". */
export function contextLabelOf(row: AssigneeCandidate): string | null {
  return trimmed(row.contextLabel);
}

/** "Role | Context" (or just the role when there is no context). */
export function candidateSubtitle(row: AssigneeCandidate): string {
  return [roleLabelOf(row), contextLabelOf(row)].filter(Boolean).join(" | ");
}

/** Token-AND match across every human-readable field on the row. */
export function candidateMatches(
  row: AssigneeCandidate,
  query: string,
): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [
    row.search ?? "",
    row.name,
    row.title ?? "",
    row.role ?? "",
    row.roleLabel ?? "",
    row.contextLabel ?? "",
    row.department ?? "",
    row.office ?? "",
    ...(row.contexts ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

/** "Toll Manager" / "Maintenance Manager" / "Corridor Manager". */
export function plazaRoleLabel(role: PlazaRole): string {
  return PLAZA_ROLE_LABELS[role];
}

/** "Head Office · Delhi" when an office is known, else "Head Office". */
export function headOfficeContext(office: string | null | undefined): string {
  const name = trimmed(office);
  return name ? `${HEAD_OFFICE_LABEL} · ${name}` : HEAD_OFFICE_LABEL;
}

function tierOf(row: AssigneeCandidate): AssigneeTier {
  if (row.tier) return row.tier;

  // Fallback keeps older payloads (no tier) grouping sensibly.
  switch (row.role) {
    case "ADMIN":
      return "admin";
    case "HEAD_OFFICE":
      return "head-office";
    case "PROJECT_MANAGER":
      return "project-manager";
    case "SITE_MANAGER":
      return "site-manager";
    default:
      return "other";
  }
}

function sortRows(
  rows: AssigneeCandidate[],
  viewerId: string | null,
): AssigneeCandidate[] {
  return [...rows].sort((a, b) => {
    if (viewerId) {
      const aViewer = a.id === viewerId;
      const bViewer = b.id === viewerId;
      if (aViewer !== bViewer) return aViewer ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

type HeadOfficeBucket = {
  key: string;
  label: string;
  sortOrder: number;
  rows: AssigneeCandidate[];
};

/**
 * Group rows for the assignee picker. Tier order is:
 * this scope, Head Office (subgrouped by department), other project managers,
 * other site managers, administrators, everyone else.
 */
export function groupAssignees(
  rows: AssigneeCandidate[],
  options?: { scopeKind?: "project" | "department" | null; viewerId?: string | null },
): AssigneeGroup[] {
  const scopeKind = options?.scopeKind ?? null;
  const viewerId = options?.viewerId ?? null;

  const thisScope: AssigneeCandidate[] = [];
  const headOffice = new Map<string, HeadOfficeBucket>();
  const projectManagers: AssigneeCandidate[] = [];
  const siteManagers: AssigneeCandidate[] = [];
  const admins: AssigneeCandidate[] = [];
  const other: AssigneeCandidate[] = [];

  for (const row of rows) {
    switch (tierOf(row)) {
      case "this-scope":
        thisScope.push(row);
        break;
      case "head-office": {
        const department = trimmed(row.department) ?? HEAD_OFFICE_LABEL;
        const id = trimmed(row.departmentId) ?? department;
        const key = `head-office:${id}`;
        const bucket = headOffice.get(key) ?? {
          key,
          label: department,
          sortOrder: row.departmentSortOrder ?? Number.MAX_SAFE_INTEGER,
          rows: [],
        };
        bucket.rows.push(row);
        headOffice.set(key, bucket);
        break;
      }
      case "project-manager":
        projectManagers.push(row);
        break;
      case "site-manager":
        siteManagers.push(row);
        break;
      case "admin":
        admins.push(row);
        break;
      default:
        other.push(row);
    }
  }

  const thisScopeLabel =
    scopeKind === "department"
      ? "This department"
      : scopeKind === "project"
        ? "This project team"
        : "In this scope";

  const groups: AssigneeGroup[] = [
    {
      key: "this-scope",
      label: thisScopeLabel,
      rows: sortRows(thisScope, viewerId),
    },
    ...Array.from(headOffice.values())
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
      )
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        rows: sortRows(bucket.rows, viewerId),
      })),
    {
      key: "project-manager",
      label:
        scopeKind === "project"
          ? "Other project managers"
          : "Project managers",
      rows: sortRows(projectManagers, viewerId),
    },
    {
      key: "site-manager",
      label: scopeKind === "project" ? "Other site managers" : "Site managers",
      rows: sortRows(siteManagers, viewerId),
    },
    { key: "admin", label: "Administrators", rows: sortRows(admins, viewerId) },
    { key: "other", label: "Other assignees", rows: sortRows(other, viewerId) },
  ];

  return groups.filter((group) => group.rows.length > 0);
}
