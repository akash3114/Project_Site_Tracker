# Project Site Tracker — TASKS.md (Pilot Build, Option A)

> SUPERSEDED by the v2 design in `docs/DATABASE.md` (roles ADMIN | MANAGEMENT | MANAGER,
> `project_assignments` / `plaza_assignments`, free-text state/piu/ro, round-required projects).
> Kept for build-phase history only — do not implement new work from this file.

> Stack: Next.js 14+ App Router + TS + Tailwind + shadcn/ui + Prisma + Postgres 16 + Auth.js v5 Credentials.
> Hierarchy: `Project -> Plaza -> Task -> TaskEvent(feed) + single assignee`. Progress derived from status.
> Dummy data: Section 0. No Excel — use dummy masters below for all seeding/dev.
> How to use: execute top-to-bottom. Do not skip `Depends on`. Each task lists Done criteria — task is complete only if all boxes pass.

---

## 0. Dummy Data Contract (SUPERSEDED — see prisma/nhit-data.ts)
> Real masters now come from `docs/NHIT Project List.xlsx` (parsed by `scripts/parse-nhit.py`):
> 28 projects / 46 plazas, with every manager imported as a real login (94 users total).
> Apply with SEED_RESET=1 + seed (full wipe, pre-pilot only).

### 0.1 Projects (3)
1. `P1 — NH-48 Gujarat Corridor` — `status: ACTIVE`, desc: "Pilot package: 10 plazas on NH-48"
2. `P2 — NH-27 Saurashtra Stretch` — `status: ACTIVE`
3. `P3 — NH-147 Ahmedabad Ring` — `status: ON_HOLD`

### 0.2 Plazas (28 total: 10+10+8)
- P1 (highway NH-48): `Karjan (KM 123+450)`, `Ankleshwar (KM 157+200)`, `Bharuch (KM 178+900)`, `Narmada (KM 192+300)`, `Surat-Kamrej (KM 215+600)`, `Navsari (KM 238+100)`, `Valsad (KM 256+800)`, `Vapi (KM 278+400)`, `Palsana (KM 205+000)`, `Olpad (KM 198+700)`
- P2 (highway NH-27): `Rajkot-Jetpur (KM 45+200)`, `Gondal (KM 62+800)`, `Dhoraji (KM 84+100)`, `Upleta (KM 98+500)`, `Junagadh Bypass (KM 112+300)`, `Keshod (KM 128+900)`, `Mangrol (KM 145+200)`, `Porbandar (KM 168+000)`, `Kutiyana (KM 152+400)`, `Ranavav (KM 160+700)`
- P3 (highway NH-147): `Sanand (KM 12+300)`, `Bavla (KM 28+600)`, `Dholka (KM 44+100)`, `Bagodara (KM 58+900)`, `Vataman (KM 71+200)`, `Fedara (KM 82+500)`, `Dhandhuka (KM 95+800)`, `Limbdi (KM 110+400)`

Each plaza: `location: "<Name>, Gujarat"`, `status: ACTIVE` except 2 in P3 `ON_HOLD`.

### 0.3 Users (27 total)
- Admin (1): `admin@tracker.local / Admin@123` — `ADMIN`, access: all plazas (via code, not join rows)
- Leads (3): `lead.p1@tracker.local`, `lead.p2@tracker.local`, `lead.p3@tracker.local / Lead@123` — `PROJECT_LEAD`, access: all plazas in own project
- Site users (23): `site01..site23@tracker.local / Site@123` — `SITE_USER`, access: 1–3 plazas each (round-robin, deterministic in seed — see T-010)
- All `active: true`. Passwords bcrypt(12) hashed in seed.

### 0.4 Sample tasks (40)
Distributed: 50% TODO, 25% IN_PROGRESS, 10% BLOCKED, 15% COMPLETED. Priorities mixed. Titles realistic: "Canopy bolt tightening LHS", "Toll booth UPS wiring", "Lane marking refresh", "CCTV pole alignment", "Drain desilting RHS", etc. `dueDate`: 10 overdue (past 7d), 15 due next 7d, rest null/future. 1–3 comments/events per task.

---

## Phase P0 — Scaffold

