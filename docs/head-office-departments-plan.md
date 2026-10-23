# Head Office Departments — design and implementation plan

Status: **implemented**
Decision: **Option 2** — department membership *is* the Head Office grant.
Supersedes the `CompanyAssignment` model described in `docs/DATABASE.md` (that
file is updated at the end of this work).

## 1. Why

Head Office is currently expressed as `CompanyAssignment(companyId, userId,
role = HEAD_OFFICE)` — one row per company. There is one HO user and three rows.
Two problems:

1. Ho has no organisational structure. "Head Office" is 18 departments (Admin,
   Finance, HR, IT, …) and each department has people.
2. The company dimension is vestigial and inconsistent: `accessibleProjectIds()`
   grants HO every project, while `effectiveTaskRole()` demands a
   `CompanyAssignment` on the task's *company*. An HO user assigned only to
   NEPPL can list an NWPPL task and then get a 403 opening it.

Departments are **not** a fourth scope level under Company → Project → Plaza.
They are an internal Head Office dimension. Departments do **not** gate
visibility or approvals in this phase (organisational only).

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Department scope | One global catalogue shared by NEPPL / NSPPL / NWPPL |
| Membership | Many-to-many; a person may hold several departments |
| Primary department | Exactly one per person, enforced by a partial unique index |
| Effect on permissions | None. Departments are metadata/display/filtering |
| Offices | `Admin-Delhi Office` / `Admin-Mumbai Office` are **offices**, not departments |
| `management@tracker.local` | C-suite shared account: primary `Secretarial`, secondary `Finance & Accounts`, Delhi office |
| Demo data | One HO lead per department (18 users), password `Manage@123` |
| Task scope | Unchanged. `Task.projectId` stays required; no `Task.departmentId` |

## 3. Target schema

```prisma
model Department {
  id        String   @id @default(cuid())
  name      String   @unique     // "Finance & Accounts"
  code      String   @unique     // "FIN"
  sortOrder Int      @default(0) // Sr.No. from the source list
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members HeadOfficeMembership[]

  @@index([active])
}

model Office {
  id        String   @id @default(cuid())
  name      String   @unique     // "Delhi"
  city      String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  users User[]
}

model HeadOfficeMembership {
  userId       String
  departmentId String
  isPrimary    Boolean  @default(false)
  assignedById String?
  assignedAt   DateTime @default(now())

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@id([userId, departmentId])
  @@index([departmentId])
}
```

`User` changes:

```prisma
officeId String?
office   Office? @relation(fields: [officeId], references: [id], onDelete: SetNull)

headOfficeMemberships HeadOfficeMembership[]
// removed: companyAssignments CompanyAssignment[]
```

`CompanyAssignment` and enum `CompanyRole` are **removed**.

Database-level invariant (hand-written in the migration, Prisma cannot express it):

```sql
CREATE UNIQUE INDEX "HeadOfficeMembership_userId_primary_key"
  ON "HeadOfficeMembership"("userId") WHERE "isPrimary";
```

## 4. Catalogue

18 departments (source list rows 1, 4–20; rows 2–3 are offices):

| # | Name | Code |
|---|---|---|
| 1 | Admin | `ADMIN` |
| 4 | BMS | `BMS` |
| 5 | EHS | `EHS` |
| 6 | Finance & Accounts | `FIN` |
| 7 | HR - Learning & Development | `HR-LD` |
| 8 | HR-Compliance | `HR-COMP` |
| 9 | HR-Recruitment & Payroll | `HR-RP` |
| 10 | Initial Improvement/MMR | `MMR` |
| 11 | Internal Audit | `IA` |
| 12 | Investment & Acquisitions | `INV` |
| 13 | IT | `IT` |
| 14 | ITS | `ITS` |
| 15 | Legal | `LEGAL` |
| 16 | Maintenance | `MAINT` |
| 17 | Operations | `OPS` |
| 18 | Procurement | `PROC` |
| 19 | Secretarial | `SEC` |
| 20 | Treasury | `TREAS` |

Offices: `Delhi` (city Delhi), `Mumbai` (city Mumbai).

## 5. Master-data pipeline

`docs/master-data.md` stays the single source of truth. Append two sections at
the end (after the last company), as markdown tables:

```md
## Head Office Departments

| # | Department | Code |
|---|---|---|
| 1 | Admin | ADMIN |
...

## Head Office Offices

| # | Office | City |
|---|---|---|
| 1 | Delhi | Delhi |
| 2 | Mumbai | Mumbai |
```

