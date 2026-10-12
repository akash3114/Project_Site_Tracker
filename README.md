# Project Site Tracker (Pilot)

Web app to track toll-plaza site work across projects: `Project → Plaza → Task → Activity feed`, single assignee per task, no task deletion, full audit trail.

Stack: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Prisma 6 + PostgreSQL 16 + Auth.js v5 (email/password).

## Quick start (teammate)

Prereqs: Node 20+, Docker.

```powershell
npm.cmd install
docker compose -f docker/compose.dev.yml up -d db
npm.cmd exec -- prisma migrate dev
npm.cmd exec -- tsx prisma/seed.ts   # dummy data: 3 projects / 28 plazas / 27 users / 40 tasks
npm.cmd run dev                      # http://localhost:3000/login
```

Logins (seeded): `admin@tracker.local / Admin@123`, `lead.p1@tracker.local / Lead@123`, `site05@tracker.local / Site@123`.

## Scripts

- `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit`, `npm.cmd run build`
- `npm.cmd exec -- tsx scripts/verify-tasks-matrix.ts` (needs dev server on :3000)
- `npm.cmd exec -- tsx scripts/verify-masters-matrix.ts` (needs dev server on :3300 — set BASE env to change port)
- `BASE=http://localhost:3xxx npm.cmd exec -- tsx scripts/verify-regression.ts`
- `npm.cmd run reset-admin -- <email> [password]`

## Docs

- `plan.md` — architecture + data model + phases
- `TASKS.md` — task-by-task build spec
- `docs/DEPLOY.md`, `docs/BACKUP.md`, `docs/ACCEPTANCE.md`

## Deploy (VM)

See `docs/DEPLOY.md`: `docker compose -f docker/compose.yml up -d --build`, then `prisma migrate deploy`.
