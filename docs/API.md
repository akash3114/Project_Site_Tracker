# API Reference — Project Site Tracker

JSON API served by Next.js route handlers under `app/api/**`. Every endpoint
except `/api/auth/*` and `/api/health` requires an authenticated session cookie.

* Who may call what: [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md)
* Flow diagrams: [`SEQUENCES.md`](./SEQUENCES.md)
* Data shapes: [`ERD.md`](./ERD.md), [`SCHEMA.md`](./SCHEMA.md)

---

## 1. Conventions

| Topic | Convention |
|---|---|
| Base URL | Same origin as the app (e.g. `https://tracker.internal`) |
| Content type | `application/json` except attachment upload (`multipart/form-data`) |
| Auth | Auth.js session cookie (`authjs.session-token` / `__Secure-authjs.session-token`) |
| Request body | JSON; parsed with `req.json().catch(() => null)` so malformed JSON becomes a validation error |
| Success envelope | Resource object or array; task lists use `{ items, total, page, pageSize }` |
| Error envelope | `{ "error": "message" }`; validation adds `"issues": <Zod flattened errors>` |
| Validation | Zod `safeParse` in every write handler |
| Ids | Opaque strings, 1–64 characters; never assume cuid format |
| Dates | Request `dueDate` is `YYYY-MM-DD`; responses are ISO timestamps (dates at UTC midnight) |
| Pagination | Only `GET /api/tasks` paginates |
| CSRF | Auth.js protects its own endpoints; JSON routes rely on same-origin cookies and send no CORS headers |
| Rate limiting | Login only: 5 attempts / 60 s per email, in memory |

### Status codes used

| Code | Meaning in this API |
|---|---|
| `200` | Read or update succeeded |
| `201` | Resource created |
| `400` | Malformed body or failed validation |
| `401` | No session, or the session's user is missing/inactive |
| `403` | Authenticated but not allowed |
| `404` | Referenced resource does not exist (or is not visible) |
| `409` | Conflict: duplicate name/code, pending reopen already exists, request no longer pending |
| `413` | Attachment larger than 10 MB |
| `415` | Attachment MIME type not allowed |
| `422` | Semantically invalid: illegal transition, inactive category/department, plaza/project mismatch, any assignee outside the ceiling, reporting-line self/cycle |
| `423` | Locked: task is completed |

`requireProjectAccess`, `requirePlazaAccess` and `requireTaskAccess` throw a
`Response`; handlers return it unchanged, which is why a hidden resource can
surface as `403` or `404` depending on the helper.

---

## 2. Endpoint index

### Auth and health

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET`, `POST` | `/api/auth/[...nextauth]` | Public | Auth.js handlers (CSRF, callback, session, sign-out) |
| `GET` | `/api/health` | Public | Liveness: `{ ok: true, time }`; does not ping the DB |

### Session and users

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/users/me` | Any session | Current identity and display role |
| `GET` | `/api/users` | Admin, HO | User directory with assignment ids, reporting line (`managerId`, `managerName`) and derived role |
| `POST` | `/api/users` | Admin | Create a user, optionally with a `managerId` |
| `PATCH` | `/api/users/:id` | Admin | Update profile, admin flag, active flag, password, reporting line |

### Dashboard and history

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/dashboard` | Any session | Scoped KPI/round/company/Head Office aggregates |
| `GET` | `/api/events` | Admin, HO | Task activity feed, newest first |
| `GET` | `/api/audit` | Admin, HO | Master-data audit log, newest first |

### Companies

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/companies` | Any session | Visible companies with project counts |
| `POST` | `/api/companies` | Admin | Create a company |
| `PATCH` | `/api/companies/:id` | Admin | Update/archive a company |

### Projects

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/projects` | Any session | Visible projects with task stats |
| `POST` | `/api/projects` | Admin, HO | Create a project |
| `GET` | `/api/projects/:id` | Anyone with project access | Project detail with stats |
| `PATCH` | `/api/projects/:id` | Admin, HO | Update/archive a project |

### Plazas

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/plazas` | Any session | Visible plazas with task stats; optional `projectId` |
| `POST` | `/api/plazas` | Admin, HO | Create a plaza |
| `GET` | `/api/plazas/:id` | Anyone with plaza access | Plaza detail with stats |
| `PATCH` | `/api/plazas/:id` | Admin, HO | Update/archive a plaza |