`scripts/parse-master-data.mjs` currently treats `###` as a company heading.
`##` headings do not match that regex, so the parser gains two modes:

* on `## Head Office Departments` → parse `| n | Name | CODE |` rows into
  `departments[]` (name, code, sortOrder), skip non-table lines;
* on `## Head Office Offices` → parse `| n | Name | City |` rows into
  `offices[]`;
* company parsing continues to work unchanged.

It emits `MASTER_DEPARTMENTS: MasterDepartment[]` and
`MASTER_OFFICES: MasterOffice[]` in `prisma/master-data.ts` alongside
`MASTER_COMPANIES`, plus the matching types.

## 6. Seed

`prisma/seed.ts`:

1. Reset order (`SEED_RESET=1`) gains `headOfficeMembership.deleteMany()`
   before users/departments, and `office` / `department` deletes after users.
2. Create the 18 departments from `MASTER_DEPARTMENTS` (idempotent upsert by
   `code`, so the migration backfill row survives) and the 2 offices.
3. `management@tracker.local`: memberships `SEC` (primary) + `FIN`,
   `officeId` = Delhi.
4. 18 demo HO leads, one per department:
   * email `dept.<code-lower>@tracker.local` (e.g. `dept.fin@tracker.local`)
   * password `Manage@123`
   * name `<Department> Lead`
   * `isPrimary = true` membership on their department
   * office: Delhi for `ADMIN, FIN, SEC, TREAS, INV, LEGAL, IA, HR-LD, HR-COMP,
     HR-RP`; Mumbai for `BMS, EHS, MMR, IT, ITS, MAINT, OPS, PROC`
5. Everything else (companies, projects, plazas, 92 field users, 41 tasks) is
   unchanged.

Seed profile after this work: 3 companies, 28 projects, 46 plazas, 2 offices,
18 departments, 112 users (Admin + C-suite + 18 HO leads + 92 field), 41 tasks,
122 activities, 1 pending reopen request.

## 7. Access layer

`lib/access.ts`:

* `SessionUser` gains `departmentName: string | null` (and `officeName` if
  useful for the header).
* `getSessionUser()` selects `headOfficeMemberships` with their department and
  the user's `office`. Role:
  `isAdmin ? ADMIN : memberships.length > 0 ? HEAD_OFFICE : PROJECT_MANAGER`.
  `departmentName` = primary membership's department, else the first by
  `sortOrder`.
* `effectiveTaskRole()` / `actorScopeRole()`: HO becomes
  `if (user.role === "HEAD_OFFICE") return "HEAD_OFFICE"` — **the project →
  company lookup is deleted**. This is the cross-company 403 fix.
* `targetRoleOnScope()`: target is HO when they hold any
  `HeadOfficeMembership` (no company check).
* `assigneeCandidates()`: replace `companyAssignments` with
  `headOfficeMemberships`; return `department`/`office` alongside each
  candidate and keep HO candidates grouped by department order.
* Visibility, capability and ceiling rules are otherwise unchanged.

`lib/badge.ts`: for HO, return `Head Office · <departmentName>` when a
department exists, `Head Office` otherwise.

## 8. API contracts

| Route | Behaviour |
|---|---|
| `GET /api/departments` | all departments (with `active` flag) ordered by `sortOrder`, each with `memberCount`; Admin/HO only |
| `GET /api/head-office-memberships?userId=&departmentId=` | memberships with user + department + office |
| `POST /api/head-office-memberships` | `{ userId, departmentId, isPrimary? }`; Admin/HO; upsert; if `isPrimary`, clear the user's other primary in the same transaction |
| `PUT /api/head-office-memberships` | `{ userId, departmentId, isPrimary }` set/clear primary (transactional) |
| `DELETE /api/head-office-memberships?userId=&departmentId=` | revoke; removing the last membership is allowed and demotes the user |
| `DELETE /api/company-assignments` | route deleted |
| `GET /api/users` | replace `companyIds` with `headOfficeMemberships` (department code/name, isPrimary) and `officeName`; keep `projectIds`, `plazaIds`, `plazaRoles` |
| `GET /api/assignees` | HO candidates carry `department`/`office` |

`lib/validations.ts`: replace `companyAssignmentSchema` with
`headOfficeMembershipSchema` (`userId`, `departmentId`, `isPrimary` optional)
and `headOfficeMembershipUpdateSchema` (adds `isPrimary` required boolean).

## 9. UI

