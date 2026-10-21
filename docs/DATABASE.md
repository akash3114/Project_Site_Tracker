# Database Design — Project Site Tracker

Source of truth: `prisma/schema.prisma` (PostgreSQL 16).
Hierarchy: **Company → Project → Plaza**, with access granted by assignment:
`CompanyAssignment (HEAD_OFFICE)` / `ProjectAssignment (Project Manager)` /
`PlazaAssignment (TOLL | MAINTENANCE | CORRIDOR)`.

There is no account-level role column. `User.isAdmin` is the only account flag;
everything else is derived from the assignment rows a person holds. Projects and
plazas have no lifecycle status — only `active` (soft archive).

## Diagram

```mermaid
erDiagram
    companies ||--o{ projects : "owns"
    companies ||--o{ company_assignments : "head office"
    projects ||--o{ plazas : "contains"
    projects ||--o{ project_assignments : "team"
    projects ||--o{ tasks : "scopes"
    plazas ||--o{ plaza_assignments : "team"
    plazas ||--o{ tasks : "optional scope"
    users ||--o{ company_assignments : "HEAD_OFFICE"
    users ||--o{ project_assignments : "project manager"
    users ||--o{ plaza_assignments : "Toll/Maint/Corridor"
    users ||--o{ tasks : "assignee"
    users ||--o{ tasks : "creator"
    tasks ||--o{ task_activities : "append-only feed"
    tasks ||--o{ task_attachments : "files"
    tasks ||--o{ task_reopen_requests : "reopen workflow"
    task_activities ||--o{ task_attachments : "optional link"

    users {
        string id PK
        string name
        string email UK "login"
        string phone "nullable"
        string passwordHash
        boolean isAdmin "platform admin flag"
        boolean active
    }
    companies {
        string id PK
        string name UK
        string code UK "NHIT-E / NHIT-S / NHIT-W"
        boolean active
    }
    projects {
        string id PK
        string companyId FK
        string name "UK per company"
        string acronym "nullable, display/search only"
        Round round "ROUND_1..ROUND_4"
        string state "nullable free text"
        float lengthKm "nullable"
        string piu "nullable free text"
        string ro "nullable free text"
        boolean active "soft archive only"
    }
    plazas {
        string id PK
        string projectId FK
        string name "UK per project"
        string state "nullable free text"
        float lengthKm "nullable"
        string piu "nullable"
        string ro "nullable"
        boolean active "soft archive only"
    }
    company_assignments {
        string companyId FK_PK
        string userId FK_PK
        CompanyRole role "HEAD_OFFICE"
        string assignedById "nullable"
        datetime assignedAt
    }
    project_assignments {
        string projectId FK_PK
        string userId FK_PK
        boolean isPrimary "one primary PM per project"
        string assignedById "nullable"
        datetime assignedAt
    }
    plaza_assignments {
        string plazaId FK_PK
        string userId FK_PK
        PlazaRole role "TOLL | MAINTENANCE | CORRIDOR (PK includes role)"
        boolean isPrimary "one primary per plaza+role"
        string assignedById "nullable"
        datetime assignedAt
    }
    task_categories {
        string id PK
        string name UK
        boolean active
    }
    tasks {
        string id PK
        string projectId FK "required"
        string plazaId FK "nullable = project-level task"
        string categoryId FK "nullable"
        string title
        string description "nullable"
        TaskStatus status
        Priority priority "LOW | MEDIUM | HIGH"
        string assigneeId "nullable"
        string createdById FK
        date dueDate "nullable"
        datetime completedAt "nullable"
        string completedById "nullable"
    }
    task_activities {
        string id PK
        string taskId FK
        string actorId FK
        TaskActivityType type
        TaskStatus fromStatus "nullable"
        TaskStatus toStatus "nullable"
        string fromAssigneeId "nullable"
        string toAssigneeId "nullable"
        string text "nullable"
        datetime createdAt
    }
    task_attachments {
        string id PK
        string taskId FK
        string activityId FK "nullable"
        string uploadedById FK
        string fileName
        string storedName UK
        string mimeType
        int sizeBytes
        datetime createdAt
    }
    task_reopen_requests {
        string id PK
        string taskId FK
        string requestedById FK
        string reviewedById "nullable"
        ReopenRequestStatus status
        string reason
        string reviewNote "nullable"
        datetime createdAt
        datetime reviewedAt "nullable"
    }
```