### Tasks

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/tasks` | Any session | Scoped, filtered, paginated task list |
| `POST` | `/api/tasks` | Depends on scope | Create one task or a batch |
| `GET` | `/api/tasks/:id` | Anyone with task access | Task detail with `assignees`, feed, permissions, `assigneeCandidates`, pending reopen |
| `PATCH` | `/api/tasks/:id` | Creator, PM, HO, Admin | Edit title, description, priority, category, due date |
| `POST` | `/api/tasks/:id/assign` | Anyone with an assignable scope role | Replace the assignee set |
| `POST` | `/api/tasks/:id/status` | Assignee, creator, manager above, PM, HO, Admin | Change status |
| `POST` | `/api/tasks/:id/comments` | Anyone with task access | Append a comment |
| `GET` | `/api/tasks/:id/attachments` | Anyone with task access | List attachments |
| `POST` | `/api/tasks/:id/attachments` | Anyone with task access | Upload an attachment |
| `GET` | `/api/tasks/:id/reopen` | Anyone with task access | Read the pending reopen request |
| `POST` | `/api/tasks/:id/reopen` | Depends on role | Request, approve, reject or directly reopen |
| `DELETE` | `/api/tasks/:id/reopen` | Requester or Admin | Cancel a pending request |

### Attachments

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/attachments/:id` | Anyone with access to the task | Stream the stored file |
| `DELETE` | `/api/attachments/:id` | Uploader or Admin | Delete the row and the file |

### Master data

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/categories` | Any session | Active categories (Admin also sees archived) |
| `POST` | `/api/categories` | Admin | Create a category |
| `PATCH` | `/api/categories/:id` | Admin | Rename/archive a category |
| `GET` | `/api/departments` | Admin, HO | Department catalogue with member/task stats |

### Access and assignments

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/assignees` | Anyone with scope access | Eligible assignees for a scope |
| `GET` | `/api/access` | Admin, HO | Plaza assignments by user or plaza |
| `PUT` | `/api/access` | Admin, HO | Replace one user's plaza roles |
| `GET` | `/api/project-assignments` | Admin, HO | Project-manager assignments |
| `POST` | `/api/project-assignments` | Admin, HO | Grant a project assignment |
| `DELETE` | `/api/project-assignments` | Admin, HO | Revoke a project assignment |
| `GET` | `/api/head-office-memberships` | Admin, HO | Department memberships |
| `POST` | `/api/head-office-memberships` | Admin, HO | Grant a department |
| `PUT` | `/api/head-office-memberships` | Admin, HO | Set/clear the primary department |
| `DELETE` | `/api/head-office-memberships` | Admin, HO | Revoke a department |

---

## 3. Endpoint details

### 3.1 Health

```http
GET /api/health
```

`200` → `{ "ok": true, "time": "2026-10-29T05:12:33.123Z" }`

Public. Does not touch the database. Caddy also answers `/healthz` with `200`
directly.

### 3.2 Current user

```http
GET /api/users/me
```

`200` → `{ id, email, name, role, isAdmin }` where `role` is `ADMIN`,
`HEAD_OFFICE` or `PROJECT_MANAGER`. `401` when the session exists but the user is
inactive or missing.

### 3.3 Users

**`GET /api/users`** — Admin or Head Office.

`200` → array of:

```json
{
  "id": "cuid",
  "name": "Asha Menon",
  "email": "asha@example.com",
  "phone": null,
  "title": "Toll Manager",
  "role": "PROJECT_MANAGER",
  "isAdmin": false,
  "active": true,
  "createdAt": "...",
  "updatedAt": "...",
  "headOfficeMemberships": [
    { "departmentId": "dept_ops", "code": "OPS", "name": "Operations", "isPrimary": true }
  ],
  "departmentName": "Operations",
  "departmentCode": "OPS",
  "officeName": "Delhi",
  "projectIds": ["proj_x"],
  "plazaIds": ["plaza_y"],
  "plazaRoles": [{ "plazaId": "plaza_y", "role": "TOLL" }],
  "managerId": "user_manager",
  "managerName": "Ravi Shah"
}
```

