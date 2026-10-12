/**
 * Dashboard data contracts mirroring the real API shapes (plan.md §7):
 * - GET /api/projects → ProjectSummary[]
 * - GET /api/tasks (paginated) → { items: SpotlightTask[], total, page, pageSize }
 *
 * Fallback below is seed-shaped (prisma/seed.ts): real project/plaza/task
 * names, chainages, statuses and deterministic counts — not placeholders.
 */

export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type SpotlightStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

export interface ProjectSummary {
  id: string;
  name: string;
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
  plaza: { id: string; name: string; chainage: string | null; projectName: string };
  assignee: { name: string } | null;
}

export interface DashboardKpis {
  open: number;
  overdue: number;
  blocked: number;
  completedWeek: number;
}

const DAY = 24 * 60 * 60 * 1000;
const atMidnightUTC = (t: number) => {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const isoDaysFromNow = (days: number) =>
  atMidnightUTC(Date.now() + days * DAY).toISOString();

// Seed-real fallback: 3 projects (TASKS.md §0.1), plaza counts 10/10/8.
// Task distribution follows seed.ts round-robin (tasks i%28 → plaza):
// P1: 20 tasks (10 TODO overdue, 2 IN_PROGRESS, 4 BLOCKED, 4 COMPLETED)
// P2: 12 tasks (10 TODO due next 7d, 2 COMPLETED)
// P3: 8 tasks (8 IN_PROGRESS)
export const FALLBACK_PROJECTS: ProjectSummary[] = [
  {
    id: "seed-p1",
    name: "NH-48 Gujarat Corridor",
    status: "ACTIVE",
    plazaCount: 10,
    task: { total: 20, completed: 4, blocked: 4, overdue: 10 },
    progressPct: 20,
  },
  {
    id: "seed-p2",
    name: "NH-27 Saurashtra Stretch",
    status: "ACTIVE",
    plazaCount: 10,
    task: { total: 12, completed: 2, blocked: 0, overdue: 0 },
    progressPct: 17,
  },
  {
    id: "seed-p3",
    name: "NH-147 Ahmedabad Ring",
    status: "ON_HOLD",
    plazaCount: 8,
    task: { total: 8, completed: 0, blocked: 0, overdue: 0 },
    progressPct: 0,
  },
];

export const FALLBACK_KPIS: DashboardKpis = {
  open: 34,
  overdue: 10,
  blocked: 4,
  completedWeek: 6,
};

// Seed-real spotlight: overdue indices 0–9 (P1 plazas) + blocked 30–33.
// Titles/plazas/chainages copied from prisma/seed.ts constants.
const SEED_TITLES = [
  "Canopy bolt tightening LHS",
  "Toll booth UPS wiring",
  "Lane marking refresh",
  "CCTV pole alignment",
  "Drain desilting RHS",
  "ETC antenna calibration lane 3",
  "Boom barrier replacement lane 5",
  "Solar panel cleaning canopy",
  "Fire extinguisher refill audit",
  "Signage retro-reflectivity check",
  "Booth glass shutter servicing",
  "Flag mast rope replacement",
  "Solar inverter firmware update",
  "Emergency SOS phone testing",
] as const;

const SEED_PLAZAS = [
  { name: "Karjan", chainage: "KM 123+450" },
  { name: "Ankleshwar", chainage: "KM 157+200" },
  { name: "Bharuch", chainage: "KM 178+900" },
  { name: "Narmada", chainage: "KM 192+300" },
  { name: "Surat-Kamrej", chainage: "KM 215+600" },
  { name: "Navsari", chainage: "KM 238+100" },
  { name: "Valsad", chainage: "KM 256+800" },
  { name: "Vapi", chainage: "KM 278+400" },
  { name: "Palsana", chainage: "KM 205+000" },
  { name: "Olpad", chainage: "KM 198+700" },
] as const;

const NH48 = "NH-48 Gujarat Corridor";

/** 14 seed-real spotlight rows (10 overdue TODO + 4 BLOCKED), computed due dates. */
export function fallbackSpotlight(): SpotlightTask[] {
  const overdueDayOffsets = [-1, -2, -3, -4, -5, -6, -7, -1, -2, -3];
  const overdue: SpotlightTask[] = SEED_PLAZAS.map((plaza, i) => ({
    id: `seed-task-${i + 1}`,
    title: SEED_TITLES[i],
    status: "TODO",
    priority: i % 4 === 1 ? "HIGH" : "MEDIUM",
    dueDate: isoDaysFromNow(overdueDayOffsets[i]),
    plaza: {
      id: `seed-plaza-p1-${i}`,
      name: plaza.name,
      chainage: plaza.chainage,
      projectName: NH48,
    },
    assignee: { name: `Site User ${String(i + 1).padStart(2, "0")}` },
  }));
  const blockedIdx = [30, 31, 32, 33];
  const blockedPlazas = [SEED_PLAZAS[2], SEED_PLAZAS[3], SEED_PLAZAS[4], SEED_PLAZAS[5]];
  const blocked: SpotlightTask[] = blockedIdx.map((seedIdx, j) => ({
    id: `seed-task-${seedIdx + 1}`,
    title: SEED_TITLES[10 + j],
    status: "BLOCKED",
    priority: j === 2 ? "CRITICAL" : "HIGH",
    dueDate: isoDaysFromNow(j + 1),
    plaza: {
      id: `seed-plaza-p1-${2 + j}`,
      name: blockedPlazas[j].name,
      chainage: blockedPlazas[j].chainage,
      projectName: NH48,
    },
    assignee: { name: `Site User ${String(10 + j).padStart(2, "0")}` },
  }));
  return [...overdue, ...blocked];
}

export function kpisFromTasks(
  tasks: SpotlightTask[],
  projects: ProjectSummary[]
): DashboardKpis {
  void tasks;
  void projects;
  // Spotlight endpoint returns only top-20 overdue/blocked; project
  // aggregates carry totals. Derive KPIs from project stats (single source).
  const open = projects.reduce(
    (n, p) => n + (p.task.total - p.task.completed),
    0
  );
  const overdue = projects.reduce((n, p) => n + p.task.overdue, 0);
  const blocked = projects.reduce((n, p) => n + p.task.blocked, 0);
  return { open, overdue, blocked, completedWeek: FALLBACK_KPIS.completedWeek };
}