### T-001 Init Next.js + Tailwind + shadcn + lint
- **Depends on:** none
- **Description:** Create greenfield app in empty `Project_Site_Tracker/` with TS, App Router, Tailwind, shadcn, TanStack Table, RHF+zod.
- **Files:** `package.json`, `tsconfig.json`, `next.config.mjs` (`output:'standalone'`), `tailwind.config.ts`, `app/layout.tsx`, `components.json`, `components/ui/*`, `.eslintrc`, `.prettierrc`
- **Code signatures:**
  - `next.config.mjs` must export `output: 'standalone'`
  - `lib/utils.ts: export function cn(...inputs: ClassValue[]): string`
- **Verify:** `npm install && npm run dev` → http://localhost:3000 renders placeholder; `npm run lint` passes; `npx shadcn-ui@latest list` works.
- **Done when:** [ ] dev serves 200 [ ] shadcn Button renders [ ] standalone set [ ] lint clean

### T-002 Docker dev + prod skeletons
- **Depends on:** T-001
- **Description:** Local Postgres for dev + prod compose (app+db+caddy) + health endpoint.
- **Files:** `docker/Dockerfile`, `docker/compose.yml`, `docker/compose.dev.yml`, `docker/Caddyfile`, `app/api/health/route.ts`, `.dockerignore`, `.env.example`
- **Code signatures:**
  - `GET /api/health → Response.json({ ok: true, time: string }, {status:200})`
  - `Dockerfile`: multi-stage, `RUN npx prisma generate && npm run build`, `CMD ["node","server.js"]`
  - `compose.yml` services: `db (postgres:16-alpine, volume pgdata, healthcheck pg_isready)`, `app (depends_on db healthy)`, `caddy (reverse_proxy app:3000)`
- **Verify:** `docker compose -f docker/compose.dev.yml up -d db && npx prisma db push` works; `npm run dev` + `curl localhost:3000/api/health` → `{"ok":true}`; `docker build -f docker/Dockerfile .` succeeds.
- **Done when:** [ ] health 200 [ ] db connectable [ ] prod Dockerfile builds

### T-003 Prisma schema + migrations
- **Depends on:** T-002
- **Description:** Implement full schema from plan §4 (User, Project, Plaza, UserPlazaAccess, Task, TaskEvent + enums). No DELETE cascades except access join.
- **Files:** `prisma/schema.prisma`, `prisma/migrations/*`, `lib/db.ts`
- **Code signatures:**
  - `lib/db.ts: import { PrismaClient } from '@prisma/client'; export const db: PrismaClient (global singleton)`
  - Enums: `Role{ADMIN PROJECT_LEAD SITE_USER}`, `MasterStatus{ACTIVE ON_HOLD COMPLETED}`, `TaskStatus{TODO IN_PROGRESS BLOCKED COMPLETED}`, `Priority{LOW MEDIUM HIGH CRITICAL}`, `EventType{CREATED STATUS ASSIGN COMMENT REOPEN META}`
  - Relations as in plan; `Plaza @@unique([projectId,name])`; `TaskEvent @@index([taskId,createdAt])`
- **Verify:** `npx prisma validate` OK; `npx prisma migrate dev --name init` creates tables; `npx prisma studio` shows 6 tables; attempt `DELETE FROM tasks` with FK-protected plaza fails (Restrict).
- **Done when:** [ ] migrate applies clean [ ] studio shows relations [ ] Restrict enforced

