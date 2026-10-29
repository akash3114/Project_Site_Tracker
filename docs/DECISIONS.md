# Architecture Decisions — Project Site Tracker

Short records of the choices that shape the system, why they were made, and what
they cost. Dates are approximate where the decision predates this record; those
are marked **Accepted (inferred)** because they were reconstructed from the code
and migrations rather than from a written decision note.

* Runtime shape: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
* Access rules: [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md)
* Schema: [`ERD.md`](./ERD.md), [`SCHEMA.md`](./SCHEMA.md)

---

## Decision index

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](#adr-001-no-account-level-role-column) | No account-level role column; roles derive from assignments | Accepted (inferred) |
| [ADR-002](#adr-002-head-office-membership-is-global) | Head Office membership is global | Accepted (inferred) |
| [ADR-003](#adr-003-explicit-task-scope-discriminator) | Explicit `Task.scope` discriminator with a CHECK | Accepted |
| [ADR-004](#adr-004-project-is-the-source-of-truth-for-location) | Project is the source of truth for location metadata | Accepted |
| [ADR-005](#adr-005-stable-slug-ids-for-reference-rows) | Stable slug ids for reference rows | Accepted |
| [ADR-006](#adr-006-soft-archive-instead-of-delete) | Soft archive instead of delete | Accepted (inferred) |
| [ADR-007](#adr-007-task-history-is-taskactivity) | Task history is `TaskActivity` | Accepted |
| [ADR-008](#adr-008-separate-auditlog-for-master-data) | Separate `AuditLog` for master data | Accepted |
| [ADR-009](#adr-009-jwt-session-with-a-database-re-read) | JWT session with a database re-read | Accepted (inferred) |
| [ADR-010](#adr-010-ist-calendar-dates) | IST calendar dates | Accepted (inferred) |
| [ADR-011](#adr-011-forward-only-migrations) | Forward-only migrations | Accepted |
| [ADR-012](#adr-012-in-memory-rate-limiting-for-the-pilot) | In-memory rate limiting for the pilot | Accepted (inferred) |
| [ADR-013](#adr-013-local-filesystem-attachment-storage) | Local filesystem attachment storage | Accepted (inferred) |
| [ADR-014](#adr-014-reopen-request-workflow) | Reopen request workflow for completed tasks | Accepted |
| [ADR-015](#adr-015-batch-task-creation-across-scopes) | Batch task creation across scopes | Accepted |

---

## ADR-001: No account-level role column

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

People work across several companies, projects and plazas. A single `User.role`
column cannot express "project manager for two NEPPL projects, corridor manager
for one NSPPL plaza, and a member of the Finance department at Head Office".
Changing scope would mean changing the account, and the account would drift from
the actual assignments.

### Decision

Do not store a role on `User`. Store only `isAdmin`. Derive every other
capability from assignment rows:

* `HeadOfficeMembership` → Head Office
* `ProjectAssignment` → Project Manager on that project
* `PlazaAssignment` → Site Manager on that plaza

The display role is the highest one held (Admin > Head Office > Project
Manager), computed per request in `getSessionUser`.

### Consequences

* Assignment changes take effect immediately without touching the account.
* A person can hold several roles at once; visibility is the union of their
  scopes.
* Every permission check must resolve assignments, so queries are slightly more
  expensive and the logic lives in one place (`lib/access.ts`).
* There is no single column to report on; role reporting is a join.

### Alternatives

* **`User.role` enum** — simple, but wrong for multi-scope people and would need
  a parallel assignment table anyway.
* **Per-company role rows** — closer, but still cannot express a global Head
  Office role or plaza-level job titles without another table.

---

## ADR-002: Head Office membership is global

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

Head Office departments (Finance, Operations, IT, Secretarial, …) serve all three
project companies. An earlier model scoped Head Office grants per company, which
forced duplicate rows and produced `403`s when a Finance user opened a task in a
company they had not been granted.

### Decision

A `HeadOfficeMembership` is a global grant. Any membership makes the user Head
Office, with access to every company, project and task. The department is
identity, display metadata and a task location — never a visibility boundary.

### Consequences

* One row per department is enough; no duplication per company.
* Cross-company work (Treasury, Secretarial) behaves as users expect.
* Department membership cannot be used to restrict a Head Office user to one
  department's tasks. If that is ever required, it needs a new explicit rule.
* The assignee picker still uses department membership to decide who is
  associated with a department-scoped task.

### Alternatives

* **Company-scoped HO rows** — the model this replaced; duplicate rows and
  surprising denials.
* **Department-scoped visibility** — would require a second permission axis and
  was not how the organisation works.

---

## ADR-003: Explicit task scope discriminator

**Status:** Accepted
**Date:** 2026-10-29

### Context

A task can live at project level, at a plaza, in a Head Office department, or at
Head Office level with no location. Inferring the kind from which nullable
columns happened to be set made queries and permissions ambiguous: a row with
`projectId` and `departmentId` both set had no defined meaning, and "Head Office
level" was indistinguishable from "missing data".

### Decision

Store `Task.scope` (`PROJECT` | `PLAZA` | `DEPARTMENT` | `HEAD_OFFICE`) and
enforce the column combinations with `Task_scope_kind_check`:

```text
PROJECT      → projectId NOT NULL, plazaId NULL,     departmentId NULL
PLAZA        → projectId NOT NULL, plazaId NOT NULL, departmentId NULL
DEPARTMENT   → projectId NULL,     plazaId NULL,     departmentId NOT NULL
HEAD_OFFICE  → projectId NULL,     plazaId NULL,     departmentId NULL
```

`lib/task-scope.ts` is the shared contract; the API resolves a plaza to its
project before writing.

### Consequences

* Filters, permissions and the UI can branch on one field.
* Bad combinations are rejected by the database, not just by the API.
* The scope column must be kept in sync by every writer; raw SQL must set it.
* There is still no DB check that `Task.plaza.projectId = Task.projectId`; that
  remains an API invariant.

### Alternatives

* **Nullable columns only** — ambiguous and easy to corrupt.
* **Separate tables per scope** — strong typing, but duplicates task logic and
  complicates the feed and assignment queries.

---

## ADR-004: Project is the source of truth for location

**Status:** Accepted
**Date:** 2026-10-29

### Context

`Plaza` used to store `state`, `piu` and `ro` as well as the project. The same
project's plazas could disagree, and updating a project's region meant editing
every plaza. The audit recommended keeping location metadata in one place.

### Decision

Move `state`, `piu` and `ro` to `Project` only. `Plaza` keeps `name`,
`lengthKm`, `active` and `projectId`. Plaza detail responses read the location
from the parent project.

### Consequences

* One update changes the region for every plaza in the project.
* Plaza queries that need location must join the project.
* Existing data had to be migrated and the old columns dropped
  (`20261029000002_scope_audit_locations`).
* `Plaza.lengthKm` remains because it is a per-plaza measurement, not project
  metadata.

### Alternatives

* **Keep both** — guarantees drift.
* **Location on plaza only** — wrong unit; projects have a region before plazas
  exist.

---

## ADR-005: Stable slug ids for reference rows

**Status:** Accepted
**Date:** 2026-10 (inferred)

### Context

Catalogue rows (companies, departments, offices, categories) are referenced by
seed data, scripts, tests and documentation. Random cuids would differ per
environment, making fixtures and links unstable.

### Decision

Reference rows use stable slug ids: `company_neppl`, `dept_fin`, `office_delhi`,
`cat_toll_operations`. Generated rows (users, projects, plazas, tasks,
activities, attachments, reopen requests, audit rows) use `cuid()`.

The seed owns catalogue ids; migrations do not insert them.

### Consequences

* Every environment has the same catalogue ids, so docs and smoke tests can
  refer to them.
* Ids are still treated as opaque strings by validation (`idSchema`), so the
  format is not a contract.
* Renaming a catalogue row does not change its id; the slug may become stale.

### Alternatives

* **All cuids** — stable only within one database.
* **Natural keys as primary keys** — couples ids to names and makes renames
  painful.

---

## ADR-006: Soft archive instead of delete

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

Projects, plazas, departments, offices, categories and users are referenced by
historical tasks and audit rows. Deleting them would either cascade away history
or fail on foreign keys. Users in particular must remain attributable.

### Decision

Never delete master data or people. Retire rows with `active = false`. The UI
shows `ACTIVE`/`ARCHIVED`; lists keep archived rows visible. User deactivation
sets `active = false`, which blocks sign-in and existing sessions.

### Consequences

* History stays intact and attributable.
* Unique names/codes remain reserved while archived, so a replacement needs a
  different name or a reactivation.
* Archived projects/plazas still accept new tasks because access checks ignore
  `active`; archiving is presentation/state, not a hard block.
* Tables grow monotonically; this is acceptable at pilot scale.

### Alternatives

* **Hard delete with cascade** — destroys history.
* **Soft delete with `deletedAt`** — equivalent, but the codebase standardised on
  `active`.

---

## ADR-007: Task history is TaskActivity

**Status:** Accepted
**Date:** 2026-10 (inferred)

### Context

Users need a single chronological feed per task: creation, comments, assignment
changes, status changes, reopen events, attachments and field edits. Separate
comment and history tables would need merging in every view.

### Decision

Use one append-only `TaskActivity` table with a `type` enum, optional
`fromStatus`/`toStatus`, `fromAssigneeId`/`toAssigneeId`, `text` and optional
attachments. Comments are activity rows. The task detail response returns the
feed as `events`.

### Consequences

* One query renders the whole timeline.
* Comments and system events share ordering and permissions.
* The table is polymorphic in shape; there is no per-type CHECK, so a row can
  carry fields its type does not use.
* Editing or deleting a comment would mean mutating history, which is
  deliberately unsupported.

### Alternatives

* **Separate `Comment` table** — simpler comment CRUD, but two feeds to merge.
* **Event sourcing** — more rigorous, far more machinery than a pilot needs.

---

## ADR-008: Separate AuditLog for master data

**Status:** Accepted
**Date:** 2026-10-29

### Context

Task history answers "what happened on this task". It cannot answer "who changed
this project's region" or "who granted this Head Office membership". Those
changes are not tasks and have no task id.

### Decision

Add `AuditLog` for master-data mutations: one row per change with `entity`,
`entityId`, `action` (`CREATE`, `UPDATE`, `ARCHIVE`, `GRANT`, `REVOKE`),
`before`/`after` JSON snapshots and `actorId`. Write it inside the same
transaction as the change via `lib/audit.ts#logAudit`. Expose it read-only at
`GET /api/audit`.

### Consequences

* Two histories with different purposes, both append-only.
* A failed change rolls back its audit row too.
* Snapshots are whitelisted per entity; `User` never includes `passwordHash`.
* `entity` and `action` are unconstrained text, so the vocabulary is enforced
  only by writers.

### Alternatives

* **Reuse `TaskActivity`** — wrong shape; no task to attach to.
* **Database triggers** — captures everything, but cannot record the acting user
  or a clean before/after without session plumbing.

---

## ADR-009: JWT session with a database re-read

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

The edge middleware needs a cheap way to reject unauthenticated requests, but
authorisation depends on assignments that change during the day. Trusting a
long-lived token for roles would let revoked access persist until expiry.

### Decision

Use Auth.js JWT sessions. The token carries `id` and `isAdmin` only. Middleware
decodes it to gate requests. Every page and route handler calls
`getSessionUser()`, which re-reads `active`, `isAdmin`, office and Head Office
memberships from PostgreSQL.

### Consequences

* Revocation is immediate: deactivation or assignment removal applies on the
  next request.
* One extra user query per request; acceptable at pilot scale.
* The edge gate and the server can disagree (valid JWT, inactive user); the
  server wins and returns `401`.
* No session revocation list; a stolen cookie remains valid until expiry unless
  the user is deactivated.

### Alternatives

* **Database sessions** — revocable, but every edge request would need a DB
  round-trip or a different gate.
* **Trust the JWT** — fast, but stale roles and no immediate deactivation.

---

## ADR-010: IST calendar dates

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

`Task.dueDate` is a PostgreSQL `date`, which Prisma returns as a `Date` at UTC
midnight. The business day is India Standard Time. Using the server's local
timezone would make "today" and "overdue" flip at the wrong moment, especially
on a UTC host.

### Decision

Compute all day boundaries in `Asia/Kolkata` and represent a calendar day as UTC
midnight. `lib/dates.ts` owns `todayIst`, `startOfWeekIst`, `isOverdue`,
`daysFromToday` and `utcDay`. Due dates are written as
`new Date("YYYY-MM-DDT00:00:00Z")`.

### Consequences

* Overdue is consistent regardless of host timezone.
* Date-only values round-trip safely through Prisma.
* Any new date logic must go through `lib/dates.ts`; ad-hoc `new Date()` compares
  will drift.
* Timestamps (`createdAt`, `updatedAt`, `completedAt`) remain true instants and
  are formatted in IST for display.

### Alternatives

* **Store timestamps for due dates** — introduces time-of-day semantics the
  business does not use.
* **Server-local time** — breaks on UTC containers and during DST changes
  elsewhere.

---

## ADR-011: Forward-only migrations

**Status:** Accepted
**Date:** 2026-10 (inferred)

### Context

The pilot runs one production database with real work. Down migrations are
rarely tested and can lose data. Prisma records a checksum for every applied
migration.

### Decision

Migrations are forward-only. Never edit an applied migration. Fix mistakes with
a new migration, or restore a backup. `prisma migrate deploy` runs in the
one-shot `migrate` Compose service before the app starts. `prisma migrate diff`
is used to prove the schema and migration history agree.

### Consequences

* A predictable, auditable history.
* No one-command rollback; recovery is restore or forward-fix.
* Destructive changes need an explicit data plan before deployment.
* The production migration state must be verified, not assumed (the audit noted
  this).

### Alternatives

* **Down migrations** — more code, rarely exercised, easy to get wrong.
* **`db push`** — no history, unacceptable for a shared database.

---

## ADR-012: In-memory rate limiting for the pilot

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

The login endpoint needs basic brute-force protection. The pilot runs a single
app container, and adding Redis or a shared store would add an operational
dependency for one feature.

### Decision

Use a small in-memory sliding window in `lib/rate-limit.ts`: 5 attempts per 60
seconds per email. It is called from the Credentials `authorize` function.

### Consequences

* No extra infrastructure.
* State resets on restart and is not shared across replicas.
* The key is the email, so one attacker can lock out a known account for a
  minute (a mild denial-of-service vector).
* Acceptable only while the app is a single instance.

### Alternatives

* **Redis-backed limiter** — correct for multiple replicas, extra service.
* **Database-backed counter** — durable, but adds a write per login attempt.
* **Proxy-level limiting (Caddy)** — coarse; cannot key by email.

---

## ADR-013: Local filesystem attachment storage

**Status:** Accepted (inferred)
**Date:** 2026-10 (inferred)

### Context

Users attach site photos and PDFs to tasks and comments. The pilot has no object
storage and runs on one VM. A database blob column would bloat backups and the
Prisma payload.

### Decision

Store files on the local filesystem under `process.env.UPLOAD_DIR` (default
`<cwd>/uploads`) with a UUID filename. Keep metadata in `TaskAttachment`
(`fileName`, `storedName`, `mimeType`, `sizeBytes`). Enforce 10 MB and
JPG/PNG/WebP/PDF. Stream downloads through an authenticated route.

### Consequences

* Simple, fast and cheap.
* **Files are not covered by `pg_dump`**, and `compose.yml` mounts no volume, so
  attachments are lost when the app container is recreated.
* A DB restore can bring back rows whose files are gone.
* Horizontal scaling would require shared storage.
* No virus scanning or image processing.

### Alternatives

* **Database bytea** — backed up with the DB, but large and slow.
* **S3-compatible object storage** — the right long-term answer; needs
  credentials and network access the pilot does not have.

**Follow-up required:** mount `UPLOAD_DIR` as a volume and include it in backups
(see [`OPERATIONS.md` §7](./OPERATIONS.md#7-backup-and-restore)).

---

## ADR-014: Reopen request workflow

**Status:** Accepted
**Date:** 2026-10 (inferred)

### Context

Completed tasks must stay closed for audit integrity, but work does get reopened
when a site issue recurs. Letting anyone flip a completed task back to
`IN_PROGRESS` would make completion meaningless.

### Decision

Completed tasks are locked. Project and site managers submit a
`TaskReopenRequest` with a reason; Admin or Head Office approve or reject it.
Admin/HO can also reopen directly. Only one `PENDING` request per task is
allowed, enforced by a partial unique index and a route check. Every step writes
a `TaskActivity`.

### Consequences

* Completion is a controlled state, not a toggle.
* Reopening has an attributable reason and reviewer.
* An extra table and a small state machine to maintain.
* Approving moves the task to `IN_PROGRESS`, not back to its previous status.

### Alternatives

* **Free status toggle** — simple, destroys the meaning of completion.
* **Admin-only reopen** — safe, but pushes routine work through a bottleneck.

---

## ADR-015: Batch task creation across scopes

**Status:** Accepted
**Date:** 2026-10 (inferred)

### Context

The same instruction often applies to several plazas, projects or departments
("complete the safety walkthrough everywhere in this round"). Creating them one
by one is slow and error-prone.

### Decision

`POST /api/tasks` accepts either a single scope or `{ scopes: [...] }` (1–50).
Every scope is resolved and authorised **before** the transaction opens; the
transaction then creates one task plus its activities per scope. Duplicate scope
keys are rejected.

### Consequences

* One request creates a consistent set of tasks.
* All-or-nothing: one bad or forbidden scope writes nothing.
* The same title, priority, due date, category and assignee apply to every task;
  per-scope overrides are not supported.
* A batch of 50 is 50 task writes plus up to 100 activity writes in one
  transaction.

### Alternatives

* **Client-side loop** — many requests, partial success, harder to reason about.
* **Recurring task templates** — more powerful, out of scope for the pilot.
