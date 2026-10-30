# Head Office departments as a task scope — implementation plan

Status: **in progress**
Branch: `feat/ho-department-task-scope`

> Historical design note. It predates multi-assignee tasks and the reporting
> line, so statements such as "one assignee per task" describe the state at the
> time of writing. Current behaviour is in
> [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md) and [`API.md`](./API.md).

Supersedes the "Task scope: unchanged" decision in
`docs/head-office-departments-plan.md` §2. Departments are still organisational
metadata for **access**; they become a **task location** only.

## 1. Goal

Make Head Office departments first-class task locations, equivalent to
`Project → Plaza`:

| Existing | New equivalent |
|---|---|
| Project | Head Office |
| Plaza | Department |
| Project-level task | Head Office-level task (`departmentId = null`) |
| Plaza task | Department task (`departmentId` set) |

A task belongs to **exactly one** scope: a project (optionally a plaza) **or**
Head Office (optionally a department). “Head Office level” is represented by
both `projectId` and `departmentId` being `NULL`. Department scope does not gate
visibility: Admin/HO see all HO work; project/site users see an HO task only
when it is assigned to them.

## 2. Decisions (confirmed)

1. **Multi-select = batch create.** One task per selected scope. No many-to-many
   task↔scope table.
2. **“All projects” = project-level only.** It does not expand to plazas.
   The UI states the resulting task count.
3. **HO visibility = all Admin/HO.** Departments are a location and filter, not
   a permission boundary.
4. **One assignee per task.** Multi-assignee is out of scope.
5. **Add optional `User.title`.** Used for exact labels such as
   “Operations Manager”; derived role labels are the fallback.
6. **No `/head-office` page in this phase.** Deferred.

## 3. Data model

`prisma/schema.prisma`:

```prisma
model User {
  // ...
  title String? // optional job title, e.g. "Operations Manager"
}

model Department {
  // ...
  tasks Task[]
}

model Task {
  projectId    String?
  project      Project?    @relation(fields: [projectId], references: [id], onDelete: Restrict)
  plazaId      String?
  plaza        Plaza?      @relation(fields: [plazaId], references: [id], onDelete: Restrict)
  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  // ...
  @@index([departmentId, status])
}
```

Migration `20261027000000_head_office_task_scope`:

```sql
ALTER TABLE "User" ADD COLUMN "title" TEXT;

ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Task" ADD COLUMN "departmentId" TEXT;

-- Head Office level = both projectId and departmentId are NULL.
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_at_most_one"
  CHECK (NOT ("projectId" IS NOT NULL AND "departmentId" IS NOT NULL));

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_plaza_requires_project"
  CHECK ("plazaId" IS NULL OR "projectId" IS NOT NULL);

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Task_departmentId_status_idx" ON "Task"("departmentId", "status");
```

Prisma cannot express `CHECK`; keep both constraints in the migration SQL.
Never run `prisma migrate reset`.

## 4. Shared scope contract — `lib/task-scope.ts` (new)

```ts
export type TaskScope =
  | { kind: "project"; projectId: string; plazaId: string | null }
  | { kind: "department"; departmentId: string | null };

export type ScopeRef =
  | { kind: "project"; id: string }
  | { kind: "plaza"; id: string }
  | { kind: "department"; id: string }
  | { kind: "head-office" };

// "project:<id>" | "plaza:<id>" | "department:<id>" | "head-office"
export function scopeKey(ref: ScopeRef): string;
export function parseScopeKey(key: string): ScopeRef | null;
export function taskScopeOf(task: {
  projectId: string | null;
  plazaId: string | null;
  departmentId: string | null;
}): TaskScope | null;
export function scopeRefOf(task: ...): ScopeRef | null;
export function scopeKeyOf(scope: TaskScope): string;
export function taskMatchesScope(task: ..., ref: ScopeRef): boolean;
export function sameScope(a: TaskScope | null, b: TaskScope | null): boolean;
```

Semantics:

- `project:<id>` **filter** matches the project's project-level tasks and all
  its plaza tasks.
- `project:<id>` **create** means a project-level task only.
- `plaza:<id>` matches/creates only that plaza.
- `department:<id>` matches/creates that department.
- `head-office` matches any task with `departmentId` set or `projectId = null`.

## 5. Access rules