`managerId` / `managerName` describe the reporting line and are `null` when the
person reports to nobody. The reporting line is not an access grant: it adds no
project or plaza scope (see [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md#2-visibility)).

**`POST /api/users`** — Admin only.

```json
{
  "name": "Asha Menon",
  "email": "asha@example.com",
  "phone": "+91...",
  "title": "Toll Manager",
  "password": "min-6-chars",
  "isAdmin": false,
  "managerId": "user_manager"
}
```

`201` → created user (without `passwordHash`) plus `role` (`ADMIN` or
`PROJECT_MANAGER`; add a Head Office membership separately).
`409` when the email is already used. `422` when `managerId` names a missing or
inactive user. Writes `AuditLog` `User/CREATE` with `managerId` in the snapshot.

**`PATCH /api/users/:id`** — Admin only.

Any of `{ name?, phone?, title?, isAdmin?, active?, password?, managerId? }`.
`managerId` accepts an id or `null` (clear the link). `200` → updated user.
`404` if missing. `422` when the link would make the person their own manager or
close a cycle, or when the manager is missing/inactive; the body is
`{ "error": "A person cannot report to themselves" }`,
`{ "error": "That reporting line would create a cycle" }`,
`{ "error": "Manager not found" }` or `{ "error": "Manager is not active" }`.
`active: false` writes action `ARCHIVE`; a password change is recorded as
`passwordChanged: true` (never the hash).

Changing `managerId` changes only the reporting line. Scope grants
(`ProjectAssignment`, `PlazaAssignment`, `HeadOfficeMembership`) are separate
endpoints and are untouched.

### 3.4 Dashboard

```http
GET /api/dashboard
```

`200` →

```json
{
  "projectCount": 28,
  "plazaCount": 46,
  "companyCount": 3,
  "kpis": { "open": 0, "overdue": 0, "blocked": 0, "completedWeek": 0 },
  "statusCounts": { "TODO": 0, "IN_PROGRESS": 0, "BLOCKED": 0, "COMPLETED": 0 },
  "rounds": [{ "round": "ROUND_1", "projectCount": 0, "taskCounts": { "...": 0 } }],
  "companies": [{ "id": "...", "name": "...", "code": "NEPPL", "projectCount": 0, "taskCounts": {} }],
  "headOffice": {
    "departmentCount": 18,
    "memberCount": 20,
    "task": { "total": 0, "completed": 0, "blocked": 0, "overdue": 0 },
    "departments": []
  }
}
```

Every count is restricted to `taskScopeWhere(user)`.

### 3.5 Task activity feed

```http
GET /api/events?take=100
```

Admin or Head Office. `take` is clamped to 1–500 (default 100).

`200` → `{ "items": [ ...TaskActivity with actor, fromAssignee, toAssignee, task.project, task.plaza ] }`

### 3.6 Master-data audit

```http
GET /api/audit?entity=Project&entityId=proj_x&actorId=user_x&take=100
```

Admin or Head Office. All filters optional; `take` clamped to 1–500.

`200` → `{ "items": [ { id, actorId, actor, entity, entityId, action, before, after, createdAt } ] }`

`action` is one of `CREATE`, `UPDATE`, `ARCHIVE`, `GRANT`, `REVOKE` by
convention (the column is unconstrained text).

### 3.7 Companies

**`GET /api/companies`** — any session. `200` → array of
`{ id, name, code, active, projectCount }`. Project users only see companies
with at least one accessible project.

**`POST /api/companies`** — Admin.

```json
{ "name": "NHIT Eastern Projects Private Limited", "code": "NEPPL", "active": true }
```

`201` → company. `409` when name or code is taken. `AuditLog` `Company/CREATE`.

**`PATCH /api/companies/:id`** — Admin. Partial `{ name?, code?, active? }`.
`200` → company. `404` if missing. `active: false` → `ARCHIVE`.

### 3.8 Projects

**`GET /api/projects`** — any session. `200` → array of project summaries:

```json
{
  "id": "proj_x",
  "name": "Kachugaon-Kalijhar",
  "acronym": "KRK",
  "state": "Assam",
  "round": "ROUND_3",
  "active": true,
  "status": "ACTIVE",
  "company": { "id": "company_neppl", "name": "...", "code": "NEPPL" },
  "plazaCount": 3,
  "task": { "total": 0, "completed": 0, "blocked": 0, "overdue": 0 },
  "progressPct": 0
}
```

Ordered by company name, round, project name. Query parameters are ignored.

**`POST /api/projects`** — Admin or Head Office.

```json
{
  "companyId": "company_neppl",
  "name": "Kachugaon-Kalijhar",
  "acronym": "KRK",
  "round": "ROUND_3",
  "state": "Assam",
  "lengthKm": 62.6,
  "piu": "Guwahati",
  "ro": "RO Guwahati",
  "active": true
}
```

`201` → project with `company`. `404` if the company is missing.
`AuditLog` `Project/CREATE`.

**`GET /api/projects/:id`** — requires project access. `200` → detail with
`company`, `plazaCount`, `task` counts and `progressPct`. Includes a literal
`description: null` for legacy UI compatibility.

**`PATCH /api/projects/:id`** — Admin or Head Office. Partial body; changing
`companyId` is allowed if the company exists. `200` → project. `AuditLog`
`Project/UPDATE|ARCHIVE`.

### 3.9 Plazas

**`GET /api/plazas?projectId=`** — any session. `projectId` is optional but, when
present, `requireProjectAccess` runs.

`200` → array of:

```json
{
  "id": "plaza_y",
  "projectId": "proj_x",
  "project": { "id": "...", "name": "...", "acronym": "KRK",
               "company": { "id": "...", "name": "...", "code": "NEPPL" } },
  "name": "Patagaon",
  "lengthKm": 62.6,
  "active": true,
  "status": "ACTIVE",
  "task": { "total": 0, "completed": 0, "blocked": 0, "overdue": 0 },
  "progressPct": 0
}
```

**`POST /api/plazas`** — Admin or Head Office.

```json
{ "projectId": "proj_x", "name": "Patagaon", "lengthKm": 62.6, "active": true }
```

`201` → plaza with project/company. `404` if the project is missing.
`AuditLog` `Plaza/CREATE`.

**`GET /api/plazas/:id`** — requires plaza access. `200` → detail; `project`
includes `state`, `piu`, `ro` (the project is authoritative for location
metadata).

**`PATCH /api/plazas/:id`** — Admin or Head Office. Partial
`{ name?, lengthKm?, active? }`; `projectId` is not updatable. `AuditLog`
`Plaza/UPDATE|ARCHIVE`.

### 3.10 Tasks — list

```http
GET /api/tasks?plazaId=&projectId=&departmentId=&headOffice=true
             &status=TODO|IN_PROGRESS|BLOCKED|COMPLETED
             &priority=LOW|MEDIUM|HIGH
             &categoryId=&assigneeId=<id|me>
             &overdue=true&q=text&page=1&pageSize=50
```

| Parameter | Behaviour |
|---|---|
| `plazaId` | Requires plaza access; filters `plazaId` |
| `projectId` | Requires project access; filters `projectId` (project-level and plaza tasks) |
| `departmentId` | Admin/HO only; `403` otherwise; filters `departmentId` |
| `headOffice=true` | Admin/HO only; matches `scope` `DEPARTMENT` or `HEAD_OFFICE` |
| `status` | One of the four statuses; ignored if invalid |
| `priority` | One of the three priorities; ignored if invalid |
| `categoryId` | Exact match |
| `assigneeId` | Matches **any** assignment on the task; `me` resolves to the caller |
| `overdue=true` | `dueDate < today IST` and not `COMPLETED`; overrides `status` |
| `q` | Case-insensitive `title` contains, or any assignee name contains |
| `page` | ≥ 1, default 1 |
| `pageSize` | 1–100, default 50 |

`200` →

```json
{ "items": [ ...task with project, plaza, category, department, assignees, createdBy, completedBy ],
  "total": 47, "page": 1, "pageSize": 50 }
```

Each item carries `assignees: [{ id, name, assignedAt }]` ordered by
`assignedAt asc`; there is no singular `assignee` field. Every assignee is equal:
no primary, and `assigneeId` matches any of them.

Ordered by `updatedAt desc`. All results are intersected with
`taskScopeWhere(user)`, which includes tasks assigned to **or** created by
anyone below the caller in the reporting line, at any depth.

### 3.11 Tasks — create

**Single task**

```json
{
  "projectId": "proj_x",
  "plazaId": "plaza_y",
  "departmentId": null,
  "title": "Repair boom barrier",
  "description": "Optional, ≤ 5000 chars",
  "priority": "MEDIUM",
  "assigneeIds": ["user_z", "user_w"],
  "dueDate": "2026-11-05",
  "categoryId": "cat_toll_operations"
}
```

Rules:

* `title` 3–200; `priority` defaults to `MEDIUM`.
* At most one of project/plaza and department; project + department or
  plaza + department is `400`.
* A plaza without a project is resolved to the plaza's project.
* An empty scope means Head Office level.
* `departmentId` must reference an active department (`422` otherwise).
* `categoryId` must reference an active category (`422` otherwise).
* `assigneeIds` is an array capped at **20** entries, de-duplicated before use;
  each person must pass the assignment ceiling (`422` otherwise). Omit it or send
  `[]` to create an unassigned task.
* `assigneeId` (singular, string) is a **deprecated alias** for a single
  assignee, kept for one release. When both are sent, `assigneeIds` wins.

`201` → created task with `taskInclude` relations, including
`assignees: [{ id, name, assignedAt }]`. The transaction writes `CREATED` and
one `ASSIGNED` activity row per assignee.

**Batch**

```json
{
  "scopes": [
    { "projectId": "proj_x" },
    { "plazaId": "plaza_y" },
    { "departmentId": "dept_ops" }
  ],
  "title": "Quarterly safety walkthrough",
  "description": "...",
  "priority": "LOW",
  "assigneeIds": ["user_z"],
  "dueDate": "2026-11-30",
  "categoryId": "cat_safety"
}
```

`scopes` is 1–50, duplicates are rejected. `assigneeIds` follows the same rules
as the single-task body (max 20, de-duplicated, `assigneeId` deprecated alias)
and is applied to every created task. `201` → `{ "items": [...], "count": n }`.
Every scope is resolved and authorised before the transaction, so one failure
returns its error and writes nothing.

### 3.12 Tasks — detail

```http
GET /api/tasks/:id
```

`200` →

```json
{
  "task": { "...": "task with taskDetailInclude (assignees, activities, attachments, reopenRequests)" },
  "events": [ "...same activity rows, ascending" ],
  "permissions": {
    "canEdit": true,
    "canChangeStatus": true,
    "canAssign": true,
    "canReopenDirect": false,
    "canRequestReopen": false,
    "canApproveReopen": false,
    "canComment": true,
    "canUpload": true,
    "canAdminDelete": false
  },
  "assigneeCandidates": [ "...picker rows; [] when canAssign is false" ],
  "reopenRequest": { "...pending request or null" }
}
```

`task.assignees` is the current set: `[{ id, name, assignedAt }]`, ordered by
`assignedAt asc`. `assigneeCandidates` is the eligible picker list for the
task's scope — it is **not** the current assignee set, and it is `[]` unless
`permissions.canAssign` is true. It was previously called `assignees` at the top
level; that name now belongs to the task's assignee set.

`401`/`403`/`404` from `requireTaskAccess`.

### 3.13 Tasks — edit

```http
PATCH /api/tasks/:id
```

Body: any of `{ title?, description?, priority?, categoryId?, dueDate? }`.
`description` and `dueDate` accept `null`; `categoryId` accepts `null` to clear.
An empty change set is `400 Nothing to update`.

Responses: `200` updated task (detail include); `400`; `403`; `404`; `422`
inactive category; `423` when the task is completed. Writes an `UPDATED`
activity listing the changed fields.

### 3.14 Tasks — assign

```http
POST /api/tasks/:id/assign
{ "assigneeIds": ["user_z", "user_w"] }
```

Replace-set semantics: the array becomes the task's **entire** assignee set.
Anyone omitted is removed, anyone new is added, and `[]` clears every assignee.
The array is capped at **20** entries (`400` beyond that) and de-duplicated
before use.

The deprecated single-assignee form is still accepted for one release:

```http
POST /api/tasks/:id/assign
{ "assigneeId": "user_z" }
```

`assigneeId` (`string | null`) is treated as a one-element set, and `null`
clears the set. Sending neither `assigneeIds` nor `assigneeId` is `400`.

Responses: `200` → the updated task including
`assignees: [{ id, name, assignedAt }]`; `400`; `401`; `403` when the caller has
no assignable scope role; `404`; `422` when any id is outside the ceiling;
`423` when the task is completed.

Each added or removed person writes one `ASSIGNED` activity row
(`toAssigneeId` for an addition, `fromAssigneeId` for a removal). Unchanged
assignees write nothing. `Task.updatedAt` is touched, so the task moves to the
top of `updatedAt desc` lists.

### 3.15 Tasks — status

```http
POST /api/tasks/:id/status
{ "to": "IN_PROGRESS", "text": "Optional note" }
```

`200` → task. `400`; `401`; `403` when the caller may see the task but not move
it; `404`; `422` completed or illegal transition. Only an assignee, the creator,
a manager above them in the reporting line, or a Project Manager / Head Office /
Admin may change status; a same-plaza peer with no ownership claim gets `403`.
Completing sets `completedAt`/`completedById`; any other transition clears them.
Writes `STATUS_CHANGED`.

### 3.16 Tasks — comments

```http
POST /api/tasks/:id/comments
{ "text": "Optional if attachments supplied", "attachmentIds": ["att_1"] }
```

`text` ≤ 2000; up to 10 attachment ids. Each attachment must belong to the task
and be unlinked (`422` otherwise). `201` → the created `COMMENT` activity with
`actor` and `attachments`. Allowed on completed tasks.

### 3.17 Tasks — attachments

**`GET /api/tasks/:id/attachments`** → `200` array of attachment rows with
`uploadedBy`.

**`POST /api/tasks/:id/attachments`** — `multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `file` | Yes | JPG, PNG, WebP or PDF; ≤ 10 MB |
| `activityId` | No | Must belong to the task |
| `?silent=1` | No | Suppress the `ATTACHMENT` feed activity |

`201` → `{ id, taskId, activityId, uploadedById, fileName, storedName, mimeType, sizeBytes, createdAt }`.
Errors: `400 file is required`; `413`; `415`; `422` activity mismatch.

### 3.18 Tasks — reopen

**`GET /api/tasks/:id/reopen`** → `200 { request: <pending request | null> }`.

**`POST /api/tasks/:id/reopen`** has three shapes:

| Body | Behaviour | Success |
|---|---|---|
| `{ "reason": "..." }` as Admin/HO | Direct reopen to `IN_PROGRESS` | `200 { task, request: null }` |
| `{ "reason": "..." }` as PM/Site Manager | Creates a pending request | `201 { task: null, request }` |
| `{ "requestId", "decision": "APPROVE"\|"REJECT", "note"? }` as Admin/HO | Decides a pending request | `200` reviewed request |

`reason` 10–2000 characters. Errors: `400`; `401`; `403`; `404` (decision
request not found); `409` (already pending / no longer pending); `422` (task not
completed).

**`DELETE /api/tasks/:id/reopen?requestId=...`** — requester or Admin.
`200 { ok: true }`; `400` missing id; `403`; `404`; `409` not pending.

### 3.19 Attachments

**`GET /api/attachments/:id`** → binary stream with the stored MIME type,
`Content-Length`, `Content-Disposition: inline; filename="..."`,
`Cache-Control: private, max-age=60`. `404` when the row or file is missing.

**`DELETE /api/attachments/:id`** — uploader or Admin. `200 { ok: true }`;
`403`; `404`.

### 3.20 Categories

**`GET /api/categories`** → `200` array of `{ id, name, active, taskCount }`.
Non-admins see active rows only.

**`POST /api/categories`** — Admin. `{ "name": "...", "active": true }`.
`201`; `409` duplicate name; `AuditLog` `TaskCategory/CREATE`.

**`PATCH /api/categories/:id`** — Admin. Partial `{ name?, active? }`.
`200`; `404`; `409` duplicate name; `AuditLog` `TaskCategory/UPDATE|ARCHIVE`.

### 3.21 Departments

```http
GET /api/departments
```

Admin or Head Office. `200` → array of
`{ id, name, code, sortOrder, active, memberCount, open, progressPct, task: { total, completed, blocked, overdue } }`,
ordered by `sortOrder`, then name. Counts are restricted to the caller's task
scope.

### 3.22 Assignees

```http
GET /api/assignees?projectId=&plazaId=
GET /api/assignees?departmentId=
GET /api/assignees?headOffice=true
```

Returns the eligible picker rows for the requested scope, already filtered by
the assignment ceiling and enriched with `role`, `roleLabel`, `contextLabel`,
`tier`, `department`, `office`, `contexts` and a pre-computed `search` string.

* One of `projectId`, `departmentId` or `headOffice=true` is required (`400`).
* `plazaId` must belong to `projectId` (`422`).
* `requireProjectAccess` runs for project scopes; `actorScopeRole` must return a
  role (`403`).
* `departmentId` must exist (`404`).
* Site-manager callers never see Admin or Head Office accounts.

### 3.23 Plaza access

**`GET /api/access?userId=`** or **`?plazaId=`** — Admin or Head Office.
`200 { assignments: [ ...with user and plaza.project.company ] }`.

**`PUT /api/access`** — Admin or Head Office.

```json
{
  "userId": "user_x",
  "assignments": [
    { "plazaId": "plaza_y", "role": "TOLL", "isPrimary": true },
    { "plazaId": "plaza_z", "role": "CORRIDOR", "isPrimary": false }
  ]
}
```

Replace-all semantics; duplicates by `plazaId:role` are collapsed; maximum 500.
`200 { ok: true, count }`; `400`; `403`; `404`; `AuditLog`
`PlazaAssignment/UPDATE` with `entityId = userId`.

### 3.24 Project assignments

**`GET /api/project-assignments?userId=`** or **`?projectId=`** — Admin or Head
Office. `200 { assignments: [ ...with user and project.company ] }`.

**`POST /api/project-assignments`** — Admin or Head Office.
`{ projectId, userId, isPrimary? }`; upserts on `(projectId, userId)`.
`201`; `404` project or user; `AuditLog` `ProjectAssignment/GRANT`.

**`DELETE /api/project-assignments?projectId=&userId=`** — Admin or Head
Office. `200 { ok: true }`; `400` missing params; `AuditLog`
`ProjectAssignment/REVOKE`. Deleting a non-existent row is a no-op that still
writes the audit row.

### 3.25 Head Office memberships

**`GET /api/head-office-memberships?userId=&departmentId=`** — Admin or Head
Office. `200 { memberships: [ ...with user and department ] }`.

**`POST /api/head-office-memberships`** — Admin or Head Office.
`{ userId, departmentId, isPrimary? }`.

* The first membership for a user is always primary.
* A primary grant demotes the user's other primaries in the same transaction.
* Inactive department → `404 Department is inactive`.
* `201` → membership; `404` user/department; `AuditLog`
  `HeadOfficeMembership/GRANT`.

**`PUT /api/head-office-memberships`** — Admin or Head Office.
`{ userId, departmentId, isPrimary }`.

* Setting primary demotes the others.
* Clearing primary is refused (`400`) when it is the only membership; otherwise
  the remaining membership with the lowest department `sortOrder` is promoted.
* `200` → membership; `404`; `AuditLog` `HeadOfficeMembership/UPDATE`.

**`DELETE /api/head-office-memberships?userId=&departmentId=`** — Admin or Head
Office. Removing the last membership drops the user back to their project/plaza
assignments (or no access). Revoking a primary promotes the next membership.
`200 { ok: true }`; `400` missing params; `404`; `AuditLog`
`HeadOfficeMembership/REVOKE`.

---

## 4. Validation summary

| Field | Rule |
|---|---|
| Any id | `z.string().min(1).max(64)` |
| Company `name` | 2–150 |
| Company `code` | 1–20, required |
| Project `name` | 3–150 |
| Project `acronym` | ≤ 20, empty string → omitted |
| Project `round` | `ROUND_1` … `ROUND_4` |
| Project `state` / `piu` / `ro` | ≤ 100 / 150 / 150 |
| `lengthKm` | Coerced number, > 0, ≤ 100000 |
| Plaza `name` | 3–150 |
| User `name` | 2–100 |
| User `email` | Valid email; stored lower-case |
| User `phone` / `title` | ≤ 30 / ≤ 100 |
| User `managerId` | Id or `null`; must exist, be active, and must not be the user or close a cycle (`422`) |
| Password | ≥ 6 characters |
| Task `title` | 3–200 |
| Task `description` | ≤ 5000 |
| Task `assigneeIds` | ≤ 20 entries, de-duplicated (`assigneeId` deprecated alias) |
| Task `priority` | `LOW`, `MEDIUM`, `HIGH` (default `MEDIUM`) |
| `dueDate` | `YYYY-MM-DD` |
| Batch `scopes` | 1–50, no duplicate scope key |
| Comment `text` | ≤ 2000; text or attachments required |
| Comment `attachmentIds` | ≤ 10 |
| Reopen `reason` | 10–2000 |
| Reopen `note` | ≤ 2000 |
| Category `name` | 2–80 |
| Access `assignments` | ≤ 500 |
| Attachment | ≤ 10 MB; `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |

---

## 5. cURL examples

Auth.js owns the login flow, so a scripted session needs the CSRF token first.

```bash
# 1. Get a CSRF token and cookie jar
curl -s -c cookies.txt http://localhost:3000/api/auth/csrf

# 2. Sign in (replace the token and credentials)
curl -s -b cookies.txt -c cookies.txt \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "csrfToken=<token>&email=admin@tracker.local&password=Admin@123&json=true"

# 3. Confirm the session
curl -s -b cookies.txt http://localhost:3000/api/users/me
```

```bash
# Task list: first page, high priority, overdue
curl -s -b cookies.txt \
  "http://localhost:3000/api/tasks?priority=HIGH&overdue=true&page=1&pageSize=25"

# Create a plaza task
curl -s -b cookies.txt -X POST http://localhost:3000/api/tasks \
  -H "content-type: application/json" \
  -d '{"plazaId":"plaza_y","title":"Repair boom barrier","priority":"HIGH","dueDate":"2026-11-05"}'

# Move it to in progress
curl -s -b cookies.txt -X POST http://localhost:3000/api/tasks/<taskId>/status \
  -H "content-type: application/json" \
  -d '{"to":"IN_PROGRESS","text":"Crew on site"}'

# Read the master-data audit trail
curl -s -b cookies.txt \
  "http://localhost:3000/api/audit?entity=Project&take=20"
```

---

## 6. What is not present

The following do **not** exist. Do not design around them.

| Missing capability | Reality |
|---|---|
| Task deletion | No `DELETE /api/tasks/:id`. Tasks are closed with `COMPLETED` and reopened through the request workflow. |
| Activity edit/delete | `TaskActivity` is append-only; there is no update or delete endpoint. |
| Audit write endpoint | `AuditLog` is written only inside master-data transactions; `GET /api/audit` is read-only. |
| Comment edit/delete | Comments are activity rows; no mutation endpoint. |
| Public API / API keys | Every route except `/api/auth/*` and `/api/health` needs a session cookie. |
| Pagination on master data | Projects, plazas, companies, users, categories and departments return full lists. |
| Sorting controls | `/api/tasks` is fixed to `updatedAt desc`; other lists have fixed orders. |
| Full-text search | `q` matches task titles and assignee names only. |
| Bulk user import | Users are created one at a time through `POST /api/users` or the seed. |
| File replacement | An attachment is uploaded or deleted; there is no replace endpoint. |
| Email/notification endpoints | None. |
| OpenAPI/Swagger document | None; this file is the contract. |

---

## 7. Open questions

1. **List pagination** — `GET /api/projects` ignores `page`/`pageSize` even
   though `scripts/smoke-api.mjs` passes `?pageSize=100`. Behaviour is correct
   (full list) but the parameter is misleading.
2. **`GET /api/users` for Head Office** returns every user, including users the
   caller cannot otherwise see. This matches the admin console design but is
   broader than project visibility.
3. **`GET /api/plazas/:id`** reads the plaza before `requirePlazaAccess`, so a
   missing plaza returns `404` while an existing-but-forbidden plaza returns
   `403`. That distinction leaks existence; it is consistent with the rest of the
   API.
4. **`DELETE /api/project-assignments`** writes an audit row even when no
   assignment existed (`isPrimary` defaults to `false`).
5. **`POST /api/users`** returns `role: "PROJECT_MANAGER"` for a non-admin even
   if the new user has no assignments yet; the display role is derived, not
   stored.
