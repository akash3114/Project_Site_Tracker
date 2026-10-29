# Database audit and cleanup plan

Status: **Phase 0, 1 and 2 applied (2026-10-29)**
Audience: whoever owns the schema next.
Companions: `prisma/schema.prisma` (current schema), `docs/DATABASE.md` (intended
design), `prisma/migrations/*` (history), `docs/DEPLOY.md` (baseline reset).

This document records what the database actually was, where the patchwork was,
and the phased route to a clean model. The findings below are retained as the
historical record; the applied changes are listed in §9.

Decisions taken (2026-10-29): the dev database had no real data and was rebuilt
from `prisma/seed.ts`; cleanup went to **Phase 1 + Phase 2**; both task history
(`TaskActivity`) and master-data audit (`AuditLog`) are in scope; reference rows
use stable slug ids.

---

## 1. What the application is

A task tracker for NHIT toll-plaza operations.

```
Company ── owns ──▶ Project ── contains ──▶ Plaza
   │                    │                      │
   │                    └── Task (project-level) ◀──┐
   │                                               │
   └── Task (plaza-level) ◀────────────────────────┘

Head Office ── Department ── Task (department-level)
Head Office ────────────── Task (Head Office-level)
```

Access is **assignment-based**, never a role column:

| Grant | Row that grants it | Effect |
|---|---|---|
| Admin | `User.isAdmin = true` | everything |
| Head Office | any `HeadOfficeMembership` | every company/project/plaza/task |
| Project Manager | `ProjectAssignment` | every plaza and task in that project |
| Site Manager | `PlazaAssignment(role)` | assigned plazas + tasks assigned to them |

A person can hold several grants at once. Effective role on a task is
**Admin > Head Office > Project Manager > Site Manager**.

Workflow rules that constrain the schema:

- One assignee per task; one scope per task.
- Tasks and audit events are append-only; users are deactivated, never deleted.
- Completed tasks lock edits; reopening goes through a request/approval row.
- Batch create writes one task per selected scope in a single transaction.
- Head Office departments are **display metadata and a task location**, never a
  permission boundary.

### Current tables at audit time (14 models, 6 enums)

> Historical snapshot. After the Phase 2 cleanup the database has **15 models**
> (adds `AuditLog`) and **7 enums** (adds `TaskScopeKind`); see
> [`ERD.md`](./ERD.md) and [`SCHEMA.md`](./SCHEMA.md) for the current state.

`User`, `Company`, `Department`, `Office`, `HeadOfficeMembership`, `Project`,
`Plaza`, `ProjectAssignment`, `PlazaAssignment`, `TaskCategory`, `Task`,
`TaskActivity`, `TaskAttachment`, `TaskReopenRequest`.

Enums: `Round`, `PlazaRole`, `TaskStatus`, `Priority`, `TaskActivityType`,
`ReopenRequestStatus`.

### Migration history at audit time (4 files)

