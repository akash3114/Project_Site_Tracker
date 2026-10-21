# Project Site Tracker (Pilot)

Web app to track toll-plaza site work across companies: `Company → Project → Plaza → Task → Activity feed`, one assignee per task, no task deletion, full audit trail. Managers are real login users; job titles (Project Manager / Toll / Maintenance / Corridor) live on assignment rows.

Stack: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Prisma 6 + PostgreSQL 16 + Auth.js v5 (email/password).

> **Source of truth:** `docs/DATABASE.md` (roles `ADMIN | HEAD_OFFICE | PROJECT_MANAGER`, `company_assignments` / `project_assignments` / `plaza_assignments`).
> `plan.md` and `TASKS.md` are the original v1 build spec — **superseded**, kept for history only.

## Roles

Access is assignment-based; a person may hold several roles and scopes. The effective role on a task is **Admin > Head Office > Project Manager > Site Manager**.

| Account type | Shows as | Can |
|---|---|---|
| `ADMIN` | Admin | Everything: users (create / password reset / deactivate), companies, projects, plazas, categories, assignments, tasks, reopen approvals, audit |
| `HEAD_OFFICE` | Head Office | All companies: projects, plazas, HO/PM/plaza assignments, tasks, reopen approvals, audit (no user management) |
| `PROJECT_MANAGER` (project assignment) | Project Manager | Assigned projects: project- and plaza-level tasks, assignment within the project; can request (not directly perform) reopen |
| `PROJECT_MANAGER` (plaza assignment only) | Plaza job title(s) held | Assigned plazas and assigned project-level tasks: tasks and statuses; can request (not directly perform) reopen |

Users are never deleted (deactivate only). Tasks and events are never deleted.

## Quick start (teammate)

Prereqs: Node 20+, Docker.

```powershell
copy .env.example .env               # then set DATABASE_URL + AUTH_SECRET
npm.cmd install
docker compose -f docker/compose.dev.yml up -d db
npm.cmd exec -- prisma migrate dev
npm.cmd exec -- tsx prisma/seed.ts   # master data: 3 companies / 28 projects / 46 plazas / 94 users / 41 tasks
npm.cmd run dev                      # http://localhost:3000/login
```

Seeded logins:

- `admin@tracker.local` / `Admin@123` — `ADMIN`
- `management@tracker.local` / `Manage@123` — `HEAD_OFFICE`
- every imported field person as `slug@tracker.local` / `Tracker@123` (e.g. `anand.mandoli@tracker.local`); their access comes from project/plaza assignment rows

Rotate the shared `Tracker@123` before handing logins out. Wipe-and-reseed with `SEED_RESET=1 npm.cmd exec -- tsx prisma/seed.ts` (pre-pilot only).

## Scripts

- `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit`, `npm.cmd run build`
- `node scripts/smoke-api.mjs` (23 runtime checks; needs dev server on `:3000`, set `SMOKE_BASE_URL` to change it)
- `node scripts/parse-master-data.mjs` (regenerates `prisma/master-data.ts` from `docs/master-data.md`)
- `npm.cmd run reset-admin -- <email> [password]`
- `npm.cmd run rotate-managers -- <password>` (bulk reset all field-user logins)

## Docs

- `docs/DATABASE.md` — schema, ERD, permission matrix, reopen workflow (source of truth)
- `docs/master-data.md` — only company/project/plaza/people master-data source
- `docs/DEPLOY.md` — VM deploy, includes the one-time baseline reset
- `docs/BACKUP.md` — pg_dump backup + restore drill
- `docs/ACCEPTANCE.md` — pilot sign-off checklist

## Deploy (VM)

See `docs/DEPLOY.md`: `docker compose -f docker/compose.yml up -d --build`, then `prisma migrate deploy`.
