/**
 * Dashboard data contracts mirroring the real API shapes (docs/DATABASE.md):
 * - GET /api/projects → ProjectSummary[]
 * - GET /api/tasks (paginated) → { items: SpotlightTask[], total, page, pageSize }
 *
 * Types only — real data comes from the API routes backed by Prisma. The old
 * seed-shaped fallbacks were removed once the v2 dashboards went live.
 */

export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type SpotlightStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

export interface ProjectSummary {
  id: string;
  name: string;
  acronym?: string | null;
  state?: string | null;
  round?: string | null;
  status: ProjectStatus;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
}

export interface SpotlightTask {
  id: string;
  title: string;
  status: SpotlightStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate: string | null;
  plaza: {
    id: string;
    name: string;
    chainage?: string | null;
    lengthKm?: number | null;
    state?: string | null;
    projectName: string;
  };
  assignee: { name: string } | null;
}
