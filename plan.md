# Project Site Tracker — Detailed Build Plan (Pilot)

## 1. Overview

**Purpose:** Single web app to track toll plaza site work across multiple projects in one glance.

**Pilot scale:**
- 3 Projects
- 26–30 Toll Plaza sites combined (~9–10 per project)
- 25–30 users (login per person, mapped to sites)
- Devices: laptops + tablets, responsive web only, no native app, no offline v1

**Core workflows:**
1. Admin creates Projects, Plazas, Users, and maps Users ↔ Plazas.
2. Admin / Project Lead assigns Tasks to persons.
3. Site Manager / Engineer creates Tasks within allowed plazas, updates status, adds comments.
4. Anyone with access marks Tasks complete. Reopen restricted.
5. No Task deletion ever. Full audit timeline per Task.
6. Owner views global dashboard: all projects + tasks at a glance.

**Reference hierarchy (locked):**
```
Project -> Plaza Site -> Task -> Activity Feed (Progress Updates + Comments) + Single Assignee
```

---

## 2. Goals / Non-Goals

### Goals (Pilot v1)
- [ ] Email + password auth per person
- [ ] Role-based access scoped by plaza mapping
- [ ] Project / Plaza masters (Admin only)
- [ ] Task CRUD minus Delete (create, view, edit meta, status flow, assign)
- [ ] Unified immutable Activity Feed per task (status changes + comments + assignments)
- [ ] Progress % derived from status (no manual % input)
- [ ] Dashboards: Global → Project → Plaza → Task drawer + My Tasks
- [ ] Filters: project, plaza, status, assignee, priority, overdue, search
- [ ] Docker Compose deploy on internal Linux VM with internet
- [ ] Backup + restore documented

### Non-Goals (deferred to v2)
- Photo / document attachments on tasks
- Notifications (email / WhatsApp / push)
- Manual % complete, subtasks, multi-assignee
- Offline PWA / native mobile
- Reports / Excel export, Gantt, Kanban drag-drop polish
- OTP / SSO / AD integration

---

## 3. Tech Stack (Option A — Locked)

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14+ App Router, TypeScript | Monolith UI+API, single Docker deploy, shadcn-native |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Tablet-friendly, fast build, accessible |
| Forms / Validation | react-hook-form + zod | Shared client/server validation |
| Data / Tables | TanStack Table (shadcn DataTable) | Filtering, sorting, pagination for 1000s of tasks |
| ORM | Prisma | Typed queries, migrations |
| DB | PostgreSQL 16 Alpine (Docker) | Relational integrity, RLS not needed (enforce in app) |
| Auth | Auth.js v5 (NextAuth) Credentials provider + bcryptjs | Email/password, session in DB or JWT |
| Deployment | Docker Compose: `app (Next.js standalone) + db + caddy` | One-command VM deploy, TLS via Caddy |
| Backups | `pg_dump` cron + Docker volume | Simple, reliable for pilot |

**Repo layout:**
```
/app
  /(auth)/login/page.tsx
  /(app)/page.tsx                    # Global dashboard
  /(app)/projects/[id]/page.tsx      # Project → plazas
  /(app)/plazas/[id]/page.tsx        # Plaza → tasks
  /(app)/my-tasks/page.tsx
  /(app)/admin/...                   # users, projects, plazas, access
  /api/...                           # route handlers
/components/ui/*                     # shadcn
/lib/{auth,db,utils,validations}.ts
/prisma/{schema.prisma,seed.ts,migrations}
/docker/{Dockerfile,compose.yml,Caddyfile}
```

---

## 4. Data Model

### 4.1 ERD (text)

```
users 1──* user_plaza_access *──1 plazas *──1 projects
users 1──* tasks.assignee_id
users 1──* tasks.created_by
plazas 1──* tasks 1──* task_events
users 1──* task_events.actor_id
```

### 4.2 Tables

**users**
- `id: cuid PK`
- `name: varchar(100) not null`
- `email: citext unique not null`
- `password_hash: text not null (bcrypt 12)`
- `role: enum('admin','project_lead','site_user') default 'site_user'`
- `active: boolean default true`
- `created_at, updated_at: timestamptz`
- Indexes: `email unique`, `role`, `active`