### T-004 Auth.js email/password + middleware
- **Depends on:** T-003
- **Description:** Credentials login, bcrypt sessions, route gating, seed-admin script.
- **Files:** `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `lib/validations.ts (loginSchema)`, `app/(auth)/login/page.tsx`, `scripts/reset-admin.ts`
- **Code signatures:**
  - `loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) })`
  - `lib/auth.ts: export const { handlers, auth, signIn, signOut } = NextAuth({ providers:[Credentials({authorize: async ({email,password}) => User|null})], session:{strategy:'jwt'}, pages:{signIn:'/login'} })`
  - `middleware.ts: export default auth((req)=>{ if(!req.auth && !req.nextUrl.pathname.startsWith('/login')) redirect('/login') })`, `matcher: ['/((?!api/auth|api/health|_next|favicon).*)']`
  - `authorize()` must: find by email (lowercased), check `active`, `bcrypt.compare`, return `{id, email, name, role}` or null
- **Verify:** create temp user via studio → login succeeds → `/` reachable; wrong pw → "Invalid credentials" toast; logged-out `curl /api/projects` → 401; `npm run reset-admin -- admin@tracker.local` prints new hash.
- **Done when:** [ ] login/logout roundtrip [ ] wrong-pw rejected [ ] unauth API 401 [ ] inactive user blocked

### T-005 App shell + theme (tablet-first)
- **Depends on:** T-004
- **Description:** Authenticated layout: sidebar + topbar + toaster, responsive, IST date helper, status/priority badge components.
- **Files:** `app/(app)/layout.tsx`, `components/app-sidebar.tsx`, `components/topbar.tsx`, `components/status-badge.tsx`, `components/priority-badge.tsx`, `components/progress-bar.tsx`, `lib/format.ts`, `lib/progress.ts`
- **Code signatures:**
  - `lib/progress.ts: export const STATUS_PROGRESS: Record<TaskStatus, number> = { TODO:0, IN_PROGRESS:50, BLOCKED:-1, COMPLETED:100 }; export function taskProgress(status: TaskStatus, lastNonBlocked=50): number; export function plazaProgress(completed:number, total:number): number; export function isOverdue(dueDate: Date|null, status: TaskStatus, today=new Date()): boolean`
  - `lib/format.ts: export function fmtDateIST(d: Date|null): string // 'dd-MMM-yyyy'`
  - `status-badge.tsx: export function StatusBadge({status}:{status:TaskStatus})`
- **Verify:** login → sidebar shows Dashboard/My Tasks/Projects (+Admin if admin); resize to 768px → tables collapse, targets ≥44px; unit: `taskProgress('TODO')===0`, `isOverdue(yesterday,'TODO')===true`, `isOverdue(yesterday,'COMPLETED')===false`.
- **Done when:** [ ] shell renders per role [ ] badges/bars render [ ] helper unit checks pass

---

## Phase P1 — Masters, Access, Seed

### T-010 Seed: dummy projects/plazas/users/access/tasks
- **Depends on:** T-004
- **Description:** Deterministic seed implementing §0. Idempotent via upserts. Deletes only when `SEED_RESET=1` pre-pilot.
- **Files:** `prisma/seed.ts`, `package.json (prisma.seed)`
- **Code signatures:**
  - `async function main(): Promise<{projects:number; plazas:number; users:number; tasks:number}>`
  - `hashPw = (s:string)=>bcrypt.hash(s,12)`
  - Lead access: `createMany UserPlazaAccess where plaza.projectId == lead's project`
  - Site users: `site{i} → plazas[(i*3)%28, (i*3+1)%28]` (1–2 plazas), plus every 5th gets 3rd
  - Tasks: 40 with fixed titles array, `createdById=admin`, `assigneeId` round-robin among plaza members
- **Verify:** `npm run seed` → counts `{3,28,27,40}`; rerun → same counts (no dupes); login as `site05@tracker.local` → sees exactly its 2 plazas (check via `/api/plazas` length).
- **Done when:** [ ] counts exact [ ] idempotent [ ] per-user scoping correct

### T-011 Access helper + RBAC guards
- **Depends on:** T-010
- **Description:** Single source of truth for scoping. All APIs/UI use it.
- **Files:** `lib/access.ts`, `lib/access.test.ts`
- **Code signatures:**
  - `export async function getSessionUser(): Promise<{id:string; role:Role}|null>`
  - `export async function accessiblePlazaIds(userId:string, role:Role): Promise<string[]> // admin→all (query all ids), else join`
  - `export async function requirePlazaAccess(plazaId:string): Promise<{userId:string; role:Role}> // throws 401/403`
  - `export function canAssign(role:Role): boolean // admin|lead true`
  - `export function canReopen(role:Role): boolean // admin|lead true`
- **Verify:** `npm test lib/access.test.ts`: admin→28 ids; lead.p1→10 ids (P1 only); site05→2 ids; `requirePlazaAccess(unmapped)` throws 403; `canAssign(SITE_USER)===false`.
- **Done when:** [ ] 5 unit cases pass [ ] no API bypass possible (grep: every task/plaza route calls helper)