## Models

### People and companies

* **User** — login identity (`email` unique), display name, optional phone,
  bcrypt `passwordHash`, `isAdmin`, `active`. Deactivating sets `active=false`;
  users are never deleted, so task history keeps its actor/assignee joins.
* **Company** — `name` and `code` are unique; `active` soft-archives.
* **CompanyAssignment** — `@@id([companyId, userId])`; grants Head Office
  visibility over every project in that company. `role` is always
  `CompanyRole.HEAD_OFFICE`, so the company is the access scope.
* **Project** — belongs to exactly one company (`onDelete: Restrict`).
  `@@unique([companyId, name])` makes the name canonical within a company.
  `acronym` is nullable, non-unique, indexed, and used for display/search only —
  the same acronym can appear on different projects, and continuation projects
  may have none. `active=false` means archived; projects are never completed
  and have no separate lifecycle status.
* **ProjectAssignment** — `@@id([projectId, userId])`; a project manager sees
  every plaza and task in that project. `isPrimary` marks the lead PM (one per
  project by convention; not a DB constraint).
* **Plaza** — belongs to one project; `@@unique([projectId, name])`. Location
  fields (`state`, `piu`, `ro`, `lengthKm`) are nullable free text/numeric on the
  plaza. `active=false` archives it.
* **PlazaAssignment** — `@@id([plazaId, userId, role])`; a person can hold
  several job titles on the same plaza and several plazas at once.
  `isPrimary` marks the lead for each `plazaId + role` by convention.

### Task domain

* **TaskCategory** — admin-managed lookup (`name` unique, `active`). Tasks keep
  `categoryId` nullable; deleting a category sets it to `null` (`SetNull`).
* **Task** — `projectId` is **required**; `plazaId` is nullable. A task with
  `plazaId = null` is a **project-level** task. `status` starts at `TODO`;
  `assigneeId` is optional; `dueDate` is a date; `completedAt` / `completedById`
  record completion. Deleting a project/plaza with tasks is blocked
  (`onDelete: Restrict`) — archive instead.
* **TaskActivity** — immutable, append-only history and comments in one stream.
  A comment is simply `type = COMMENT` with `text`. Rows record the actor,
  optional status transition (`fromStatus` → `toStatus`), optional assignee
  transition (`fromAssigneeId` → `toAssigneeId`), free text, and `createdAt`.
  There are no update/delete endpoints for activities; the audit page is
  read-only.
* **TaskAttachment** — file metadata (`fileName`, unique `storedName`,
  `mimeType`, `sizeBytes`) linked to its task and optionally to the activity
  that introduced it. Deleting a task cascades its attachments; deleting an
  activity sets `activityId` to `null` but keeps the file.
* **TaskReopenRequest** — one row per reopen request with `reason`, reviewer,
  `reviewNote`, and `status`. A **partial unique index** allows at most one
  pending request per task:

  ```sql
  CREATE UNIQUE INDEX "TaskReopenRequest_taskId_pending_key"
    ON "TaskReopenRequest"("taskId") WHERE "status" = 'PENDING';
  ```

## Enums