**projects**
- `id: cuid PK`
- `name: varchar(150) unique not null` (e.g. "Package-3: NH-48")
- `description: text nullable`
- `status: enum('active','on_hold','completed') default 'active'`
- `created_by FK users, created_at, updated_at`
- Index: `status`

**plazas**
- `id: cuid PK`
- `project_id FK projects ON DELETE RESTRICT not null`
- `name: varchar(150) not null` (e.g. "Karjan Toll Plaza")
- `chainage: varchar(50) nullable` (e.g. "KM 123+450")
- `highway: varchar(50) nullable` (e.g. "NH-48")
- `location: varchar(150) nullable`
- `status: enum('active','on_hold','completed') default 'active'`
- `created_at, updated_at`
- Unique: `(project_id, name)`
- Indexes: `project_id`, `status`

**user_plaza_access** (site mapping)
- `user_id FK users ON DELETE CASCADE`
- `plaza_id FK plazas ON DELETE CASCADE`
- `granted_by FK users nullable, granted_at`
- PK: `(user_id, plaza_id)`
- Indexes: `user_id`, `plaza_id`

**tasks**
- `id: cuid PK`
- `plaza_id FK plazas ON DELETE RESTRICT not null`
- `title: varchar(200) not null`
- `description: text nullable`
- `status: enum('todo','in_progress','blocked','completed') default 'todo'`
- `priority: enum('low','medium','high','critical') default 'medium'`
- `assignee_id FK users nullable (SET NULL on user deactivate, never delete user row — set active=false)`
- `created_by FK users not null`
- `due_date: date nullable`
- `completed_at: timestamptz nullable`
- `created_at, updated_at`
- Indexes: `plaza_id`, `status`, `assignee_id`, `due_date`, `(plaza_id,status)`

**task_events** (append-only audit)
- `id: cuid PK`
- `task_id FK tasks ON DELETE RESTRICT not null`
- `actor_id FK users not null`
- `type: enum('created','status','assign','comment','reopen','meta') not null`
- `from_status: task status nullable`
- `to_status: task status nullable`
- `text: text nullable` (comment body or reason)
- `created_at timestamptz default now()`
- Indexes: `(task_id, created_at)`, `actor_id`
- **No UPDATE/DELETE grants in app code. No API routes for mutation/deletion.**

### 4.3 Prisma sketch

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(SITE_USER)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  accesses     UserPlazaAccess[]
  assignedTasks Task[]  @relation("Assignee")
  createdTasks  Task[]  @relation("Creator")
  events        TaskEvent[]
}
enum Role { ADMIN PROJECT_LEAD SITE_USER }