### T-012 Projects API + Admin Projects UI
- **Depends on:** T-011
- **Description:** Scoped list with stats + admin CRUD.
- **Files:** `app/api/projects/route.ts (GET,POST)`, `app/api/projects/[id]/route.ts (GET,PATCH)`, `lib/validations.ts (projectSchema)`, `app/(app)/admin/projects/page.tsx`, `components/project-form.tsx`
- **Code signatures:**
  - `projectSchema = z.object({ name: z.string().min(3).max(150), description: z.string().max(2000).optional(), status: z.enum(['ACTIVE','ON_HOLD','COMPLETED']).optional() })`
  - `GET /api/projects → { id, name, status, plazaCount, task:{total,completed,blocked,overdue}, progressPct }[]` (scoped: site_user only projects containing accessible plazas)
  - `POST/PATCH` guard: `role!=='ADMIN' → 403`
- **Verify:** as admin `curl POST` creates P-test → appears in GET; as site_user POST → 403; dashboard % matches `completed/total` manual SQL count.
- **Done when:** [ ] scoped stats correct [ ] admin CRUD works [ ] non-admin 403

### T-013 Plazas API + Admin Plazas UI
- **Depends on:** T-012
- **Description:** Same pattern per project.
- **Files:** `app/api/plazas/route.ts`, `app/api/plazas/[id]/route.ts`, `app/(app)/admin/plazas/page.tsx`
- **Code signatures:**
  - `plazaSchema = z.object({ projectId: z.string().cuid(), name: z.string().min(3).max(150), chainage: z.string().max(50).optional(), highway: z.string().max(50).optional(), location: z.string().max(150).optional(), status: ... })`
  - `GET /api/plazas?projectId= → scoped + {task stats, progressPct}`
  - Unique `(projectId,name)` → 409 on dup
- **Verify:** duplicate name in same project → 409; same name in different project → 201; site_user sees only mapped plazas.
- **Done when:** [ ] 409/201 cases pass [ ] scoping correct

### T-014 Users + Access matrix UI (admin)
- **Depends on:** T-011
- **Description:** User CRUD (no delete, deactivate only) + plaza mapping + password reset.
- **Files:** `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `app/api/access/route.ts (GET/PUT)`, `app/(app)/admin/users/page.tsx`, `app/(app)/admin/access/page.tsx`, `lib/validations.ts (userSchema)`
- **Code signatures:**
  - `userSchema = z.object({ name: z.string().min(2).max(100), email: z.string().email(), password: z.string().min(6), role: z.enum(['ADMIN','PROJECT_LEAD','SITE_USER']) })`
  - `PATCH /api/users/:id {active?, role?, password?}` (admin only; never DELETE)
  - `PUT /api/access { userId, plazaIds: string[] }` → transaction delete+insert, `grantedById=session`
  - Assignee deactivated → tasks keep row, `assignee` shown as "Deactivated"
- **Verify:** create `qa@tracker.local` → map to 2 plazas → login sees 2; deactivate → login 401 "inactive"; `DELETE /api/users/:id` → 404/405.
- **Done when:** [ ] create/map/deactivate/reset roundtrip [ ] no delete route exists (`grep -r "DELETE" app/api/users` empty)

---

## Phase P2 — Tasks + Activity Feed (core)

### T-020 Task validations + transition map
- **Depends on:** T-011
- **Description:** Shared zod + allowed transitions. No logic drift between client/server.
- **Files:** `lib/validations.ts (append)`, `lib/transitions.ts`, `lib/transitions.test.ts`
- **Code signatures:**
  - `createTaskSchema = z.object({ plazaId: z.string().cuid(), title: z.string().min(3).max(200), description: z.string().max(5000).optional(), priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).default('MEDIUM'), assigneeId: z.string().cuid().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })`
  - `statusSchema = z.object({ to: z.enum(['TODO','IN_PROGRESS','BLOCKED','COMPLETED']), text: z.string().max(2000).optional() })`
  - `commentSchema = z.object({ text: z.string().min(1).max(2000) })`
  - `ALLOWED: Record<TaskStatus, TaskStatus[]> = { TODO:['IN_PROGRESS','BLOCKED','COMPLETED'], IN_PROGRESS:['BLOCKED','COMPLETED','TODO'], BLOCKED:['IN_PROGRESS','TODO','COMPLETED'], COMPLETED:[] } // completed only via reopen`
  - `export function canTransition(from:TaskStatus, to:TaskStatus): boolean`