| Action | Admin | Head Office | Project Manager | Site Manager |
|---|---|---|---|---|
| Create HO task | yes | yes | no | no |
| See HO tasks | all | all | only if assignee | only if assignee |
| Assign HO task | any active user | any active user | no | no |
| Change status / comment on assigned HO task | yes | yes | yes (as assignee) | yes (as assignee) |
| Edit HO task core fields | yes | yes | no | no |
| Reopen HO task | yes | yes | request if assigned | request if assigned |

`lib/access.ts` changes:

- `TaskWithScope` includes `departmentId: string | null`.
- `effectiveTaskRole`: if `task.departmentId` is set and the user is not
  Admin/HO, return `SITE_MANAGER` only when `task.assigneeId === user.id`,
  otherwise `null`.
- `actorScopeRole`, `canCreateTask`, `canAssignTo`, `assigneeCandidates` take a
  `TaskScope`.
- Department scope: only Admin/HO can create/assign.
- `assigneeCandidates` payload gains:
  `roleLabel`, `contextLabel`, `department`, `office`, `extraContextCount`,
  `title`, and `assignments` detail for tooltips.
- Role labels:
  - `ADMIN` → `Administrator`
  - `PROJECT_MANAGER` → `Project Manager`, context primary project
  - `TOLL` → `Toll Manager`, `MAINTENANCE` → `Maintenance Manager`,
    `CORRIDOR` → `Corridor Manager`, context `<plaza> · <project acronym>`
  - `HEAD_OFFICE` → `<primary department>`, context `Head Office · <office>`
  - `User.title` overrides the role label when present.

## 6. API contracts

| Route | Change |
|---|---|
| `POST /api/tasks` | Accept legacy single scope (`projectId`/`plazaId`/`departmentId`) **or** `scopes: [...]` (max 50). Validate all scopes, then create in one transaction. Single response unchanged; batch returns `{ items, count }`. |
| `GET /api/tasks` | Add `departmentId=` and `headOffice=true`, Admin/HO only. |
| `GET /api/tasks/:id` | Include `department`; scope-aware permissions and assignees. |
| `POST /api/tasks/:id/assign` | Scope-aware ceiling; PM/SM cannot reassign HO tasks. |
| `GET /api/assignees` | Add `departmentId=`. Return enriched labels above. |
| `GET /api/departments` | Add `memberCount` and task stats; keep Admin/HO-only; return `sortOrder`, `active`. |
| `GET /api/dashboard` | Add a `headOffice` block with department/task counts so totals reconcile. |

Validation notes:

- Department ids can be non-cuid (`dept_admin`); use `z.string().min(1)`.
- `createTaskSchema` refines exactly one of `projectId` / `departmentId`;
  `plazaId` requires `projectId`.
- Batch scopes are deduplicated; duplicates are rejected with a clear message.

## 7. Management workspace UX

### 7.1 Scope picker (create)

Replace the single-select `mgmt-scope` popover with a multi-select picker.

- Trigger label: `Where`; selected scopes render as chips plus `+N`.
- Search matches project, acronym, company, plaza, department, office.
- Groups: `Head Office` (all departments + each department) first, then
  companies/projects. Each project row is the **project-level** task; plazas are
  child rows.
- Checkboxes; Space toggles; Enter applies (never submits the form); Escape
  closes and returns focus.
- Footer shortcuts: `Select all projects` (project-level only),
  `Select all departments`, `Clear`.
- Live summary: `Creates 4 tasks · 3 projects · 1 department`.
- Submit label: `Add task` or `Add N tasks`; cap at 50.
- **Remove Recent entirely:** delete `RECENT_KEY`, `RECENT_LIMIT`,
  `readRecent`, `recentScopes`, `recentLoaded`, `didPreselect`, `pushRecent`,
  and the `Recent` group. No auto-preselection in create mode.

### 7.2 Assignee picker

Search-first combobox (same primitive as the scope picker, single-select).

- Trigger shows name plus a second line `Role | Context`.
- Groups for a project/plaza scope: `This project team`, `Head Office`
  (subgrouped by department), `Other project managers`, `Other site managers`,
  `Administrators`, `Other assignees`.
- Groups for a department scope: `This department`, `Other Head Office`,
  `Project & site managers`, `Administrators`.
