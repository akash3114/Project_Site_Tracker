# Schema Reference — Project Site Tracker

Column-level data dictionary for the PostgreSQL database built by
`prisma/migrations/*`. This is the companion to [`ERD.md`](./ERD.md), which
shows relationships and cardinality; the intended design is in
[`DATABASE.md`](./DATABASE.md) and the cleanup rationale in
[`DATABASE-AUDIT.md`](./DATABASE-AUDIT.md).

Conventions used below:

* Types are the **real PostgreSQL types** from the migration SQL, not Prisma
  types. `timestamptz(3)` = `TIMESTAMP(3) WITH TIME ZONE`.
* "Default" is the database default. `cuid()` is a **client-side** Prisma
  default and does not exist in the database — raw SQL inserts must supply an
  id.
* Every `updatedAt` is written by Prisma's `@updatedAt` from the application;
  none has a database default.
* Table and column names are quoted PascalCase/camelCase identifiers. There is
  no `@@map`, so `Task` is really `"Task"`.

Model count: **15**. Enum count: **7**.

---

## Contents

1. [User](#user)
2. [Company](#company)
3. [Department](#department)
4. [Office](#office)
5. [HeadOfficeMembership](#headofficemembership)
6. [Project](#project)
7. [Plaza](#plaza)
8. [ProjectAssignment](#projectassignment)
9. [PlazaAssignment](#plazaassignment)
10. [TaskCategory](#taskcategory)
11. [Task](#task)
12. [TaskAssignee](#taskassignee)
13. [TaskActivity](#taskactivity)
14. [TaskAttachment](#taskattachment)
15. [TaskReopenRequest](#taskreopenrequest)
16. [AuditLog](#auditlog)
17. [Enums](#enums)
18. [Constraints](#constraints)
19. [Migration history](#migration-history)
20. [Conventions and gotchas](#conventions-and-gotchas)

---

## User

Login identity and the only account-level flag. Access is otherwise derived from
assignment rows.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` (client) | PK |
| `name` | `text` | no | — | display name |
| `email` | `text` | no | — | unique; also unique on `lower(email)` |
| `phone` | `text` | yes | — | optional contact |
| `title` | `text` | yes | — | optional job title, e.g. `Operations Manager`; overrides the derived role label |
| `passwordHash` | `text` | no | — | bcrypt, cost 12 |
| `isAdmin` | `boolean` | no | `false` | platform administrator |
| `active` | `boolean` | no | `true` | deactivate instead of delete |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |
| `officeId` | `text` | yes | — | FK → `Office.id`, `SET NULL` |
| `managerId` | `text` | yes | — | self-FK → `User.id`, `SET NULL`; reporting line, not an access grant |

**Relations (out):** `officeId` → `Office`, `managerId` → `User` (self).
**Relations (in):** `User` (reports, self), `HeadOfficeMembership`,
`ProjectAssignment`, `PlazaAssignment`, `TaskAssignee` (assignee, assigner),
`Task` (creator, completer), `TaskActivity` (actor, from-assignee,
to-assignee), `TaskAttachment.uploadedBy`, `TaskReopenRequest` (requester,
reviewer), `AuditLog.actor`.

**Indexes**

| Name | Definition |
|---|---|
| `User_pkey` | `PRIMARY KEY ("id")` |
| `User_email_key` | `UNIQUE ("email")` |
| `User_email_lower_key` | `UNIQUE (lower("email"))` |
| `User_isAdmin_idx` | `("isAdmin")` |
| `User_active_name_idx` | `("active", "name")` |
| `User_managerId_idx` | `("managerId")` |

**Constraints:** `User_officeId_fkey` → `Office(id)` `ON DELETE SET NULL
ON UPDATE CASCADE`; `User_managerId_fkey` → `User(id)` `ON DELETE SET NULL
ON UPDATE CASCADE`. Users are never deleted; every other user FK is `Restrict`.

---

## Company

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | slug id in practice, e.g. `company_neppl` |
| `name` | `text` | no | — | unique |
| `code` | `text` | no | — | unique short code, `NEPPL` / `NSPPL` / `NWPPL` |
| `active` | `boolean` | no | `true` | soft archive |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |

**Relations (in):** `Project.companyId` (`Restrict`), `AuditLog` (logical).

**Indexes**

| Name | Definition |
|---|---|
| `Company_pkey` | `PRIMARY KEY ("id")` |
| `Company_name_key` | `UNIQUE ("name")` |
| `Company_code_key` | `UNIQUE ("code")` |
| `Company_active_name_idx` | `("active", "name")` |

---

## Department

Global Head Office catalogue. Departments are organisational metadata **and** a
task location; they never gate permissions.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | slug id, e.g. `dept_fin`, `dept_hr-ld` |
| `name` | `text` | no | — | unique, e.g. `Finance & Accounts` |
| `code` | `text` | no | — | unique, e.g. `FIN`, `HR-LD` |
| `sortOrder` | `integer` | no | `0` | source-list order; drives display |
| `active` | `boolean` | no | `true` | retire from new memberships |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |

**Relations (in):** `HeadOfficeMembership.departmentId` (`Cascade`),
`Task.departmentId` (`Restrict`).

**Indexes**

| Name | Definition |
|---|---|
| `Department_pkey` | `PRIMARY KEY ("id")` |
| `Department_name_key` | `UNIQUE ("name")` |
| `Department_code_key` | `UNIQUE ("code")` |
| `Department_active_sortOrder_idx` | `("active", "sortOrder")` |

---

## Office

Where a person sits. Display metadata only.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | slug id, e.g. `office_delhi` |
| `name` | `text` | no | — | unique, e.g. `Delhi` |
| `city` | `text` | yes | — | optional |
| `active` | `boolean` | no | `true` | display flag |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | added in `20261029000000`; temporary default dropped in `20261029000001` |

**Relations (in):** `User.officeId` (`SET NULL`).

**Indexes**

| Name | Definition |
|---|---|
| `Office_pkey` | `PRIMARY KEY ("id")` |
| `Office_name_key` | `UNIQUE ("name")` |

There is no index on `Office.active`.

---

## HeadOfficeMembership

Holding any row is the Head Office grant — global, across every company.
`@@id([userId, departmentId])`.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `userId` | `text` | no | — | PK part, FK → `User.id` |
| `departmentId` | `text` | no | — | PK part, FK → `Department.id` |
| `isPrimary` | `boolean` | no | `false` | department shown in the header |
| `assignedById` | `text` | yes | — | **no FK**; plain text user id |
| `assignedAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `userId` → `User` (`Cascade`), `departmentId` → `Department`
(`Cascade`).

**Indexes**

| Name | Definition |
|---|---|
| `HeadOfficeMembership_pkey` | `PRIMARY KEY ("userId", "departmentId")` |
| `HeadOfficeMembership_departmentId_idx` | `("departmentId")` |
| `HeadOfficeMembership_userId_primary_key` | `UNIQUE ("userId") WHERE "isPrimary"` |

**Invariant:** at most one `isPrimary = true` per user (partial index). The API
maintains **exactly one** for any user who has memberships.

---

## Project

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `companyId` | `text` | no | — | FK → `Company.id` |
| `name` | `text` | no | — | unique per company |
| `acronym` | `text` | yes | — | non-unique, indexed, display/search only; stores the master-data project code |
| `round` | `"Round"` | no | — | `ROUND_1` … `ROUND_4` |
| `state` | `text` | yes | — | authoritative location metadata |
| `lengthKm` | `double precision` | yes | — | nullable; seed leaves blank |
| `piu` | `text` | yes | — | authoritative location metadata |
| `ro` | `text` | yes | — | authoritative location metadata |
| `active` | `boolean` | no | `true` | soft archive; projects never complete |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |

**Relations:** `companyId` → `Company` (`Restrict`).
**Relations (in):** `Plaza.projectId` (`Restrict`), `ProjectAssignment.projectId`
(`Cascade`), `Task.projectId` (`Restrict`), `AuditLog` (logical).

**Indexes**

| Name | Definition |
|---|---|
| `Project_pkey` | `PRIMARY KEY ("id")` |
| `Project_companyId_name_key` | `UNIQUE ("companyId", "name")` |
| `Project_companyId_active_round_idx` | `("companyId", "active", "round")` |
| `Project_round_idx` | `("round")` |
| `Project_acronym_idx` | `("acronym")` |

---

## Plaza

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `projectId` | `text` | no | — | FK → `Project.id` |
| `name` | `text` | no | — | unique per project |
| `lengthKm` | `double precision` | yes | — | plaza bracket length; the only plaza-specific location field |
| `active` | `boolean` | no | `true` | soft archive; plazas never complete |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |

`state`, `piu` and `ro` were **dropped** by
`20261029000002_scope_audit_locations`. Read them through `plaza.project`.

**Relations:** `projectId` → `Project` (`Restrict`).
**Relations (in):** `PlazaAssignment.plazaId` (`Cascade`), `Task.plazaId`
(`Restrict`), `AuditLog` (logical).

**Indexes**

| Name | Definition |
|---|---|
| `Plaza_pkey` | `PRIMARY KEY ("id")` |
| `Plaza_projectId_name_key` | `UNIQUE ("projectId", "name")` |
| `Plaza_projectId_active_idx` | `("projectId", "active")` |

---

## ProjectAssignment

Project manager grant. `@@id([projectId, userId])`.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `projectId` | `text` | no | — | PK part, FK → `Project.id` |
| `userId` | `text` | no | — | PK part, FK → `User.id` |
| `isPrimary` | `boolean` | no | `false` | lead PM |
| `assignedById` | `text` | yes | — | **no FK** |
| `assignedAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `projectId` → `Project` (`Cascade`), `userId` → `User`
(`Cascade`).

**Indexes**

| Name | Definition |
|---|---|
| `ProjectAssignment_pkey` | `PRIMARY KEY ("projectId", "userId")` |
| `ProjectAssignment_projectId_idx` | `("projectId")` |
| `ProjectAssignment_userId_idx` | `("userId")` |
| `ProjectAssignment_projectId_primary_key` | `UNIQUE ("projectId") WHERE "isPrimary"` |

---

## PlazaAssignment

Site manager grant. `@@id([plazaId, userId, role])` — one row per job title, so
a person can be both `TOLL` and `MAINTENANCE` on the same plaza.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `plazaId` | `text` | no | — | PK part, FK → `Plaza.id` |
| `userId` | `text` | no | — | PK part, FK → `User.id` |
| `role` | `"PlazaRole"` | no | — | PK part: `TOLL` / `MAINTENANCE` / `CORRIDOR` |
| `isPrimary` | `boolean` | no | `false` | lead for this plaza + role |
| `assignedById` | `text` | yes | — | **no FK** |
| `assignedAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `plazaId` → `Plaza` (`Cascade`), `userId` → `User` (`Cascade`).

**Indexes**

| Name | Definition |
|---|---|
| `PlazaAssignment_pkey` | `PRIMARY KEY ("plazaId", "userId", "role")` |
| `PlazaAssignment_plazaId_idx` | `("plazaId")` |
| `PlazaAssignment_userId_idx` | `("userId")` |
| `PlazaAssignment_plazaId_role_primary_key` | `UNIQUE ("plazaId", "role") WHERE "isPrimary"` |

---

## TaskCategory

Admin-managed lookup.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | slug id, e.g. `cat_toll_operations` |
| `name` | `text` | no | — | unique |
| `active` | `boolean` | no | `true` | soft archive |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed |

**Relations (in):** `Task.categoryId` (`SET NULL`), `AuditLog` (logical).

**Indexes**

| Name | Definition |
|---|---|
| `TaskCategory_pkey` | `PRIMARY KEY ("id")` |
| `TaskCategory_name_key` | `UNIQUE ("name")` |
| `TaskCategory_active_name_idx` | `("active", "name")` |

---

## Task

One row per task. Exactly one scope, recorded by the `scope` discriminator and
enforced by `Task_scope_kind_check`.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `scope` | `"TaskScopeKind"` | no | — | `PROJECT` / `PLAZA` / `DEPARTMENT` / `HEAD_OFFICE` |
| `projectId` | `text` | yes | — | FK → `Project.id`; set for `PROJECT` and `PLAZA` |
| `plazaId` | `text` | yes | — | FK → `Plaza.id`; set for `PLAZA` only |
| `departmentId` | `text` | yes | — | FK → `Department.id`; set for `DEPARTMENT` only |
| `categoryId` | `text` | yes | — | FK → `TaskCategory.id` |
| `title` | `text` | no | — | |
| `description` | `text` | yes | — | |
| `status` | `"TaskStatus"` | no | `'TODO'` | `TODO` / `IN_PROGRESS` / `BLOCKED` / `COMPLETED` |
| `priority` | `"Priority"` | no | `'MEDIUM'` | `LOW` / `MEDIUM` / `HIGH` |
| `createdById` | `text` | no | — | FK → `User.id` |
| `dueDate` | `date` | yes | — | date only, no time or zone |
| `completedAt` | `timestamptz(3)` | yes | — | set when status becomes `COMPLETED` |
| `completedById` | `text` | yes | — | FK → `User.id` |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updatedAt` | `timestamptz(3)` | no | — | client-managed; drives the default task list order |

**Relations:** `projectId` → `Project` (`Restrict`), `plazaId` → `Plaza`
(`Restrict`), `departmentId` → `Department` (`Restrict`), `categoryId` →
`TaskCategory` (`SET NULL`), `createdById` → `User` (`Restrict`),
`completedById` → `User` (`Restrict`).
**Relations (in):** `TaskAssignee`, `TaskActivity`, `TaskAttachment`,
`TaskReopenRequest` (`TaskAssignee` cascades with the task; the rest cascade
too).

Assignees are a many-to-many set; `Task.assigneeId` was backfilled into
[`TaskAssignee`](#taskassignee) and dropped in
`20261029000003_task_assignees_and_reporting`.

**Indexes**

| Name | Definition |
|---|---|
| `Task_pkey` | `PRIMARY KEY ("id")` |
| `Task_projectId_status_dueDate_idx` | `("projectId", "status", "dueDate")` |
| `Task_plazaId_status_dueDate_idx` | `("plazaId", "status", "dueDate")` |
| `Task_departmentId_status_dueDate_idx` | `("departmentId", "status", "dueDate")` |
| `Task_scope_status_dueDate_idx` | `("scope", "status", "dueDate")` |
| `Task_categoryId_idx` | `("categoryId")` |
| `Task_dueDate_idx` | `("dueDate")` |
| `Task_status_idx` | `("status")` |
| `Task_createdById_idx` | `("createdById")` |
| `Task_completedById_idx` | `("completedById")` |
| `Task_updatedAt_idx` | `("updatedAt")` |

**Constraints:** `Task_scope_kind_check` (see [Constraints](#constraints)).

---

## TaskAssignee

The assignee set for a task. One row per person; the pair is the primary key,
so the same person cannot be assigned twice. Every assignee has equal rights and
visibility — there is no primary or secondary assignee.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `taskId` | `text` | no | — | PK part; FK → `Task.id` |
| `userId` | `text` | no | — | PK part; FK → `User.id` |
| `assignedById` | `text` | yes | — | FK → `User.id`; who added this person |
| `assignedAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | display order within a task |

**Relations:** `taskId` → `Task` (`Cascade`), `userId` → `User` (`Restrict`),
`assignedById` → `User` (`SET NULL`).
**Relations (in):** none.

**Indexes**

| Name | Definition |
|---|---|
| `TaskAssignee_pkey` | `PRIMARY KEY ("taskId", "userId")` |
| `TaskAssignee_userId_taskId_idx` | `("userId", "taskId")` |

**Constraints:** `TaskAssignee_taskId_fkey` → `Task(id)` `ON DELETE CASCADE`;
`TaskAssignee_userId_fkey` → `User(id)` `ON DELETE RESTRICT`;
`TaskAssignee_assignedById_fkey` → `User(id)` `ON DELETE SET NULL`.

The API replaces the whole set in one transaction
(`POST /api/tasks/:id/assign`), writing one `ASSIGNED` activity per added or
removed person. `GET /api/tasks?assigneeId=…` matches any row in this table.

---

## TaskActivity

Immutable, append-only task history. Comments are rows here with
`type = 'COMMENT'`; the feed and the task audit trail are the same stream.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `taskId` | `text` | no | — | FK → `Task.id` |
| `actorId` | `text` | no | — | FK → `User.id` |
| `type` | `"TaskActivityType"` | no | — | 11 values, see [Enums](#enums) |
| `fromStatus` | `"TaskStatus"` | yes | — | for `STATUS_CHANGED` |
| `toStatus` | `"TaskStatus"` | yes | — | for `STATUS_CHANGED` |
| `fromAssigneeId` | `text` | yes | — | FK → `User.id`; for `ASSIGNED` |
| `toAssigneeId` | `text` | yes | — | FK → `User.id`; for `ASSIGNED` |
| `text` | `text` | yes | — | comment body or note |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `taskId` → `Task` (`Cascade`), `actorId` → `User` (`Restrict`),
`fromAssigneeId` / `toAssigneeId` → `User` (`Restrict`).
**Relations (in):** `TaskAttachment.activityId` (`SET NULL`).

**Indexes**

| Name | Definition |
|---|---|
| `TaskActivity_pkey` | `PRIMARY KEY ("id")` |
| `TaskActivity_taskId_createdAt_idx` | `("taskId", "createdAt")` |
| `TaskActivity_actorId_idx` | `("actorId")` |
| `TaskActivity_type_idx` | `("type")` |

No CHECK ties the columns to the `type`; a `COMMENT` row can technically carry
status transitions. There are no update or delete endpoints.

---

## TaskAttachment

File metadata. The bytes live outside the database.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `taskId` | `text` | no | — | FK → `Task.id` |
| `activityId` | `text` | yes | — | FK → `TaskActivity.id`; the activity that introduced the file |
| `uploadedById` | `text` | no | — | FK → `User.id` |
| `fileName` | `text` | no | — | original name shown to users |
| `storedName` | `text` | no | — | unique name on disk |
| `mimeType` | `text` | no | — | |
| `sizeBytes` | `integer` | no | — | |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `taskId` → `Task` (`Cascade`), `activityId` → `TaskActivity`
(`SET NULL`), `uploadedById` → `User` (`Restrict`).

**Indexes**

| Name | Definition |
|---|---|
| `TaskAttachment_pkey` | `PRIMARY KEY ("id")` |
| `TaskAttachment_storedName_key` | `UNIQUE ("storedName")` |
| `TaskAttachment_taskId_idx` | `("taskId")` |
| `TaskAttachment_activityId_idx` | `("activityId")` |

There is no `deletedAt`; deleting an attachment is permanent.

---

## TaskReopenRequest

Request/approval row for reopening a completed task.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `taskId` | `text` | no | — | FK → `Task.id` |
| `requestedById` | `text` | no | — | FK → `User.id` |
| `reviewedById` | `text` | yes | — | FK → `User.id`; set on approve/reject |
| `status` | `"ReopenRequestStatus"` | no | `'PENDING'` | `PENDING` / `APPROVED` / `REJECTED` / `CANCELLED` |
| `reason` | `text` | no | — | requester's justification |
| `reviewNote` | `text` | yes | — | reviewer's note |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `reviewedAt` | `timestamptz(3)` | yes | — | |

**Relations:** `taskId` → `Task` (`Cascade`), `requestedById` → `User`
(`Restrict`), `reviewedById` → `User` (`Restrict`).

**Indexes**

| Name | Definition |
|---|---|
| `TaskReopenRequest_pkey` | `PRIMARY KEY ("id")` |
| `TaskReopenRequest_taskId_status_idx` | `("taskId", "status")` |
| `TaskReopenRequest_requestedById_idx` | `("requestedById")` |
| `TaskReopenRequest_status_idx` | `("status")` |
| `TaskReopenRequest_taskId_pending_key` | `UNIQUE ("taskId") WHERE "status" = 'PENDING'` |

---

## AuditLog

Append-only master-data trail, one row per mutation, with JSON snapshots. Task
history is **not** here — it stays in `TaskActivity`.

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | `text` | no | `cuid()` | |
| `actorId` | `text` | no | — | FK → `User.id` |
| `entity` | `text` | no | — | logical table name, e.g. `Project`, `Plaza`, `User`, `TaskCategory`, `HeadOfficeMembership`, `ProjectAssignment`, `PlazaAssignment` |
| `entityId` | `text` | no | — | id of the affected row |
| `action` | `text` | no | — | `CREATE` / `UPDATE` / `ARCHIVE` / `GRANT` / `REVOKE` |
| `before` | `jsonb` | yes | — | pre-change snapshot |
| `after` | `jsonb` | yes | — | post-change snapshot |
| `createdAt` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |

**Relations:** `actorId` → `User` (`Restrict`). `entity`/`entityId` are
**not** a foreign key.

**Indexes**

| Name | Definition |
|---|---|
| `AuditLog_pkey` | `PRIMARY KEY ("id")` |
| `AuditLog_entity_entityId_createdAt_idx` | `("entity", "entityId", "createdAt")` |
| `AuditLog_actorId_createdAt_idx` | `("actorId", "createdAt")` |
| `AuditLog_createdAt_idx` | `("createdAt")` |

`entity` and `action` are unconstrained text; the vocabulary is enforced by the
writers only. User snapshots must never include `passwordHash`.

---

## Enums

| Enum | Values | Used by |
|---|---|---|
| `Round` | `ROUND_1`, `ROUND_2`, `ROUND_3`, `ROUND_4` | `Project.round` |
| `PlazaRole` | `TOLL`, `MAINTENANCE`, `CORRIDOR` | `PlazaAssignment.role` (PK part) |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED` | `Task.status`, `TaskActivity.fromStatus`, `TaskActivity.toStatus` |
| `TaskScopeKind` | `PROJECT`, `PLAZA`, `DEPARTMENT`, `HEAD_OFFICE` | `Task.scope` |
| `Priority` | `LOW`, `MEDIUM`, `HIGH` | `Task.priority` |
| `TaskActivityType` | `CREATED`, `COMMENT`, `ASSIGNED`, `STATUS_CHANGED`, `REOPEN_REQUESTED`, `REOPEN_APPROVED`, `REOPEN_REJECTED`, `REOPEN_CANCELLED`, `REOPENED`, `ATTACHMENT`, `UPDATED` | `TaskActivity.type` |
| `ReopenRequestStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | `TaskReopenRequest.status` |

`Priority` has exactly three values — there is no `URGENT`. `Round` is an enum,
so adding a round needs a migration.

A `CompanyRole` enum (`HEAD_OFFICE`) existed in the baseline and was dropped
with `CompanyAssignment` by `20261023000000_head_office_departments`.

---

## Constraints

### CHECK constraints

Currently there is **one** CHECK constraint in the database. It was added by
`20261029000002_scope_audit_locations`, replacing the two looser checks from
`20261027000000_head_office_task_scope`.

```sql
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_kind_check"
  CHECK (
    ("scope" = 'PROJECT'     AND "projectId" IS NOT NULL AND "plazaId" IS NULL     AND "departmentId" IS NULL) OR
    ("scope" = 'PLAZA'       AND "projectId" IS NOT NULL AND "plazaId" IS NOT NULL AND "departmentId" IS NULL) OR
    ("scope" = 'DEPARTMENT'  AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NOT NULL) OR
    ("scope" = 'HEAD_OFFICE' AND "projectId" IS NULL     AND "plazaId" IS NULL     AND "departmentId" IS NULL)
  );
```

Dropped and superseded (kept here for migration archaeology):

```sql
-- added 20261027000000, dropped 20261029000002
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_at_most_one"
  CHECK (NOT ("projectId" IS NOT NULL AND "departmentId" IS NOT NULL));

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_plaza_requires_project"
  CHECK ("plazaId" IS NULL OR "projectId" IS NOT NULL);
```

Not enforced: that `Task.plazaId` belongs to `Task.projectId`. The API checks
it; the database does not.

### Partial unique indexes

Prisma cannot express partial indexes, so these exist only in migration SQL.

```sql
-- 20261023000000_head_office_departments
CREATE UNIQUE INDEX "HeadOfficeMembership_userId_primary_key"
  ON "HeadOfficeMembership"("userId") WHERE "isPrimary";

-- 20261029000000_integrity (after de-duplicating existing primaries)
CREATE UNIQUE INDEX "ProjectAssignment_projectId_primary_key"
  ON "ProjectAssignment" ("projectId")
  WHERE "isPrimary";

CREATE UNIQUE INDEX "PlazaAssignment_plazaId_role_primary_key"
  ON "PlazaAssignment" ("plazaId", "role")
  WHERE "isPrimary";

-- 20261021000000_init
CREATE UNIQUE INDEX "TaskReopenRequest_taskId_pending_key"
  ON "TaskReopenRequest"("taskId") WHERE "status" = 'PENDING';
```

All four mean "at most one", not "exactly one". The API maintains the stronger
"exactly one" for the three `isPrimary` flags, inside a transaction on every
membership/assignment write.

### Functional unique index

```sql
-- 20261029000000_integrity
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower("email"));
```

`User_email_key` (`UNIQUE ("email")`) is still present alongside it, so both
exact-case and case-insensitive uniqueness are enforced. The migration
lowercased existing rows first.

### Unique composites and plain uniques

| Name | Table | Definition |
|---|---|---|
| `Project_companyId_name_key` | `Project` | `UNIQUE ("companyId", "name")` |
| `Plaza_projectId_name_key` | `Plaza` | `UNIQUE ("projectId", "name")` |
| `Company_name_key` / `Company_code_key` | `Company` | `UNIQUE ("name")`, `UNIQUE ("code")` |
| `Department_name_key` / `Department_code_key` | `Department` | `UNIQUE ("name")`, `UNIQUE ("code")` |
| `Office_name_key` | `Office` | `UNIQUE ("name")` |
| `TaskCategory_name_key` | `TaskCategory` | `UNIQUE ("name")` |
| `TaskAttachment_storedName_key` | `TaskAttachment` | `UNIQUE ("storedName")` |
| `User_email_key` | `User` | `UNIQUE ("email")` |

Uniqueness never includes `active`, so archived rows keep their names reserved.

### Foreign-key behaviour

Every FK is `ON UPDATE CASCADE`, which is what let the Phase 2 slug-id rewrite
re-point children. Delete behaviour by target:

| Target | Referencing columns | `ON DELETE` |
|---|---|---|
| `User` | `Task.createdById`, `Task.completedById`, `TaskAssignee.userId`, `TaskActivity.actorId`, `TaskActivity.fromAssigneeId`, `TaskActivity.toAssigneeId`, `TaskAttachment.uploadedById`, `TaskReopenRequest.requestedById`, `TaskReopenRequest.reviewedById`, `AuditLog.actorId` | `RESTRICT` |
| `User` | `TaskAssignee.assignedById`, `User.managerId` | `SET NULL` |
| `User` | `HeadOfficeMembership.userId`, `ProjectAssignment.userId`, `PlazaAssignment.userId` | `CASCADE` (grants vanish) |
| `Office` | `User.officeId` | `SET NULL` |
| `Company` | `Project.companyId` | `RESTRICT` |
| `Project` | `Plaza.projectId`, `Task.projectId` | `RESTRICT` |
| `Project` | `ProjectAssignment.projectId` | `CASCADE` |
| `Plaza` | `Task.plazaId` | `RESTRICT` |
| `Plaza` | `PlazaAssignment.plazaId` | `CASCADE` |
| `Department` | `Task.departmentId` | `RESTRICT` |
| `Department` | `HeadOfficeMembership.departmentId` | `CASCADE` |
| `TaskCategory` | `Task.categoryId` | `SET NULL` |
| `Task` | `TaskActivity.taskId`, `TaskAttachment.taskId`, `TaskReopenRequest.taskId`, `TaskAssignee.taskId` | `CASCADE` |
| `TaskActivity` | `TaskAttachment.activityId` | `SET NULL` |

Consequence: a user delete is blocked by any task/activity/audit reference, and
`HeadOfficeMembership`/`ProjectAssignment`/`PlazaAssignment` rows cascade
silently. This is why the policy is "deactivate, never delete".

---

## Migration history

Eight forward-only migrations. Order is the folder-name prefix. Dates in the
prefix are the authoring dates; the four baseline migrations were applied to the
dev database on **2026-10-29** during the rebuild, followed by the four
`20261029*` migrations on the same day
([`DATABASE-AUDIT.md` §9](./DATABASE-AUDIT.md)). Production status is not
recorded here.

| # | Migration | Date | Purpose |
|---|---|---|---|
| 1 | `20261021000000_init` | 2026-10-21 | Baseline: `Company`, `Project`, `Plaza`, `ProjectAssignment`, `PlazaAssignment`, `TaskCategory`, `Task`, `TaskActivity`, `TaskAttachment`, `TaskReopenRequest`, `CompanyAssignment`; enums `Round`, `PlazaRole`, `TaskStatus`, `Priority`, `TaskActivityType`, `ReopenRequestStatus`; the `TaskReopenRequest_taskId_pending_key` partial index |
| 2 | `20261023000000_head_office_departments` | 2026-10-23 | Adds `Department`, `Office`, `HeadOfficeMembership`, `User.officeId`; backfills former Head Office users into `dept_admin` / `office_delhi`; drops `CompanyAssignment` and `CompanyRole`; creates `HeadOfficeMembership_userId_primary_key`; keeps `_CompanyAssignment_backup` |
| 3 | `20261023000100_department_catalogue` | 2026-10-23 | Inserts the 18-department catalogue (`ON CONFLICT ("code") DO NOTHING`) for migrated-but-unseeded databases |
| 4 | `20261027000000_head_office_task_scope` | 2026-10-27 | Makes `Task.projectId` nullable, adds `Task.departmentId`, `User.title`, `Task_departmentId_fkey`; adds the two loose CHECKs `Task_scope_at_most_one` and `Task_plaza_requires_project` |
| 5 | `20261029000000_integrity` | 2026-10-29 | Phase 1: lowercases emails + `User_email_lower_key`; de-dupes `isPrimary` and adds the project/plaza partial unique indexes; converts all timestamps to `timestamptz(3)`; adds `Office.updatedAt`; index cleanup + composite indexes; makes every user FK `RESTRICT`; drops `_CompanyAssignment_backup` |
| 6 | `20261029000001_office_updated_at` | 2026-10-29 | Drops the temporary `DEFAULT CURRENT_TIMESTAMP` on `Office.updatedAt` so Prisma's `@updatedAt` owns it |
| 7 | `20261029000002_scope_audit_locations` | 2026-10-29 | Phase 2: `TaskScopeKind` + `Task.scope` backfill + `Task_scope_kind_check` (drops the two old CHECKs); drops `Plaza.state/piu/ro`; rewrites Company/Department/Office/TaskCategory ids to slug form; creates `AuditLog` |
| 8 | `20261029000003_task_assignees_and_reporting` | 2026-10-29 | Adds `TaskAssignee` (PK `taskId, userId`), backfills `Task.assigneeId` into it, then drops the column and its index; adds `User.managerId` self-FK + index |

Notes on ordering:

* Migration 2 creates the `HeadOfficeMembership_userId_primary_key` partial
  index **before** the backfill would violate it — the backfill inserts one
  `DISTINCT` row per user, so it holds.
* Migration 5 re-creates five user FKs as `RESTRICT`; before it, assignee /
  completer / reviewer references were `SET NULL`.* Migration 7 is the only one that changes primary-key values. It relies on
  `ON UPDATE CASCADE` and leaves cuids in place for generated rows.

---

## Conventions and gotchas

### cuid vs slug ids

* Generated rows use Prisma `cuid()`: `User`, `Project`, `Plaza`, `Task`,
  `TaskActivity`, `TaskAttachment`, `TaskReopenRequest`, `AuditLog`, and the
  three assignment tables. `cuid()` is **client-side**, so any raw SQL insert
  (including migrations) must supply an id explicitly.
* Reference/catalogue rows use stable slugs owned by `prisma/seed.ts`:
  `company_neppl`, `dept_fin`, `dept_hr-ld`, `office_delhi`,
  `cat_toll_operations`. Migration 7 rewrites these deterministically from
  `code` / `name`, so a seeded and a migrated database converge.
* Slug derivation is not uniform: departments/companies/offices collapse
  non-alphanumerics to `-`, categories collapse them to `_`. `HR-LD` becomes
  `dept_hr-ld`; `Toll Operations` becomes `cat_toll_operations`.
* Validation uses `idSchema` = `z.string().min(1).max(64)`; do not reintroduce
  `.cuid()` for reference ids.

### timestamptz(3)

All audit timestamps are `TIMESTAMPTZ(3)`. Before migration 5 they were
`TIMESTAMP(3)` (no zone). Comparisons and rendering go through `lib/dates.ts`
and `APP_TIME_ZONE`; do not use `setHours` on a `Date` for "overdue".

### Date-only `dueDate`

`Task.dueDate` is `DATE`. It carries no time and no zone, so it must not be
compared with `now()` directly. Everything else that looks like a date
(`completedAt`, `reviewedAt`, `assignedAt`) is a `timestamptz(3)`.

### `updatedAt` has no database default

`createdAt` defaults to `CURRENT_TIMESTAMP`; `updatedAt` does not. Prisma's
`@updatedAt` writes it from the client. A raw SQL `UPDATE` will leave
`updatedAt` stale unless it sets the column. `Office` is the one table where a
temporary default existed and was deliberately removed.

### Cascade vs restrict

* `Restrict` protects history and people: users, companies, projects, plazas,
  departments and tasks cannot be deleted while referenced.
* `Cascade` is limited to *grants* and *task children*: assignment rows,
  memberships, activities, attachments and reopen requests.
* `SetNull` is limited to optional metadata links: `User.officeId`,
  `Task.categoryId`, `TaskAttachment.activityId`.
* Because `Task.assigneeId`, `completedById`, activity assignees and
  `TaskReopenRequest.reviewedById` are all `Restrict`, a user delete will fail
  as soon as they appear in any history.

### JSON snapshots

`AuditLog.before` / `after` are `JSONB`, nullable, and hold whole-row
snapshots. They are written by `lib/audit.ts` in the same transaction as the
change. `before` is null on create/grant, `after` is null on revoke. User
snapshots omit `passwordHash` and use `passwordChanged: true` instead.
`entity` and `action` are text, not enums, so a typo is a silent data-quality
bug.

### `Task.scope` vs nullable columns

The three location columns are nullable because one task can only have one
scope, but the discriminator — not the null pattern — is authoritative. Always
read `scope`; never infer it from `projectId`/`departmentId`. The CHECK keeps
the two representations in sync, and `Task_scope_status_dueDate_idx` is the
index the list queries use. Adding a new scope kind means a new enum value and
a new branch in `Task_scope_kind_check`, not just a nullable column.

### Names stay reserved

No unique index includes `active`, so archiving a company/project/plaza/
department/office/category keeps its name or code taken. Rename the archived
row before reusing the name.