model Project {
  id        String   @id @default(cuid())
  name      String   @unique
  description String?
  status    MasterStatus @default(ACTIVE)
  plazas    Plaza[]
  createdById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
enum MasterStatus { ACTIVE ON_HOLD COMPLETED }

model Plaza {
  id        String @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Restrict)
  name      String
  chainage  String?
  highway   String?
  location  String?
  status    MasterStatus @default(ACTIVE)
  accesses  UserPlazaAccess[]
  tasks     Task[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([projectId, name])
  @@index([projectId])
}

model UserPlazaAccess {
  userId    String
  plazaId   String
  grantedById String?
  grantedAt DateTime @default(now())
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  plaza Plaza @relation(fields: [plazaId], references: [id], onDelete: Cascade)
  @@id([userId, plazaId])
}

model Task {
  id          String @id @default(cuid())
  plazaId     String
  plaza       Plaza @relation(fields: [plazaId], references: [id], onDelete: Restrict)
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority @default(MEDIUM)
  assigneeId  String?
  assignee    User? @relation("Assignee", fields: [assigneeId], references: [id])
  createdById String
  createdBy   User @relation("Creator", fields: [createdById], references: [id])
  dueDate     DateTime? @db.Date
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  events      TaskEvent[]
  @@index([plazaId, status])
  @@index([assigneeId])
  @@index([dueDate])
}
enum TaskStatus { TODO IN_PROGRESS BLOCKED COMPLETED }
enum Priority { LOW MEDIUM HIGH CRITICAL }

model TaskEvent {
  id         String @id @default(cuid())
  taskId     String
  task       Task @relation(fields: [taskId], references: [id], onDelete: Restrict)
  actorId    String
  actor      User @relation(fields: [actorId], references: [id])
  type       EventType
  fromStatus TaskStatus?
  toStatus   TaskStatus?
  text       String?
  createdAt  DateTime @default(now())
  @@index([taskId, createdAt])
}
enum EventType { CREATED STATUS ASSIGN COMMENT REOPEN META }
```

### 4.4 Derived progress + aggregates

- Task progress mapping (locked): `TODO=0%, IN_PROGRESS=50%, BLOCKED=<last non-blocked value, flagged>, COMPLETED=100%`
- Plaza % = `100 * completed_tasks / total_tasks` (0 if no tasks)
- Project % = aggregate across its plazas (same formula)
- Overdue = `due_date < today AND status != COMPLETED`
- Blocked count surfaced separately on cards (does not reduce % but flagged red)

---

## 5. Roles & Permissions Matrix (Locked)

| Action | Admin | Project Lead | Site User |
|---|---|---|---|
| Manage users (create/deactivate, reset pw) | ✅ | ❌ | ❌ |
| Create/edit Projects, Plazas | ✅ | ❌ (view) | ❌ (view allowed only) |
| Grant/revoke User↔Plaza access | ✅ | ❌ (can request) | ❌ |
| View scope | All | Plazas in assigned projects* | Only `user_plaza_access` plazas |
| Create task | Any plaza | Allowed plazas | Allowed plazas |
| Edit title/desc/priority/due date | ✅ | Allowed plazas | Own visible, if not completed |
| Assign / reassign | ✅ any user | Allowed plazas, only users with access | ❌ |
| Status → in_progress/blocked/completed | ✅ | ✅ allowed | ✅ allowed |
| Comment | ✅ | ✅ allowed | ✅ allowed |
| Reopen completed | ✅ + Lead | ✅ | ❌ (request lead) |
| Delete task / event | ❌ Nobody | ❌ | ❌ |

*Project Lead scope: implement via `project_lead_projects(lead_id, project_id)` join OR by deriving from plaza accesses covering all plazas in project. Simpler for pilot: give Lead explicit plaza accesses to all plazas in their projects + `role=project_lead` unlocks assign/reopen. Document this.

**Enforcement:** middleware checks session → DB access check on every API (plazaId must be in caller's access set unless admin). Never rely on UI hiding alone. Deactivation = `active=false`, row retained for audit FKs.

---

## 6. UX / Pages (Tailwind + shadcn, tablet-first)

Global shell: sidebar (Dashboard, My Tasks, Projects, Admin if authorized) + topbar (search, user menu). Touch targets ≥44px, sticky filter bar, tables collapse to cards <768px.

### 6.1 `/login`
- shadcn Card + Form (email, password), zod validation, error toast, redirect to `/`.
- Seed admin on first boot (env `SEED_ADMIN_EMAIL/PASSWORD`).

### 6.2 `/` Global Dashboard
- 3 Project cards: name, status badge, Plaza count, Task counts (open/blocked/overdue), progress bar, updated-ago.
- Global KPI row: Total Open, Overdue (red), Blocked (amber), Completed this week.
- Filters: project multi-select, status, priority. Search box (task title/plaza).
- Table: Overdue + Blocked spotlight (top 20).

### 6.3 `/projects/[id]`
- Header: project meta + overall %.
- Plaza grid/table: each plaza row → name, chainage, open/blocked/overdue, % bar, link to plaza.
- Only plazas user can access are clickable; others hidden (site_user) or greyed (admin sees all).

### 6.4 `/plazas/[id]`
- Header: plaza meta + breadcrumb Project → Plaza.
- Toolbar: [New Task] + filters (status, assignee, priority, overdue-only, search) + view toggle Table/Board.
- Table columns: Status badge, Title, Assignee avatar, Priority, Due (red if overdue), Updated.
- Board: 4 columns Todo / In Progress / Blocked / Completed with counts (drag-drop deferred — use status dropdown in v1 to save time).
- Row click → Task drawer (sheet).

### 6.5 Task drawer (`/plazas/[id]?task=[taskId]` or Sheet)
- Title, description, badges, assignee select, priority select, due date picker, status stepper buttons.
- Complete button → confirm dialog → requires comment? (recommended: optional reason, logged).
- Activity Feed (chronological): system entries (created/assigned/status/reopen) styled muted + user comments styled as bubbles, with actor + timestamp. Comment composer at bottom.
- No Edit/Delete buttons for events. No Delete for task.

### 6.6 `/my-tasks`
- All tasks assigned to current user across allowed plazas, sorted overdue first, then due date.
- Same drawer for updates.

### 6.7 `/admin/*` (admin only, `project_lead` read-only where noted)
- `/admin/users`: table + invite/create, deactivate, reset password, role select.
- `/admin/projects` + `/admin/plazas`: CRUD masters.
- `/admin/access`: matrix picker (user rows × plaza columns or per-user multi-select with shadcn Combobox). Bulk assign by project.
- Audit view: recent `task_events` (read-only).

---

## 7. API Design (Next.js Route Handlers, JSON)

Auth: `POST /api/auth/[...nextauth]` (Auth.js). All `/api/*` require session; return 401/403 otherwise.

- `GET /api/health` → `{ok:true}` (for Docker + Caddy)
- `GET /api/projects` → scoped list with computed `{plazaCount, taskStats, progressPct}`
- `POST /api/projects` (admin) `{name, description?, status?}`
- `PATCH /api/projects/:id` (admin)
- `GET /api/plazas?projectId=` → scoped + stats
- `POST /api/plazas` (admin) `{projectId, name, chainage?, highway?, location?}`
- `PATCH /api/plazas/:id` (admin)
- `GET /api/tasks?plazaId=&status=&assigneeId=&overdue=&q=` → scoped, paginated (`page, pageSize`, default 50)
- `POST /api/tasks` `{plazaId, title, description?, priority?, assigneeId?, dueDate?}` → creates task + `CREATED` event in transaction
- `GET /api/tasks/:id` → task + plaza/project + events asc
- `PATCH /api/tasks/:id` `{title?, description?, priority?, dueDate?}` → logs `META` event (blocked if completed unless reopening)
- `POST /api/tasks/:id/status` `{to: todo|in_progress|blocked|completed, text?}` → validates transition, sets `completedAt`, logs `STATUS`
- `POST /api/tasks/:id/assign` `{assigneeId}` → validates assignee has plaza access, logs `ASSIGN`
- `POST /api/tasks/:id/reopen` `{text?}` (admin/lead) → `completed → in_progress`, logs `REOPEN`
- `POST /api/tasks/:id/comments` `{text}` → logs `COMMENT`
- `GET /api/users` (admin/lead scoped) + `POST /api/users` (admin) + `PATCH /api/users/:id` (deactivate/role/reset)
- `GET/PUT /api/access?userId=` (admin)

**Validation (zod shared):** title 3–200 chars, description ≤5000, dueDate optional ISO date, comment 1–2000 chars, assignee must have plaza access.

**Status transitions allowed:**
- `todo → in_progress | blocked | completed`
- `in_progress → blocked | completed | todo`
- `blocked → in_progress | todo | completed`
- `completed → in_progress` only via `/reopen` (admin/lead)
- All transitions log `fromStatus→toStatus`.

**No-delete guard:** no `DELETE` handlers for tasks/events; Prisma `onDelete: Restrict`; code review checklist item; add integration test asserting `DELETE /api/tasks/:id → 404/405`.

---

## 8. Non-Functional

- **Security:** bcrypt(12), Auth.js session, CSRF via Next.js, rate-limit login (5/min/IP), zod on all inputs, RBAC checks server-side, hide emails of others from site_user (show name only).
- **Audit:** every mutation in transaction writes `task_events`; `actor_id` from session; timestamps UTC, display IST.
- **Performance (pilot):** indexes above handle 10k tasks easily; paginate tables (50/page); dashboard aggregates via single `groupBy` per project (no N+1).
- **Accessibility / Tablet:** keyboard navigable, focus states, min contrast, 44px targets, no hover-only actions.
- **i18n/timezone:** English only, dates `dd-MMM-yyyy`, timezone Asia/Kolkata display.

---

## 9. Deployment (Internal VM + Internet)

**VM assumptions:** Ubuntu 22.04 LTS, 2 vCPU / 4GB RAM min, Docker + Compose plugin, DNS `tracker.internal` → VM IP, outbound internet for pulls.

**Compose (`docker/compose.yml`):**
- `db: postgres:16-alpine`, volume `pgdata`, healthcheck `pg_isready`, env `POSTGRES_PASSWORD` from `.env`
- `app: build Dockerfile (Next.js standalone)`, env `DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL`, depends_on healthy db, runs `prisma migrate deploy && node server.js`
- `caddy: caddy:2-alpine`, reverse_proxy `app:3000`, auto-TLS if public DNS else internal CA / self-signed + HTTP fallback documented

**Ops:**
- `.env` template + `SEED_ADMIN_*` for first boot
- Migrations: `prisma migrate deploy` on container start (no `db push` in prod)
- Backups: host cron `0 2 * * * docker exec tracker-db pg_dump -U tracker tracker | gzip > /backups/tracker-$(date +%F).sql.gz`, retain 14d, weekly copy off-VM. Restore doc tested once before UAT.
- Logs: `docker compose logs -f app`; health `GET /api/health` for uptime check.
- Updates: `git pull && docker compose up -d --build && prisma migrate deploy`.

---

## 10. Build Phases & Acceptance

### P0 — Scaffold (0.5–1 day)
- [ ] Next.js TS + Tailwind + shadcn init, ESLint/Prettier, `standalone` output
- [ ] Prisma + Postgres Docker dev, Auth.js credentials + bcrypt, middleware gating `/` + `/api`
- [ ] `/api/health`, Dockerfile + compose + Caddyfile skeleton
- **Done when:** `docker compose up` serves login page + health 200.

### P1 — Masters + Access (1–2 days)
- [ ] Schema migrate + seed (3 projects, ~30 plazas, demo users per role)
- [ ] Admin UI: users, projects, plazas, access matrix
- [ ] Access-scoping helper `requirePlazaAccess(session, plazaId)` + tests
- **Done when:** admin creates user, maps to 2 plazas; site_user sees only those 2.

### P2 — Tasks + Feed (2–3 days)
- [ ] Task APIs + validations + transaction→event logging
- [ ] Plaza task table + New Task dialog + Task drawer + comments + status stepper + assign
- [ ] No-delete test + completed-lock test
- **Done when:** engineer creates → assigns → progresses → completes with full timeline; delete route 404.

### P3 — Dashboard + My Tasks (1–2 days)
- [ ] Global/project aggregates, overdue/blocked spotlight, filters/search, my-tasks
- [ ] Progress bars, badges, empty states, skeletons
- **Done when:** with seed data, dashboard numbers match manual count; overdue highlights correct.

### P4 — Pilot Harden + Deploy (1–2 days)
- [ ] Rate limit, error toasts, audit view, seed real 3 projects / 30 plazas
- [ ] Backup/restore drill, VM deploy doc, UAT with 5 users, fix pass
- **Done when:** deployed on VM, 5 users log in, create/update 20+ real tasks, backup verified.

**Total estimate:** 6–10 working days solo, excl. UAT wait time.

---

## 11. Seed Data Plan

- 3 real Projects (names TBD from owner), ~10 Plazas each with chainage/highway.
- Users: 1 admin, 2 leads, ~25 site users mapped 1–3 plazas each.
- 30–50 sample tasks across statuses/priorities + comments to validate dashboard before go-live. Flag `seed=true` for easy cleanup (delete only seed tasks via direct DB script pre-pilot, then lock).

---

## 12. Risks & Decisions

| Risk | Mitigation |
|---|---|
| Assignee without plaza access | API rejects; UI filters assignee dropdown to plaza members |
| Blocked tasks skew % | Keep % formula simple; surface Blocked count prominently |
| Scope creep (photos/notifs) | Explicit v2 backlog; freeze v1 scope at P2 |
| VM TLS without public DNS | Caddy internal TLS + docs; fallback HTTP inside VPN with note |
| Forgotten admin password | `npm run reset-admin -- email=` script using bcrypt |

**Open items needing owner input before P1:** real Project/Plaza list (Excel), user list (name/email/role/plaza mapping), logo + title (e.g. "NHIIMPL Site Tracker").

---

## 13. v2 Backlog (not in pilot)

- Photo/docs upload (S3-compatible or VM volume + thumbnails)
- Notifications (email + WhatsApp on assign/overdue/blocked)
- Manual % + subtasks/checklist, multi-assignee
- Export CSV/Excel, weekly PDF summary
- Kanban drag-drop, Gantt, reminders
- OTP/SSO, audit export

---

## 14. Next Step

1. Owner provides Excel: Projects, Plazas (name/chainage/highway), Users (name/email/role/plazas).
2. Switch to Build agent → start P0 scaffold.
3. Review after P2 demo, then seed real data and deploy to VM.