| Enum | Values |
|---|---|
| `CompanyRole` | `HEAD_OFFICE` |
| `PlazaRole` | `TOLL`, `MAINTENANCE`, `CORRIDOR` |
| `Round` | `ROUND_1`, `ROUND_2`, `ROUND_3`, `ROUND_4` |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED` |
| `Priority` | `LOW`, `MEDIUM`, `HIGH` (three values only) |
| `TaskActivityType` | `CREATED`, `COMMENT`, `ASSIGNED`, `STATUS_CHANGED`, `REOPEN_REQUESTED`, `REOPEN_APPROVED`, `REOPEN_REJECTED`, `REOPEN_CANCELLED`, `REOPENED`, `ATTACHMENT`, `UPDATED` |
| `ReopenRequestStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |

## Integrity and deletion rules

| Rule | Enforced by |
|---|---|
| Company deletion is blocked while projects exist | `Project.company` → `onDelete: Restrict` |
| Project deletion is blocked while plazas or tasks exist | `Plaza.project`, `Task.project` → `Restrict` |
| Plaza deletion is blocked while tasks exist | `Task.plaza` → `Restrict` |
| Assignments vanish with their user/company/project/plaza | assignment relations → `Cascade` |
| Task history/attachments/reopen rows vanish only with the task | `Task` children → `Cascade` |
| Deleting a category keeps tasks | `Task.category` → `SetNull` |
| One pending reopen request per task | partial unique index shown above |
| Project names unique per company; plaza names unique per project | `@@unique([companyId, name])`, `@@unique([projectId, name])` |
| Archived, not completed | `Project.active` / `Plaza.active` booleans only |
| No account role column | access derived from `isAdmin` + assignment rows |

## Access rules

### Visibility

| Scope | Admin | Head Office | Project Manager | Site Manager |
|---|---|---|---|---|
| Companies | all | all | via visible projects | via visible plazas |
| Projects | all | all | assigned projects | projects with an assigned plaza |
| Plazas | all | all | all plazas in assigned projects | assigned plazas only |
| Tasks | all | all | all tasks in assigned projects (incl. project-level) | tasks in assigned plazas + project-level tasks assigned to them |

* Head Office is company-scoped by assignment but the helper currently grants
  Admin/HO visibility across every company.
* A site manager assigned a **project-level task** can read/act on that task even
  without a plaza on that project, but the project/plaza pages still require a
  project or plaza assignment (`requireProjectAccess` / `requirePlazaAccess`).
* `GET /api/projects`, `/api/plazas` and `/api/tasks` all apply the same
  `accessibleProjectIds` / `accessiblePlazaIds` / `taskScopeWhere` scope.

### Effective role

For any task, role precedence is **Admin > Head Office > Project Manager >
Site Manager** (`effectiveTaskRole`):

1. `User.isAdmin` → `ADMIN`.
2. `CompanyAssignment` on the task's project company → `HEAD_OFFICE`.
3. `ProjectAssignment` on the task's project → `PROJECT_MANAGER`.
4. `PlazaAssignment` on the task's plaza → `SITE_MANAGER`.
5. No plaza on the task and `assigneeId === user.id` → `SITE_MANAGER` (the
   project-level fallback).

The derived display role for navigation uses `isAdmin ? ADMIN :
companyAssignment ? HEAD_OFFICE : PROJECT_MANAGER`; site managers roll up to the
Project Manager shell and get their job titles from plaza assignments.

### Capabilities

| Action | Admin | Head Office | Project Manager | Site Manager |
|---|---|---|---|---|
| Manage companies/categories/users, deactivate users | yes | no | no | no |
| Create/edit/archive projects and plazas | yes | yes | no | no |
| Manage company/project/plaza assignments | yes | yes | no | no |
| Create tasks | any scope | any scope | assigned projects (project or plaza scope) | assigned plazas only (plaza scope) |
| Edit task core fields | any task | any task | tasks in assigned projects | only tasks they created |
| Change status / comment / attach | any task | any task | assigned projects | assigned plazas + assigned project-level tasks |
| View audit trail | yes | yes | no | no |
| Delete a project | yes | no | no | no |
| Reopen a completed task directly | yes | yes | no | no |
| Request reopen | — | — | yes (completed tasks they can see) | yes (completed tasks they can see) |
| Approve/reject reopen | yes | yes | no | no |

