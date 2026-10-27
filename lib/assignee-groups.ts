/**
 * Assignee option grouping shared by the management composer. Mirrors the
 * grouping used by the existing task composer and drawer so the picker reads
 * the same everywhere: Administrators, one group per Head Office department,
 * Project managers, Site managers, then anything unclassified.
 */

export type CandidateRole =
  | "ADMIN"
  | "HEAD_OFFICE"
  | "PROJECT_MANAGER"
  | "SITE_MANAGER";

export type AssigneeCandidate = {
  id: string;
  name: string;
  role?: CandidateRole | null;
  department?: string | null;
  office?: string | null;
};

export type AssigneeGroup = {
  key: string;
  label: string;
  rows: AssigneeCandidate[];
};

const HEAD_OFFICE_FALLBACK = "Head Office";

export function groupAssignees(rows: AssigneeCandidate[]): AssigneeGroup[] {
  const admin: AssigneeCandidate[] = [];
  const headOffice = new Map<string, AssigneeCandidate[]>();
  const projectManagers: AssigneeCandidate[] = [];
  const siteManagers: AssigneeCandidate[] = [];
  const other: AssigneeCandidate[] = [];

  for (const row of rows) {
    if (row.role === "ADMIN") {
      admin.push(row);
    } else if (row.role === "HEAD_OFFICE") {
      const department = row.department?.trim() || HEAD_OFFICE_FALLBACK;
      const bucket = headOffice.get(department);
      if (bucket) bucket.push(row);
      else headOffice.set(department, [row]);
    } else if (row.role === "PROJECT_MANAGER") {
      projectManagers.push(row);
    } else if (row.role === "SITE_MANAGER") {
      siteManagers.push(row);
    } else {
      other.push(row);
    }
  }

  const groups: AssigneeGroup[] = [
    { key: "admin", label: "Administrators", rows: admin },
    ...Array.from(headOffice.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((department) => ({
        key: `head-office:${department}`,
        label: department,
        rows: headOffice.get(department) ?? [],
      })),
    {
      key: "project-managers",
      label: "Project managers",
      rows: projectManagers,
    },
    { key: "site-managers", label: "Site managers", rows: siteManagers },
    { key: "other", label: "Other assignees", rows: other },
  ];

  return groups.filter((group) => group.rows.length > 0);
}