* `components/admin/access-manager.tsx` — the "Head Office companies" block
  becomes a department-grouped membership editor: departments with their
  members, add/remove, set primary, office display. PM and plaza sections are
  untouched.
* `app/(app)/admin/users/page.tsx` — add Department and Office columns and
  filters; the Assignment details stay in Access (no duplicated editor).
* `components/app-header.tsx` / layout — no structural change; the title comes
  from `badgeTitle()` and now reads `Head Office · Finance & Accounts`.
* Assignee picker in `components/task-drawer.tsx` and
  `components/task-composer.tsx` — group HO candidates by department, show the
  department under each name (19 HO users now exist).

## 10. Migration strategy

Migration name: `20261023000000_head_office_departments`.

Inside one transactional migration, in this order:

1. `CREATE TABLE "_CompanyAssignment_backup" AS SELECT * FROM "CompanyAssignment";`
2. create `Department`, `Office`, add `User.officeId`; create
   `HeadOfficeMembership` + FKs; create the partial unique index.
3. insert the `Admin` department (id `dept_admin`) and the two offices
   (ids `office_delhi`, `office_mumbai`).
4. backfill: one `HeadOfficeMembership` per distinct `CompanyAssignment.userId`
   into `dept_admin`, `isPrimary = true`; set `User.officeId = 'office_delhi'`
   for those users.
5. drop `CompanyAssignment` (FKs first), then `DROP TYPE "CompanyRole"`.
6. leave `_CompanyAssignment_backup` in place for the pilot; drop it in a later
   migration.

Pre-flight: `npx.cmd prisma migrate status` — if it reports drift or demands a
reset, **stop**; never accept `migrate reset` (it would wipe the seeded data).
Apply with `npx.cmd prisma migrate deploy`, then `npx.cmd prisma generate`.
Then `SEED_RESET=1 npm.cmd run seed` — this is only for a fresh demo database
(it wipes data). A pilot upgrade needs only `npx.cmd prisma migrate deploy`: the
`20261023000100_department_catalogue` migration completes the 18-department
catalogue on a database that is migrated but not seeded.

Rollback: the backup table plus a re-created `CompanyAssignment` is enough to
restore; the new tables can simply be dropped.

## 11. Verification

1. `npx.cmd tsc --noEmit` and `npm.cmd run lint` clean.
2. Seed counts as listed in §6; exactly one primary membership per user.
3. `scripts/smoke-api.mjs` updated (it queries `companyAssignments` directly in
   four places) and extended:
   * departments endpoint returns 18;
   * admin can create/revoke a membership;
   * a Treasury HO user can open a task on **each** company (regression for the
     cross-company 403 bug);
   * last-membership removal is allowed and demotes the user to their
     project/plaza scope.
4. Browser: header shows `Head Office · Secretarial`; `/admin/access` groups HO
   by department and can add/remove; `/admin/users` shows department/office;
   assignee picker groups HO users by department; no console errors.
5. `docs/DATABASE.md`, `README.md`, `docs/ACCEPTANCE.md` updated.

## 12. Risks

* Lockout of `management@tracker.local` if memberships are missing — mitigated
  by the migration backfill and by `admin@tracker.local` (isAdmin) remaining a
  recovery path.
* Two primaries → unique-index violation; all primary switches must be
  transactional.
* Code/schema must deploy together; locally migrate then restart dev.
* Removing a user's last membership demotes them instantly — that is the intended
  way to revoke Head Office access; Admin can re-grant it at any time.
* The smoke test and seed speak the old model until updated — same commit.

## 13. Delegation and file ownership

| Phase | Owner | Files |
|---|---|---|
| 1 | subagent | `prisma/schema.prisma`, `prisma/migrations/**`, `docs/master-data.md`, `scripts/parse-master-data.mjs`, `prisma/master-data.ts`, `prisma/seed.ts` |
| 2 | subagent | `lib/access.ts`, `lib/badge.ts`, `lib/validations.ts`, `app/api/departments/**`, `app/api/head-office-memberships/**`, `app/api/users/**`, `app/api/assignees/**`, delete `app/api/company-assignments/**` |
| 3 | subagent | `components/admin/access-manager.tsx`, `app/(app)/admin/users/page.tsx` |
| 4 | subagent | `components/task-drawer.tsx`, `components/task-composer.tsx` (assignee grouping) |
| 5 | subagent | `docs/DATABASE.md`, `README.md`, `docs/ACCEPTANCE.md`, `scripts/smoke-api.mjs` |
| final | orchestrator | typecheck, lint, migrate/seed check, browser verification, commit |