- **Verify:** `npm test`: `canTransition('COMPLETED','TODO')===false`, `('BLOCKED','COMPLETED')===true`; invalid title (2 chars) rejected; bad date rejected.
- **Done when:** [ ] unit tests green [ ] schemas imported by both API + forms (no duplicate literals)

### T-021 POST/GET tasks (list + create, transactional CREATED event)
- **Depends on:** T-020
- **Description:** Paginated scoped list + creation writes task+event atomically.
- **Files:** `app/api/tasks/route.ts`
- **Code signatures:**
  - `GET /api/tasks?plazaId=&status=&priority=&assigneeId=&overdue=true&q=&page=1&pageSize=50 → { items: TaskWithRelations[], total, page, pageSize }` (must call `requirePlazaAccess` if plazaId; else filter `plazaId IN accessiblePlazaIds`)
  - `POST /api/tasks (body: createTaskSchema) → 201 Task` inside `db.$transaction([createTask, createEvent{type:'CREATED', actorId, toStatus: task.status}])`; if `assigneeId` → also `ASSIGN` event; validate assignee has plaza access else 422
  - `GET` overdue filter: `dueDate < today AND status != COMPLETED`
- **Verify:** as site_user POST to unmapped plaza → 403; POST with assignee lacking access → 422; GET `?overdue=true` count matches SQL; new task has 1–2 events in `task_events`.
- **Done when:** [ ] 403/422 cases pass [ ] pagination works [ ] events written

### T-022 GET/PATCH task detail + meta edits
- **Depends on:** T-021
- **Description:** Detail with feed + locked-when-completed edits.
- **Files:** `app/api/tasks/[id]/route.ts (GET,PATCH)`
- **Code signatures:**
  - `GET /api/tasks/:id → { task, plaza:{id,name,project}, assignee, events: [{id,type,fromStatus,toStatus,text,actor:{name},createdAt}] asc }` (403 if no plaza access)
  - `PATCH /api/tasks/:id {title?,description?,priority?,dueDate?} → 200` + `META` event; if `task.status==='COMPLETED'` → 423 Locked (must reopen first); site_user editing others' visible task allowed if has access (per matrix)
- **Verify:** PATCH completed → 423; PATCH then GET events contains META with actor; q: title search returns it.
- **Done when:** [ ] detail includes ordered feed [ ] 423 lock works [ ] META logged

### T-023 Status / Assign / Reopen / Comment endpoints
- **Depends on:** T-022
- **Description:** All mutations transactional + audited. No DELETE handlers anywhere.
- **Files:** `app/api/tasks/[id]/status/route.ts`, `app/api/tasks/[id]/assign/route.ts`, `app/api/tasks/[id]/reopen/route.ts`, `app/api/tasks/[id]/comments/route.ts`
- **Code signatures:**
  - `POST /status {to,text?}: validate canTransition else 422; if to==='COMPLETED' set completedAt=now(); if from COMPLETED reject (use /reopen); tx: [updateTask, createEvent{STATUS,from,to,text}]`
  - `POST /assign {assigneeId}: canAssign(role)||403; assignee must have access||422; tx update + ASSIGN event`
  - `POST /reopen {text?}: canReopen||403; only if COMPLETED else 422; tx set IN_PROGRESS, completedAt=null + REOPEN event`
  - `POST /comments {text}: tx create COMMENT event only (no task update)`
- **Verify (curl as different roles):** site_user assign → 403; site_user comment → 201 + feed grows; lead reopen completed → 200; site_user reopen → 403; `grep -rn "export async function DELETE" app/api/tasks` → empty; `curl -X DELETE /api/tasks/:id` → 404/405.
- **Done when:** [ ] all 403/422 paths verified [ ] feed shows 4 event types [ ] no DELETE exists