- Row: name (bold) + `Role | Context` (small, quiet).
- Search matches name, title, role, department, office, project, plaza.
- Pinned `Assign to me` row when eligible.
- Empty/loading/error states; keyboard and ARIA combobox semantics.
- Delete duplicated grouping code; `lib/assignee-groups.ts` is the single source
  for labels, grouping and matching.

### 7.3 Filters, grouping, rail, rows

- `TaskFilters.projectId` becomes `scopes: string[]` (keys from §4).
- Scope filter uses the same multi-select picker in filter mode; chips with
  overflow; `Clear`.
- Add a one-click `Head Office` facet with a count.
- `GroupBy`: add `location` (project/department lanes) and `department`
  (HO tasks by department; project tasks under `Projects`). Keep
  priority/status/due.
- Portfolio rail: pinned `Head Office` block with an `All Head Office` row and
  one row per department; clicking toggles the filter. Summary:
  `28 projects · 18 departments · X open`.
- Task row: HO badge, department tag, `Head Office` location.
- Task drawer: breadcrumb `Head Office › <department>`; `TaskDetail.project`
  optional; assignee picker replaced with the shared component.
- Insights: separate `Head Office departments` card; include HO tasks in totals
  and “needing attention”.

### 7.4 User title

- `User.title String?` in schema, seed a few demo titles.
- Admin → Users editor gains an optional `Job title` field.
- Assignee labels use `title` when present, otherwise the derived role label.

## 8. Seed

- Add 6 department-scoped demo tasks across `OPS`, `FIN`, `IT` with a mix of
  statuses and assignees from those departments.
- Keep the existing 41 project tasks unchanged.
- Seed a title for the 18 department leads (`<Department> Lead`) and for
  `management@tracker.local` (`Operations Manager`).
- Update the seed summary counts.

## 9. Implementation phases and file ownership

| Phase | Owner | Files |
|---|---|---|
| 1 | subagent | `prisma/schema.prisma`, new migration, `prisma/seed.ts`, `lib/task-scope.ts`, `lib/validations.ts` |
| 2 | subagent | `lib/access.ts`, `lib/task-data.ts`, `lib/management.ts`, `lib/stats.ts`, `lib/dashboard.ts` |
| 3 | subagent | `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tasks/[id]/assign/route.ts`, `app/api/assignees/route.ts`, `app/api/departments/route.ts`, `app/api/dashboard/route.ts` |
| 4 | subagent | new `components/management/picker.tsx`, `scope-picker.tsx`, `assignee-picker.tsx`; `components/management/command-composer.tsx`; `lib/assignee-groups.ts`; `app/globals.css` |
| 5 | subagent | `components/management/task-canvas.tsx`, `portfolio-rail.tsx`, `insights.tsx`, `task-row.tsx`, `management-workspace.tsx`, `use-task-catalogue.ts`, `components/task-drawer.tsx`, `components/task-composer.tsx`, `components/task-filters.tsx`, `components/admin/users-manager.tsx` |
| 6 | orchestrator | `docs/DATABASE.md`, `docs/ACCEPTANCE.md`, `README.md`, `scripts/smoke-api.mjs`, typecheck/lint/build, browser verification |

## 10. Acceptance criteria

1. An Admin/HO user can create a task at `Head Office` or any department; the
   task appears in the management canvas with an HO badge and department tag.
2. The scope picker supports multiple scopes and `Select all projects`
   (project-level only) and shows the resulting task count before submit.
3. No dropdown contains a `Recent` section.
4. The assignee picker is searchable and shows `Role | Context` for every row,
   including `Toll Manager | <plaza>` and `Project Manager | <project>`.
5. Filtering by department, project, plaza and `Head Office` works; multiple
   scopes combine with OR; facets respect the scope.
6. A PM/SM cannot see an unassigned HO task; an assigned PM/SM can open it and
   change status/comment, but cannot reassign or edit core fields.
7. Project statistics, round charts and the dashboard reconcile with HO tasks
   (HO is its own bucket).
8. `tsc --noEmit`, `lint`, `build` and the smoke script pass.

## 11. Risks

- `projectId` becoming nullable is the largest blast radius. Use
  `lib/task-scope.ts` everywhere; let `tsc` find assumptions.
- Any renderer that assumes `task.project` must handle `null`.
- Department ids are not always cuid.
- Batch create must be transactional and guarded against double submit.
- Do not run `prisma migrate reset` on a seeded database.
