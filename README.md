# Project Site Tracker (Pilot)

Web app to track toll-plaza site work across projects: `Project → Plaza → Task → Activity feed`, one assignee per task, no task deletion, full audit trail. Managers are real login users; job titles (Project Manager / Toll / Maintenance / Corridor) live on assignment rows.

Stack: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Prisma 6 + PostgreSQL 16 + Auth.js v5 (email/password).

> **Source of truth:** `docs/DATABASE.md` (roles `ADMIN | MANAGEMENT | MANAGER`, `project_assignments` / `plaza_assignments`).
> `plan.md` and `TASKS.md` are the original v1 build spec — **superseded**, kept for history only.

## Roles

| Role | Can |
|---|---|
| `ADMIN` | Everything: users (create / role / password reset / deactivate), projects, plazas, assignments, tasks, audit |
| `MANAGEMENT` | Projects, plazas, PM + Toll/Maintenance/Corridor assignments, tasks, audit (no user management) |
| `MANAGER` | Only the plazas they are assigned to (directly or via a managed project): tasks and statuses |

Users are never deleted (deactivate only). Tasks and events are never deleted.

## Quick start (teammate)

Prereqs: Node 20+, Docker.

```powershell
copy .env.example .env               # then set DATABASE_URL + AUTH_SECRET
npm.cmd install
docker compose -f docker/compose.dev.yml up -d db
npm.cmd exec -- prisma migrate dev
npm.cmd exec -- tsx prisma/seed.ts   # NHIT masters: 28 projects / 46 plazas / 94 users / 40 tasks
npm.cmd run dev                      # http://localhost:3000/login
```

Seeded logins:

- `admin@tracker.local` / `Admin@123` — `ADMIN`
- `management@tracker.local` / `Manage@123` — `MANAGEMENT`
- every imported manager as `slug@tracker.local` / `Tracker@123` — `MANAGER` (e.g. `m.ravindran@tracker.local`)

Rotate the shared `Tracker@123` before handing logins out. Wipe-and-reseed with `SEED_RESET=1 npm.cmd exec -- tsx prisma/seed.ts` (pre-pilot only).

## Scripts

- `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit`, `npm.cmd run build`
- `npm.cmd exec -- tsx scripts/verify-tasks-matrix.ts` (needs dev server on `:3000`)
- `npm.cmd exec -- tsx scripts/verify-masters-matrix.ts` (needs dev server, 20 checks; set `BASE` to change port)
- `BASE=http://localhost:3000 npm.cmd exec -- tsx scripts/verify-regression.ts`
- `npm.cmd run reset-admin -- <email> [password]`
- `npm.cmd run rotate-managers -- <password>` (bulk reset all `MANAGER` logins)

## Docs

- `docs/DATABASE.md` — schema, ERD, permission matrix, acronym/import rules (source of truth)
- `docs/DEPLOY.md` — VM deploy, includes the one-time v2 baseline reset
- `docs/BACKUP.md` — pg_dump backup + restore drill
- `docs/ACCEPTANCE.md` — pilot sign-off checklist (v2)
- `docs/NHIT Project List.md` — source asset list behind `prisma/nhit-data.ts`

## Deploy (VM)

See `docs/DEPLOY.md`: `docker compose -f docker/compose.yml up -d --build`, then `prisma migrate deploy`.