### T-024 Plaza tasks UI: table + filters + New Task
- **Depends on:** T-021
- **Description:** Primary field UI. TanStack table, sticky filters, tablet cards fallback.
- **Files:** `app/(app)/plazas/[id]/page.tsx`, `components/task-table.tsx`, `components/task-filters.tsx`, `components/new-task-dialog.tsx`
- **Code signatures:**
  - `TaskFilters { status?: TaskStatus[]; priority?: Priority[]; assigneeId?: string; overdueOnly?: boolean; q?: string }`
  - Columns: `StatusBadge | Title(+plaza) | Assignee | PriorityBadge | Due(fmtDateIST, red if overdue) | Updated`
  - New dialog uses `createTaskSchema` + RHF; assignee Combobox filtered to plaza members (`GET /api/access?plazaId=`)
- **Verify:** open `/plazas/<id>` as site_user → only allowed plaza loads, others 403 page; create via dialog → appears in table <2s; filter overdue-only → counts match API; 390px width → cards, no horizontal scroll.
- **Done when:** [ ] CRUD via UI works [ ] filters match API [ ] mobile layout OK

### T-025 Task drawer + Activity Feed + actions
- **Depends on:** T-023, T-024
- **Description:** Sheet/drawer with stepper, assign, comment composer, immutable feed.
- **Files:** `components/task-drawer.tsx`, `components/activity-feed.tsx`, `components/comment-composer.tsx`, `components/status-stepper.tsx`
- **Code signatures:**
  - `TaskDrawer({ taskId, open, onClose })` → `useQuery GET /api/tasks/:id`, mutations to status/assign/comment/reopen with optimistic invalidation
  - `StatusStepper({from,onChange})` renders 4 buttons, disables illegal via `canTransition`
  - `ActivityFeed({events})` maps: CREATED/STATUS/ASSIGN/REOPEN muted rows + COMMENT bubbles; shows `actor.name + fmtDateIST + time`
- **Verify:** change status via stepper → toast + feed prepends/ appends + progress bar updates (50→100 on complete); comment posts → bubble appears; completed task → inputs disabled except Reopen (hidden for site_user); reload → feed persists order.
- **Done when:** [ ] full lifecycle via drawer [ ] feed immutable (no edit/delete buttons in DOM) [ ] role-gated reopen

---

## Phase P3 — Dashboards

### T-030 Global dashboard (`/`)
- **Depends on:** T-021
- **Description:** At-a-glance: KPIs + 3 project cards + spotlight tables.
- **Files:** `app/(app)/page.tsx`, `components/kpi-row.tsx`, `components/project-card.tsx`, `components/spotlight-table.tsx`, `lib/stats.ts`
- **Code signatures:**
  - `lib/stats.ts: export async function projectStats(projectId:string, plazaIds:string[]): Promise<{plazaCount,total,completed,blocked,overdue,progressPct}>; export async function globalStats(plazaIds:string[]): Promise<{open,overdue,blocked,completedWeek}>`
  - Single `groupBy` per stat (no N+1); `completedWeek`: `completedAt >= startOfWeek(IST)`
- **Verify:** with seed, card numbers equal `SELECT status,count(*) FROM tasks` manual; overdue red, blocked amber; search `q=canopy` filters spotlight; admin sees 3 cards, site05 sees only projects containing its plazas.
- **Done when:** [ ] numbers match SQL [ ] scoping correct [ ] KPIs render

### T-031 Project page (`/projects/[id]`)
- **Depends on:** T-030
- **Description:** Header + plaza health list.
- **Files:** `app/(app)/projects/[id]/page.tsx`, `components/plaza-row.tsx`
- **Code signatures:** `GET /api/plazas?projectId=` reused; row shows `{name, chainage, open/blocked/overdue, ProgressBar}` linking to `/plazas/:id`
- **Verify:** P1 page shows 10 plazas with % bars; inaccessible plaza (as site_user) hidden; click → plaza page.
- **Done when:** [ ] 10 rows for P1 [ ] % matches plazaStats [ ] nav works

