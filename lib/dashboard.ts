/**
 * Dashboard data contracts mirroring the API shapes.
 * - GET /api/projects → ProjectSummary[]
 * - GET /api/tasks (paginated) → { items: SpotlightTask[], total, page, pageSize }
 */

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type SpotlightStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

export interface ProjectSummary {
  id: string;
  name: string;
  acronym?: string | null;
  state?: string | null;
  round?: string | null;
  company?: { id: string; name: string } | null;
  active: boolean;
  status: ProjectStatus;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
}

export interface SpotlightTask {
  id: string;
  projectId: string | null;
  departmentId?: string | null;
  title: string;
  status: SpotlightStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  project?: { id: string; name: string; acronym?: string | null };
  department?: { id: string; name: string; code?: string | null } | null;
  plaza: {
    id: string;
    name: string;
    chainage?: string | null;
    lengthKm?: number | null;
    projectName: string;
  } | null;
  category?: { id: string; name: string } | null;
  assignee: { name: string } | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code?: string | null;
  memberCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
}

export interface HeadOfficeSummary {
  departmentCount: number;
  memberCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  departments: DepartmentSummary[];
}