### Assignment ceiling

`canAssignTo` / `assigneeCandidates` cap who a user may assign:

| Actor role | May assign |
|---|---|
| Admin / Head Office | any active user |
| Project Manager | Admin, Head Office, project managers, or site managers in that project |
| Site Manager | the project manager or site managers on the same plaza — never Admin/Head Office |

Assignees must be active. Completed tasks lock assignment changes
(`taskPermissions.canAssign` is false).

### Completed-task lock and reopen workflow

1. Moving a task to `COMPLETED` sets `completedAt`/`completedById`.
2. While completed, core edits return **423**, status changes and assignment are
   disabled; comments/attachments remain allowed.
3. A Project Manager or Site Manager submits `{ reason }` to
   `POST /api/tasks/:id/reopen`. This creates a `PENDING`
   `TaskReopenRequest` (blocked by the partial unique index if one already
   exists) and a `REOPEN_REQUESTED` activity.
4. Admin/Head Office `POST` `{ requestId, decision: "APPROVE" | "REJECT", note? }`:
   * **APPROVE** → request `APPROVED`, task returns to `IN_PROGRESS`,
     completion fields cleared, `REOPEN_APPROVED` activity.
   * **REJECT** → request `REJECTED`, task stays `COMPLETED`,
     `REOPEN_REJECTED` activity.
5. The requester (or an Admin) may cancel a pending request
   (`DELETE /api/tasks/:id/reopen?requestId=…`), which marks it `CANCELLED` and
   logs `REOPEN_CANCELLED`.
6. Admin/Head Office may skip the request entirely: posting `{ reason }` reopens
   directly and logs `REOPENED`.

## Seed and master data

Source pipeline:

```
docs/master-data.md
  → scripts/parse-master-data.mjs
  → prisma/master-data.ts (typed MASTER_COMPANIES)
  → prisma/seed.ts
```

Fresh seed profile (`SEED_RESET=1` wipes in FK-safe order first):

* **3 companies**: `NHIT-E`, `NHIT-S`, `NHIT-W`.
* **28 projects**, **46 plazas** (plaza lengths come from the bracket values in
  the master data; project `lengthKm`/`piu`/`ro` stay blank because plaza
  brackets are authoritative).
* **92 field users** from PM / Toll / Maintenance / Corridor names, plus
  **Admin** and **Head Office** accounts (94 users total).
* **6 task categories** and **41 demo tasks**: 35 plaza tasks + 6 project-level
  tasks (`plazaId = null`), with 16 `TODO`, 10 `IN_PROGRESS`, 5 `BLOCKED`, and
  10 `COMPLETED`; `priority` cycles through `MEDIUM`, `HIGH`, `LOW`. Seeded
  activities include `CREATED`, `ASSIGNED`, `STATUS_CHANGED`, and comments, plus
  one `PENDING` reopen request on a completed task so the approval flow is
  visible immediately.
* Head Office is assigned `HEAD_OFFICE` on all three companies; PM/site access
  comes from generated project and plaza assignments.

### Logins

| Account | Email | Password |
|---|---|---|
| Admin | `admin@tracker.local` | `Admin@123` |
| Head Office | `management@tracker.local` (override: `SEED_MANAGEMENT_EMAIL`) | `Manage@123` (override: `SEED_MANAGEMENT_PASSWORD`) |
| Field users | slugified name `@tracker.local` (duplicates get `.2`, `.3`, …) | `Tracker@123` |

Field logins are generated from the person's name, e.g.
`K Bala Subramaniyam` → `k.bala.subramaniyam@tracker.local`. Email uniqueness is
enforced by `User_email_key`; the seed resolves collisions with a numeric
suffix. All passwords are bcrypt hashes (cost 12) and should be rotated after
the pilot import.