### T-032 My Tasks (`/my-tasks`)
- **Depends on:** T-021
- **Description:** Assignee-scoped list, overdue-first sort.
- **Files:** `app/(app)/my-tasks/page.tsx`
- **Code signatures:** `GET /api/tasks?assigneeId=me&...` (`me` resolved server-side to session id); sort `overdue DESC, dueDate ASC, updatedAt DESC`
- **Verify:** login as site05 → list == `SELECT * WHERE assignee=site05`; complete one → disappears from open filter, appears in completed.
- **Done when:** [ ] assignee filter correct [ ] sort correct [ ] drawer reusable here

---

## Phase P4 — Harden + Deploy

### T-040 Login rate-limit + error polish + audit view
- **Depends on:** T-025
- **Description:** Security + UX pass + read-only audit.
- **Files:** `lib/rate-limit.ts`, `app/(app)/admin/audit/page.tsx`, `app/api/events/route.ts (GET, admin/lead)`, `components/error-toast.tsx`
- **Code signatures:**
  - `rateLimit(key:string, limit=5, windowMs=60_000): Promise<{ok:boolean}>` applied in `authorize()` by IP+email
  - `GET /api/events?take=100 → TaskEvent[] desc` (admin all, lead scoped to accessible plazas)
- **Verify:** 6th bad login in 60s → 429; all mutations show success/error toasts; audit page lists recent events, no edit controls.
- **Done when:** [ ] 429 triggers [ ] toasts on every mutation [ ] audit read-only

### T-041 Prod compose + backup/restore docs + UAT seed check
- **Depends on:** T-032, T-040
- **Description:** VM-ready deploy + backup drill.
- **Files:** `docker/compose.yml (final)`, `docs/DEPLOY.md`, `docs/BACKUP.md`, `scripts/backup.sh`
- **Code signatures:**
  - `scripts/backup.sh: docker exec tracker-db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} | gzip > /backups/tracker-$(date +%F).sql.gz`
  - `DEPLOY.md`: `git pull && docker compose -f docker/compose.yml up -d --build && docker exec tracker-app npx prisma migrate deploy && curl https://tracker.internal/api/health`
- **Verify:** fresh VM (or clean `docker compose down -v`): `up -d --build` → `/api/health` 200 → `npm run seed` → login as admin/lead/site → create/update/complete 5 tasks → `backup.sh` creates `.gz` → `gunzip|psql` restore to scratch DB succeeds and counts match.
- **Done when:** [ ] cold deploy works [ ] backup+restore verified [ ] 3-role smoke pass

### T-042 No-delete + matrix regression suite
- **Depends on:** T-041
- **Description:** Final guardrails before pilot sign-off.
- **Files:** `tests/regression.test.ts` (or `vitest`), `docs/ACCEPTANCE.md`
- **Code signatures (tests):**
  1. `DELETE /api/tasks/:id → 404|405`, `DELETE /api/users/:id → 404|405`, no `DELETE` export in `app/api/**`
  2. Matrix: site_user POST project → 403; site_user assign → 403; site_user reopen → 403; lead assign in-scope → 201; admin full pass
  3. Completed lock: PATCH completed → 423; comment on completed → 201 (allowed)
  4. Scoping: site05 GET /api/tasks (no filter) returns only its plazas' tasks
- **Verify:** `npm test` all green; `ACCEPTANCE.md` checked off with tester initials + date.
- **Done when:** [ ] suite green [ ] acceptance signed [ ] pilot ready

---

## Execution Order (happy path)

```
T-001 → T-002 → T-003 → T-004 → T-005
     → T-010 → T-011 → T-012 → T-013 → T-014
     → T-020 → T-021 → T-022 → T-023 → T-024 → T-025
     → T-030 → T-031 → T-032
     → T-040 → T-041 → T-042
```

Parallelizable after deps: T-012/T-013/T-014 together; T-030/T-031/T-032 together.

## Definition of Done (global)

- `npm run lint && npm test && npx prisma validate` green
- `docker compose -f docker/compose.yml up -d --build` serves + `/api/health` 200
- Seed counts exact (3/28/27/40), idempotent
- No DELETE routes for tasks/users/events; matrix tests green
- Tablet (768px) + laptop (1440px) manual pass on dashboard/plaza/drawer