> Historical snapshot. Three forward-only migrations were added on 2026-10-29;
> see [`SCHEMA.md` § Migration history](./SCHEMA.md#migration-history) for the
> current seven.

| Migration | What it did |
|---|---|
| `20261021000000_init` | baseline: Company/Project/Plaza + assignments + tasks + activity/attachments/reopen |
| `20261023000000_head_office_departments` | replaced `CompanyAssignment` with `Department`/`Office`/`HeadOfficeMembership`; backfilled; kept `_CompanyAssignment_backup` |
| `20261023000100_department_catalogue` | inserted the 18-department catalogue for unseeded DBs |
| `20261027000000_head_office_task_scope` | `Task.projectId` nullable, added `Task.departmentId`, two `CHECK`s, `User.title` |

Hand-written SQL that Prisma cannot express, and which therefore exists **only**
in migrations (easy to lose when squashing):

- `Task_scope_at_most_one` — dropped by `20261029000002`
- `Task_plaza_requires_project` — dropped by `20261029000002`
- `HeadOfficeMembership_userId_primary_key` (partial unique)
- `TaskReopenRequest_taskId_pending_key` (partial unique)

After the Phase 2 cleanup, `Task_scope_kind_check`,
`ProjectAssignment_projectId_primary_key`,
`PlazaAssignment_plazaId_role_primary_key` and `User_email_lower_key` join this
list. See [`ERD.md` § Constraints](./ERD.md#7-constraints-worth-knowing).

---

## 2. Environment and migration reality (urgent)

### 2.1 The dev database is on the *first* schema, not the current one

The running container `tracker-db-dev` (port 5432) contains:

| Table | Shape |
|---|---|
| `User` | `role Role` enum (`ADMIN/PROJECT_LEAD/SITE_USER`), no `isAdmin`, no `officeId`, no `title` |
| `Project` | `status MasterStatus`, no `companyId`, no `round` |
| `Plaza` | `chainage`, `highway`, `location`, `status` |
| `Task` | `plazaId NOT NULL`, **no `projectId`** |
| `TaskEvent` | instead of `TaskActivity` |
| `UserPlazaAccess` | instead of `ProjectAssignment`/`PlazaAssignment` |

Its ledger has exactly one row: `20261009095237_init` — **a migration that does
not exist in this repository**. That is the v1 pilot (commit `3d46ac6`), frozen
since 2026-10-12.

Consequences:

1. The current application cannot run against it (Prisma client expects 14
   tables; the DB has 6, with different columns).
2. `prisma migrate deploy` will fail: it will try to run
   `20261021000000_init`, whose `CREATE TABLE "User"` already exists.
3. `prisma migrate status` reports drift: one applied migration is missing from
   the folder, four folder migrations are unapplied.

**This is the single most urgent fix.** The dev DB has no data worth keeping
(v1 demo data only), so it should be recreated from the current migrations.

### 2.2 Production is unknown from this machine

No `tracker-db` container and no `pgdata` volume exist locally; only
`docker_pgdata-dev`. `docs/DEPLOY.md` says any pre-Company pilot DB was reset
with `scripts/reset-prod.sh` (drops schema `public`, re-applies the baseline).
So production is *probably* on the four current migrations — but that must be
confirmed with `prisma migrate status` on the VM before any change.

### 2.3 The seed is wipe-or-skip, not reconcile

`prisma/seed.ts`:

- `SEED_RESET=1` → deletes every row in FK order, then rebuilds.
- otherwise → if **any** user exists, it prints "skipped" and exits.

There is no mode that reconciles an existing database with changed master data.
That is why every master-data change so far has needed a bespoke migration plus
a seed rewrite.

### 2.4 Reference IDs are environment-dependent

- Migrations insert `dept_admin`, `office_delhi`, `dept_hr-ld`, … (not cuids).
- The seed upserts departments/offices **by code/name**, so:
  - migrated-then-seeded DB → ids are `dept_*` / `office_*`;
  - seeded-then-migrated DB → ids are cuids (the catalogue insert is a no-op).
- Everything else uses `cuid()`.

The workaround is visible in `lib/validations.ts`: department ids validate with
`z.string().min(1)` instead of `.cuid()`, with a comment explaining why.

---

## 3. Patchwork register

Severity: **P0** = broken/incompatible, **P1** = correctness risk, **P2** =
maintainability, **P3** = polish.

| # | Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|---|
| P-01 | P0 | Dev DB is v1 and incompatible | §2.1 | Recreate dev DB from migrations + seed |
| P-02 | P0 | Repo migration ledger contains a migration that no longer exists | `20261009095237_init` in DB, absent from repo | Recreate dev DB; never rely on the v1 ledger |
| P-03 | P1 | Task scope is 3 nullable columns + 2 CHECKs; "Head Office level" = all NULL | `schema.prisma` `Task` | Add explicit `TaskScopeKind` enum column (see §5) |
| P-04 | P1 | `Plaza.state/piu/ro/lengthKm` duplicate `Project.state/piu/ro/lengthKm`; seed copies project state into every plaza | `prisma/seed.ts:337`, `schema.prisma` | Make `Project.state` authoritative; keep only `Plaza.lengthKm`; drop the rest |
| P-05 | P1 | `isPrimary` is not enforced on `ProjectAssignment` / `PlazaAssignment` | only `HeadOfficeMembership` has a partial unique index | Add partial unique indexes (after dedupe) |
| P-06 | P1 | Email uniqueness is case-sensitive at the DB, though the app lowercases | `User_email_key`; `lib/auth.ts:21`, `app/api/users/route.ts:118` | Unique index on `lower(email)` |
| P-07 | P1 | Timestamp columns are `timestamp(3)` without time zone | all migrations | Move to `timestamptz(3)` |
| P-08 | P1 | "Overdue" uses local server time in one place and UTC elsewhere | `lib/stats.ts:174` (`setHours`) vs `lib/format.ts:64` (`setUTCHours`), `lib/management.ts:227` | One `lib/dates.ts`; all comparisons UTC / IST-explicit |
| P-09 | P1 | `Company.code` required in DB, optional in API schema | `companySchema.code.optional()` vs `Company.code String` | Make required, or default in the route |
| P-10 | P1 | Reference ids are non-cuid, forcing validation exceptions | `lib/validations.ts:75-81` | Adopt an explicit id convention (§5.4) and one `idSchema` |
| P-11 | P2 | `Project.acronym` actually stores the project *code* (master data field `code`) | `seed.ts:317` `acronym: masterProject.code` | Rename to `code`, or document the mapping |
| P-12 | P2 | `Office` is the only master table without `updatedAt` | `schema.prisma` `Office` | Add `updatedAt` |
| P-13 | P2 | `onDelete` is inconsistent for user references | `assignee`/`completedBy` default `SetNull`; `actor`/`createdBy` `Restrict` | Use `Restrict` for all user references (users are never deleted) |
| P-14 | P2 | `taskPermissions.canDelete` exists, but there is no task delete API and policy says never delete | `lib/task-data.ts:113`; no `DELETE /api/tasks/:id` | Remove the flag; document no-delete |
| P-15 | P2 | Master-data changes have no audit trail; only tasks do | `TaskActivity` only | Add `AuditLog` (or scope the claim in README) |
| P-16 | P2 | Dashboard/project list issue N+1 count queries | `app/api/projects/route.ts:28-30`; `app/api/dashboard/route.ts:117-134` | One `groupBy` query per dimension |
| P-17 | P2 | Missing indexes for the real query shapes | see §4.2 | Add composite indexes |
| P-18 | P2 | `TaskActivity` mixes audit events and comments; no CHECKs on which columns are valid per type | `schema.prisma` `TaskActivity` | Add per-type CHECKs, or split `TaskComment` |
| P-19 | P3 | `Round` is an enum; adding a round needs a migration | `enum Round` | Keep enum, or store `round Int` with a CHECK |
| P-20 | P3 | `_CompanyAssignment_backup` is created but never dropped, although the docs say "a later migration drops it" | `20261023000000` §1; `docs/DATABASE.md:456-459`; no later migration references it | Drop it in the normalization migration |
| P-21 | P3 | Docs use snake_case table names in the ERD while Prisma creates PascalCase tables | `docs/DATABASE.md` diagram vs actual `"User"`, `"Task"` | Label the ERD as logical names, or map tables to snake_case with `@@map` |
| P-22 | P3 | `TaskAttachment` has no `deletedAt`; file deletion is permanent while tasks are append-only | `app/api/attachments/[id]/route.ts:59` | Decide: soft-delete or document |

---

## 4. How the DB is actually queried

### 4.1 Access resolution

`lib/access.ts` is the de-facto data-access layer (894 lines). Every request
re-derives the role from assignment rows:

- `getSessionUser()` — 1 query (user + office + memberships).
- `accessibleProjectIds()` / `accessiblePlazaIds()` — 2 queries each.
- `taskScopeWhere()` — 2 queries, returns `OR [projectId in …, plazaId in …,
  assigneeId = me]`.
- `effectiveTaskRole()` — up to 3 queries **per task** (N+1 on lists).
- `assigneeCandidates()` — fetches all matching users with 3 relations, then
  filters and sorts in JavaScript.

### 4.2 Query shapes and index coverage

| Query | Current index | Gap |
|---|---|---|
| `/api/tasks` default: scope + `ORDER BY updatedAt DESC` + pagination | none on `updatedAt` | full sort; add `(updatedAt)` / scoped composite |
| scope OR: `projectId IN` / `plazaId IN` / `assigneeId` | `(projectId,status)`, `(plazaId,status)`, `(assigneeId)` | `assigneeId` alone is weak; add `(assigneeId,status,dueDate)` |
| project stats: `projectId + status`, `projectId + dueDate` | `(projectId,status)` | dueDate path unindexed |
| department stats | `(departmentId,status)` | dueDate path unindexed |
| `createdById`, `completedById` | none | add |
| `Plaza` by project + active | `(projectId)` | add `(projectId,active)` |
| `Project` by company + active + round | `(companyId)`, `(round)`, `(active)` | add `(companyId,active,round)` |
| `User` directory order by name | none | add `(active,name)` |

---

## 5. Proposed target model

The goal is not a rewrite for its own sake. It is: **one way to say each thing,
enforced by the database where possible, with indexes that match the queries.**

### 5.1 Make the task scope explicit

Keep the three FK columns (they give real referential integrity) but add a
discriminator so the valid combinations are obvious, indexable and testable:

```prisma
enum TaskScopeKind {
  PROJECT
  PLAZA
  DEPARTMENT
  HEAD_OFFICE
}

model Task {
  scope        TaskScopeKind
  projectId    String?
  plazaId      String?
  departmentId String?
  // ...
  @@index([scope, status, dueDate])
  @@index([projectId, status, dueDate])
  @@index([plazaId, status, dueDate])
  @@index([departmentId, status, dueDate])
  @@index([assigneeId, status, dueDate])
  @@index([updatedAt])
}
```

with one CHECK per kind instead of the two loose ones:

```sql
CHECK (
  ("scope" = 'PROJECT'     AND "projectId" IS NOT NULL AND "plazaId" IS NULL     AND "departmentId" IS NULL) OR
  ("scope" = 'PLAZA'       AND "projectId" IS NOT NULL AND "plazaId" IS NOT NULL AND "departmentId" IS NULL) OR
  ("scope" = 'DEPARTMENT'  AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NOT NULL) OR
  ("scope" = 'HEAD_OFFICE' AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NULL)
)
```

Why not a separate `TaskScope` table? It would add a join to every list query
and a second write for batch create, for no integrity gain over the CHECK. Why
not a polymorphic `scopeId`? It loses FK integrity. The enum + columns is the
best trade-off here.

`lib/task-scope.ts` then becomes a thin mapper instead of a normaliser, and the
repeated `departmentId !== null || projectId === null` test disappears.

### 5.2 One source of truth for location data

- `Project.state` — authoritative (master data is per project).
- `Plaza.lengthKm` — authoritative (master data is per plaza bracket).
- `Project.lengthKm` — keep only if a real project total exists; otherwise drop.
- `Plaza.state`, `Plaza.piu`, `Plaza.ro` — drop; read through `plaza.project`.
- `Project.piu`, `Project.ro` — keep only when populated; currently always null.

The UI already selects `plaza.project` in several places, so this is a small
component change.

### 5.3 Make "primary" real

- `HeadOfficeMembership` already has a partial unique index. Optionally replace
  `isPrimary` with `User.primaryDepartmentId` so "exactly one" is a single
  column, not an app-maintained invariant. This removes the promotion logic in
  `app/api/head-office-memberships/route.ts` (≈100 lines).
- `ProjectAssignment` — add `UNIQUE (projectId) WHERE isPrimary`.
- `PlazaAssignment` — add `UNIQUE (plazaId, role) WHERE isPrimary`.

All three need a dedupe pass first (keep the earliest `assignedAt`).

### 5.4 One id convention

| Kind | Convention | Example |
|---|---|---|
| Generated rows | `cuid()` | `clx…` |
| Reference/catalogue rows | stable slug, owned by the seed | `dept_fin`, `office_delhi`, `cat_toll_ops`, `company_neppl` |

Then:

- stop inserting catalogue rows in migrations (seed owns them);
- rewrite existing reference ids to the canonical slug in a migration
  (`UPDATE "Department" SET id = 'dept_fin' WHERE code = 'FIN'` — FKs cascade);
- replace `.cuid()` in `lib/validations.ts` with a shared `idSchema`
  (`z.string().min(1).max(64)`).

This makes every environment byte-identical and removes the validation
workaround.

### 5.5 Integrity defaults

- All `User` references → `onDelete: Restrict` (users are never deleted).
- `User.office` → `SetNull` (office is metadata).
- `Task`/`Plaza`/`Project`/`Department` → `Restrict` (already correct).
- `Office` gets `updatedAt`.
- All timestamps → `@db.Timestamptz(3)`.
- Unique index on `lower(email)`.

### 5.6 Audit

If "full audit trail" is a product promise, add:

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String
  actor      User     @relation(fields: [actorId], references: [id], onDelete: Restrict)
  entity     String   // "Project" | "Plaza" | "User" | "Assignment" | ...
  entityId   String
  action     String   // CREATE | UPDATE | ARCHIVE | GRANT | REVOKE
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([entity, entityId, createdAt])
  @@index([actorId, createdAt])
}
```

Write it from the master-data routes only; task history stays in
`TaskActivity` (the feed and the audit trail for tasks are the same stream).

---

## 6. Migration strategy

### 6.1 Dev / pilot (no real data)

Recreate. No bridge migration is worth writing for v1 demo rows:

```powershell
docker exec tracker-db-dev psql -U tracker -d tracker -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm.cmd exec -- prisma migrate deploy
npm.cmd exec -- tsx prisma/seed.ts
```

Then verify counts against `docs/DATABASE.md` and fix the doc drift (P-20).

### 6.2 Production (must confirm first)

Run on the VM before touching anything:

```bash
docker compose -f docker/compose.yml exec db psql -U tracker -d tracker \
  -c 'select migration_name, finished_at from _prisma_migrations order by started_at;'
docker compose -f docker/compose.yml run --rm migrate npx prisma migrate status
```

- If the four current migrations are applied → use **forward-only** migrations
  (`20261029000000_normalize`, then smaller follow-ups). Never edit an applied
  migration.
- If v1 rows are still present → use the documented `reset-prod.sh` baseline
  reset, after a `pg_dump`.

### 6.3 Do not squash the history yet

Squashing to a single baseline is attractive but breaks any DB that already
applied the four migrations. Defer it until the schema is stable; if we do it,
ship it with a fresh-install path and keep the old folder under
`prisma/migrations-legacy/` for reference.

---

## 7. Phased roadmap

### Phase 0 — safety and truth (no schema change)

- [x] Back up dev (or accept loss) and recreate it from migrations + seed.
- [ ] Confirm production migration status and take a `pg_dump`.
- [x] Keep this audit; reconcile `docs/DATABASE.md` counts and the ID convention.

### Phase 1 — integrity, low risk

- [x] Dedupe `isPrimary`; add the two partial unique indexes.
- [x] `lower(email)` unique index.
- [x] `Office.updatedAt`.
- [x] Composite indexes from §4.2.
- [x] `timestamptz(3)` conversion.
- [x] Shared `idSchema`; fix `Company.code` validation.
- [x] `lib/dates.ts`; fix the local-vs-UTC overdue boundary.
- [x] Remove `canDelete` from `taskPermissions` (renamed to `canAdminDelete`).

### Phase 2 — model cleanup

- [x] `TaskScopeKind` + backfill + per-kind CHECK; simplify `lib/task-scope.ts`.
- [x] Resolve project/plaza location duplication.
- [x] Standardise `onDelete` for user references.
- [ ] Optionally `User.primaryDepartmentId` and delete the promotion logic.
- [x] Drop `_CompanyAssignment_backup`.
- [x] Canonical reference ids.

### Phase 3 — audit and operations

- [x] `AuditLog` + writes from master-data routes.
- [ ] Seed `SEED_MODE=reconcile` (upsert by natural key) alongside reset.
- [ ] Add `prisma migrate status` to the deploy checklist and CI.

### Phase 4 — performance

- [ ] Replace per-project/per-department count loops with `groupBy`.
- [ ] Batch role resolution for task lists (one query for assignments, not per
      task).
- [ ] Re-check `EXPLAIN` on `/api/tasks` with the new indexes.

## 9. Applied changes (2026-10-29)

Dev database rebuilt from the four baseline migrations + seed (no data loss
concern). Then three forward-only migrations:

| Migration | What it did |
|---|---|
| `20261029000000_integrity` | lower(email) unique index; primary-flag dedupe + partial unique indexes; `timestamptz(3)`; index cleanup/additions; all user FKs `Restrict`; dropped `_CompanyAssignment_backup` |
| `20261029000001_office_updated_at` | removed the temporary default on `Office.updatedAt` |
| `20261029000002_scope_audit_locations` | `TaskScopeKind` + `Task.scope` backfill + `Task_scope_kind_check`; dropped `Plaza.state/piu/ro`; canonical slug ids for Company/Department/Office/TaskCategory; `AuditLog` |

Application changes:

- `lib/dates.ts` is the single IST/UTC date source (`APP_TIME_ZONE`); all
  overdue/due comparisons route through it.
- `lib/task-scope.ts` reads `Task.scope` (with a column-shape fallback for
  payloads that predate it); `scopeTaskWhere` now filters on the discriminator.
- `lib/audit.ts` (`logAudit`, `snapshot`) records master-data mutations in the
  same transaction as the change. `GET /api/audit` reads the trail.
- `lib/validations.ts` uses one `idSchema` (`z.string().min(1).max(64)`);
  `Company.code` is required; plaza schemas no longer accept state/PIU/RO.
- `taskPermissions.canDelete` → `canAdminDelete` (attachments and another
  person's pending reopen request only; tasks are never deleted).
- Seed creates stable reference ids and writes `Task.scope`; verified counts:
  3 companies, 28 projects, 46 plazas, 18 departments, 2 offices, 112 users,
  20 memberships, 6 categories, 47 tasks (6 PROJECT, 35 PLAZA, 6 DEPARTMENT),
  138 activities, 1 pending reopen.

Verified after the migrations: `prisma migrate diff` reports an empty migration,
`tsc --noEmit` and `next lint` are clean, and `SEED_RESET=1 npm run seed`
reproduces the counts above.

---

## 8. Decisions needed

1. **Data**: is there a production database with real rows to preserve, or can
   everything be rebuilt from `prisma/seed.ts`? (The local dev DB is v1 demo
   data and is not preservable.)
2. **Depth**: Phase 1 only (integrity + indexes, no app changes), or Phase 1 +
   Phase 2 (explicit scope enum, location cleanup, primary keys)?
3. **Audit**: is the master-data audit log (`AuditLog`) in scope now, or is
   task history enough for the pilot?
4. **IDs**: adopt the slug convention for reference rows, or keep cuids
   everywhere and accept that existing `dept_*` ids stay?
