# Operations — Project Site Tracker

How to run, migrate, seed, deploy, back up and troubleshoot the pilot.

* Deployment specifics: [`DEPLOY.md`](./DEPLOY.md)
* Backup and restore drill: [`BACKUP.md`](./BACKUP.md)
* Acceptance checklist: [`ACCEPTANCE.md`](./ACCEPTANCE.md)
* Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Anything marked **Recommendation** is not implemented yet.

---

## 1. Environments

| Environment | Purpose | Database | App | Notes |
|---|---|---|---|---|
| Local development | Feature work, migrations | `docker/compose.dev.yml` → `tracker-db-dev` on `${POSTGRES_PORT:-5432}` | `npm run dev` on `:3000` | Seed is safe to reset |
| CI / verification | Type-check, lint, build, smoke | Ephemeral Postgres or a disposable schema | `next build` | `scripts/smoke-api.mjs` expects a running server |
| Pilot / production | Real users on the internal network | `docker/compose.yml` → `tracker-db` | `tracker-app` behind Caddy | Migrations run in the one-shot `migrate` service |

### Prerequisites

* Node.js 20 and npm
* Docker Engine + Compose plugin
* PostgreSQL 16 (the dev container is the supported path)
* For production: Ubuntu 22.04 LTS, 2 vCPU / 4 GB RAM minimum, DNS pointing at
  the host, outbound internet for image pulls and `next/font/google` at build
  time

---

## 2. Environment variables

Derived from `.env.example` and the code. `.env` is git-ignored and
docker-ignored; production values live only on the VM.

| Name | Required | Example | Purpose | Secret |
|---|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://tracker:tracker@localhost:5432/tracker?schema=public` | Prisma connection string | Yes |
| `POSTGRES_USER` | Yes (Compose) | `tracker` | Postgres superuser for the container | No |
| `POSTGRES_PASSWORD` | Yes (Compose) | `change-me` | Postgres password | Yes |
| `POSTGRES_DB` | Yes (Compose) | `tracker` | Database name | No |
| `POSTGRES_PORT` | Dev only | `5432` | Host port for `compose.dev.yml` | No |
| `AUTH_SECRET` | Yes | 32+ random bytes | Auth.js JWT signing/encryption | Yes |
| `NEXTAUTH_URL` | Yes | `https://tracker.internal` | Canonical app URL | No |
| `CADDY_DOMAIN` | Yes (Compose) | `tracker.internal` | Caddy site address | No |
| `SEED_ADMIN_EMAIL` | Seed only | `admin@tracker.local` | Admin account created by the seed | No |
| `SEED_ADMIN_PASSWORD` | Seed only | `Admin@123` | Admin password created by the seed | Yes |
| `UPLOAD_DIR` | No | `/data/uploads` | Attachment directory; defaults to `<cwd>/uploads` | No |
| `SEED_RESET` | Seed only | `1` | Wipes tables before seeding | No |
| `NODE_ENV` | Runtime | `production` | Set by the Dockerfile | No |
| `BACKUP_DIR` | Backup only | `/backups` | Output directory for `scripts/backup.sh` | No |
| `DB_CONTAINER` | Backup/reset only | `tracker-db` | Container name used by `docker exec` | No |
| `KEEP_DAYS` | Backup only | `14` | Local retention for `backup.sh` | No |
| `CONFIRM` | Reset only | `DROP` | Required guard for `reset-prod.sh` | No |
| `SEED` | Reset only | `1` | Also seed after the reset | No |
| `COMPOSE_FILE` | Reset only | `docker/compose.yml` | Compose file used by the reset script | No |
| `SMOKE_BASE_URL` | Smoke only | `http://localhost:3000` | Target for `scripts/smoke-api.mjs` | No |

**Recommendation:** generate `AUTH_SECRET` with `openssl rand -base64 32` and
keep it stable across restarts; rotating it invalidates all sessions.

---

## 3. Local development

```powershell
# 1. Install
npm install

# 2. Environment
Copy-Item .env.example .env
# edit DATABASE_URL / AUTH_SECRET if needed

# 3. Database
docker compose -f docker/compose.dev.yml up -d

# 4. Schema
npx prisma migrate deploy
npx prisma generate

# 5. Demo data (first time, or after SEED_RESET=1)
npm run seed

# 6. App
npm run dev
```

Open `http://localhost:3000`. The seed prints its row counts as JSON; a fresh
seed reports `taskAssignees: 50`.

### Checks before a commit

```powershell
npx tsc --noEmit
npm run lint
npm run build
node scripts/smoke-api.mjs        # needs `npm run dev` running
node scripts/check-docs-links.mjs # docs only
```

`scripts/smoke-api.mjs` creates tasks, attachments and a throwaway user, then
removes them. It asserts the seed floor (`≥ 47` tasks, 3 companies, 28 projects,
46 plazas, 18 departments, 20 memberships), role-specific access, the completed
lock, batch creation, assignment ceilings, the multi-assignee replace-set,
reporting-line visibility and cycle rejection, and attachment round-trips.

---

## 4. Database change workflow

Migrations are **forward-only**. Applied migrations must never be edited: Prisma
records a checksum and `migrate deploy` will refuse a modified history.

```mermaid
flowchart LR
  A["Edit prisma/schema.prisma"] --> B["npx prisma migrate dev --name <change>"]
  B --> C["Review generated SQL"]
  C --> D["Test locally + npm run seed"]
  D --> E["Commit schema + migration"]
  E --> F["Deploy: migrate service runs prisma migrate deploy"]
  F --> G["Verify migrate status + migrate diff"]
```

Recent structural changes are a useful pattern to copy:
`20261029000003_task_assignees_and_reporting` creates `TaskAssignee`, backfills
the old `Task.assigneeId` into it, then drops that column and its index in the
same migration, and adds the `User.managerId` self-FK. A backfill must always run
before the old column is dropped.

### Create a migration (development)

```powershell
npx prisma migrate dev --name add_something
```

Prisma diffs the schema against the dev database, writes
`prisma/migrations/<timestamp>_add_something/migration.sql`, applies it and
regenerates the client. **Read the SQL** before committing, especially for:

* destructive changes (`DROP COLUMN`, type changes) — plan the data migration;
* CHECK constraints and partial unique indexes that Prisma cannot express;
* `timestamptz(3)` and `date` column types;
* new `onDelete` behaviour.

### Apply (production)

`docker/compose.yml` runs `npx prisma migrate deploy` in the `migrate` service
before `app` starts. On an update:

```bash
git pull
docker compose -f docker/compose.yml up -d --build
docker compose -f docker/compose.yml logs migrate
```

### Verify

```bash
docker compose -f docker/compose.yml run --rm migrate npx prisma migrate status
```

Every migration should be applied and the schema should have no drift. To prove
the schema and migrations agree without touching the database:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL"
```

An empty diff is the expected result.

### Fixing a bad migration

There is no down migration. Choose one:

1. **Forward fix (preferred):** write a new migration that corrects the schema
   or data, then deploy it.
2. **Restore:** stop the app, restore the pre-deploy backup, then deploy a
   corrected build (see §7).
3. **Baseline reset:** only for a pre-pilot database with an incompatible
   history — `CONFIRM=DROP SEED=1 ./scripts/reset-prod.sh`. This drops the
   `public` schema and is destructive.

Never edit or delete a migration folder that has been applied in an environment
you care about.

---

## 5. Seeding

```powershell
npm run seed                 # idempotent upserts; skips if users already exist
$env:SEED_RESET="1"; npm run seed   # wipe + rebuild
```

`prisma/seed.ts`:

* Refuses to run when users exist unless `SEED_RESET=1` (it prints a skip
  message).
* With `SEED_RESET=1`, deletes in FK-safe order, then recreates catalogue,
  people, scope assignments, tasks, task assignees, activities and one pending
  reopen request.
* Uses stable ids for catalogue rows (`company_neppl`, `dept_fin`,
  `office_delhi`, `cat_toll_operations`, …) so every environment matches.
* Creates demo logins on a shared password (`Tracker@123` for field users,
  `Manage@123` for Head Office, `Admin@123` for the admin). These are demo-only.
* Seeds a demo reporting line: plaza staff report to the first project manager
  of their first project, project managers and Head Office leads report to the
  `management@tracker.local` account, and that account reports to the admin.
  111 of 112 users have a manager; the admin is the root.

Seed profile (verified by the seed's own output):

| Entity | Count |
|---|---|
| Companies | 3 |
| Projects | 28 |
| Plazas | 46 |
| Offices | 2 |
| Departments | 18 |
| Users | 112 |
| Head Office memberships | 20 |
| Task categories | 6 |
| Tasks | 47 (6 project-level, 35 plaza, 6 department) |
| Task assignees | 50 (3 tasks have two assignees) |
| Task activities | 138 |
| Pending reopen requests | 1 |

**Warning:** `SEED_RESET=1` deletes every row in every table. Never run it
against a database with real work. It also rebuilds the 50 task-assignee links
and the demo reporting line, so manual reassignments and reporting changes are
not preserved. The seed is for first boot and demos only.

---

## 6. Deploy and update runbook

Full first-deploy steps are in [`DEPLOY.md`](./DEPLOY.md). The short version:

```bash
git pull
cp .env.example .env && nano .env
docker compose -f docker/compose.yml up -d --build
docker compose -f docker/compose.yml run --rm -e SEED_RESET=1 migrate npm run seed
curl -k https://tracker.internal/api/health
```

### Pre-flight checklist

- [ ] Backup is recent and restorable (`/backups/tracker-*.sql.gz`)
- [ ] `.env` has production `POSTGRES_PASSWORD`, `AUTH_SECRET`, `NEXTAUTH_URL`,
      `CADDY_DOMAIN`
- [ ] New migrations reviewed; no destructive change without a data plan
- [ ] Disk has room for the new image, the database and uploads
- [ ] Change window agreed if the migration rewrites large tables

### Post-flight checklist

- [ ] `docker ps` shows `tracker-db` healthy, `tracker-app` and `tracker-caddy`
      up, `tracker-migrate` exited `0`
- [ ] `docker compose -f docker/compose.yml logs migrate` shows no errors
- [ ] `npx prisma migrate status` reports all migrations applied
- [ ] `GET /api/health` returns `200`
- [ ] Sign in as Admin, open `/management`, load a task, post a comment
- [ ] Upload and download an attachment
- [ ] `GET /api/audit` returns recent master-data rows
- [ ] `docker compose -f docker/compose.yml logs app` has no auth/Prisma errors

### Rollback

There is no automated rollback. In order of preference:

1. **Revert the app only** — check out the previous commit and rebuild. This is
   safe only if the new release added no migration, or the old code is
   compatible with the new schema.
2. **Restore the database** — stop `app`, restore the pre-deploy dump, start the
   previous build. This loses everything written since the backup.
3. **Forward fix** — ship a corrective migration and build.

Record which option was used, and why, in the incident notes.

---

## 7. Backup and restore

The implemented backup is `scripts/backup.sh`: a nightly `pg_dump` from
`tracker-db`, gzipped into `${BACKUP_DIR:-/backups}`, retained for
`${KEEP_DAYS:-14}` days. It covers **PostgreSQL only**.

```bash
./scripts/backup.sh
ls -lh /backups/tracker-*.sql.gz
```

Restore drill and the destructive production restore are documented in
[`BACKUP.md`](./BACKUP.md). Always restore to a scratch database first and
compare counts.

### The uploads gap

Attachments are stored on the app container's filesystem at
`process.env.UPLOAD_DIR ?? <cwd>/uploads`. `docker/compose.yml` declares no
volume for that path, and `pg_dump` does not include files. Therefore:

* Attachments are **lost** when the `tracker-app` container is recreated.
* A database restore restores attachment **rows** whose files may be gone.
* There is no off-host copy of attachments.

**Recommendation (high priority):** add a named volume or bind mount for
`UPLOAD_DIR` and include it in the backup routine, for example:

```yaml
# docker/compose.yml (not yet applied)
app:
  environment:
    UPLOAD_DIR: /data/uploads
  volumes:
    - uploads:/data/uploads

volumes:
  uploads:
```

Then back up the volume (or the host bind mount) alongside the database, and
test a restore that includes both.

---

## 8. Health, logs and monitoring

| Signal | How | What it proves |
|---|---|---|
| Liveness | `GET /api/health` → `{ ok, time }` | The Node process is serving |
| Proxy liveness | `GET /healthz` → `200` from Caddy | Caddy is up |
| Container state | `docker ps` | `db` healthy, `app`/`caddy` up, `migrate` exited 0 |
| App logs | `docker compose -f docker/compose.yml logs -f app` | Auth, Prisma, upload and runtime errors |
| Migration logs | `docker compose -f docker/compose.yml logs migrate` | Schema apply result |
| DB logs | `docker compose -f docker/compose.yml logs db` | Startup, connection, disk errors |
| Backup log | `/var/log/tracker-backup.log` (cron) | Nightly dump success |

**`/api/health` does not query the database.** A `200` means the web process is
alive, not that it can serve data. When investigating an outage, also check the
app log for Prisma errors and run a trivial query:

```bash
docker exec tracker-db psql -U tracker -d tracker -c "select 1;"
```

**Recommendation:** add a readiness endpoint that runs `SELECT 1`, and ship
container logs to a central store if the pilot grows beyond one host.

---

## 9. Incident runbooks

### 9.1 Database unavailable

Symptoms: pages 500, `PrismaClientInitializationError` or
`Can't reach database server` in the app log.

1. `docker ps` — is `tracker-db` running and healthy?
2. `docker compose -f docker/compose.yml logs db` — disk full? corrupt volume?
3. `docker exec tracker-db pg_isready -U tracker -d tracker`
4. Restart the database: `docker compose -f docker/compose.yml restart db`.
5. If the volume is damaged, restore from the latest dump (§7) — this is
   destructive and needs sign-off.
6. Confirm `GET /api/health` and a real page load.

### 9.2 Migration failed

Symptoms: `tracker-migrate` exits non-zero, `app` never starts (it waits on
`service_completed_successfully`).

1. Read `docker compose -f docker/compose.yml logs migrate`.
2. `npx prisma migrate status` — which migration is pending/failed?
3. Common causes: a destructive change blocked by existing data, a duplicate
   value for a new unique index, a lock timeout.
4. Fix forward with a new migration, or restore the pre-deploy dump.
5. Do **not** mark a failed migration as applied unless you have verified the
   schema by hand; that hides drift.

### 9.3 Login failures

1. Is the user `active`? `SELECT "active" FROM "User" WHERE email = '...';`
2. Does the account have a password hash? Seed/demo accounts do; imported rows
   might not.
3. Has the in-memory limiter tripped? It allows 5 attempts per 60 s per email;
   restarting the app clears it.
4. Is `AUTH_SECRET` stable? A changed secret invalidates every session cookie.
5. Is `NEXTAUTH_URL` the URL users actually visit? A mismatch breaks callback
   redirects.
6. Check `docker compose ... logs app` for Auth.js errors.

### 9.4 Disk full

Symptoms: Postgres write errors, uploads failing, container restarts.

1. `df -h` on the host; `docker system df` for image/volume usage.
2. `du -sh /backups/*` — old dumps are the usual culprit; retention should keep
   14 days.
3. Prune unused images: `docker image prune -f` (safe); do **not** prune volumes
   without checking names.
4. If uploads filled the container, move `UPLOAD_DIR` to a mounted volume with
   space (§7).
5. Verify Postgres can write: `select 1;` then a small insert/rollback.

### 9.5 Attachment upload failure

| Symptom | Cause | Fix |
|---|---|---|
| `413` | File > 10 MB | Compress or split |
| `415` | MIME not JPG/PNG/WebP/PDF | Convert the file |
| `400 file is required` | Multipart field missing | Send `file` |
| `422 Activity not found` | `activityId` belongs to another task | Omit it or use the right id |
| `404 File not found` on download | Row exists, file missing (container recreated) | Restore uploads; add a volume |
| `500` on write | `UPLOAD_DIR` not writable or disk full | Fix permissions/space |

### 9.6 Accidental archive

Master data is archived with `active = false`; nothing is deleted.

1. Find the row in `/admin` (projects/plazas) or via `GET /api/audit`.
2. Set `active = true` through the same admin screen.
3. Confirm the `AuditLog` shows `ARCHIVE` followed by `UPDATE` (the restore is
   recorded as an update).
4. Remember that unique names/codes stay reserved while archived; a new row with
   the same name will conflict.

### 9.7 Audit investigation

* **Task history:** `GET /api/events?take=500` (Admin/HO) or open the task's
  activity feed. Each row has actor, type, from/to status, from/to assignee,
  text and timestamp. Assignment changes write one `ASSIGNED` row per person
  added or removed.
* **Master data:** `GET /api/audit?entity=Project&entityId=...&take=500`.
  `before`/`after` are JSON snapshots.
* **Who changed access:** filter `entity=PlazaAssignment` or
  `entity=HeadOfficeMembership`; `entityId` is `userId` or `userId:departmentId`.
* Both histories are append-only; there is no endpoint to alter them.

### 9.8 App down but database healthy

1. `docker ps` — is `tracker-app` restarting?
2. `docker compose ... logs app` — missing `AUTH_SECRET`, bad `DATABASE_URL`,
   port conflict, or a build-time error.
3. Check that `migrate` exited `0`; `app` will not start otherwise.
4. `docker compose ... up -d --build` to rebuild if the image is stale.
5. Verify Caddy can reach the app: `docker exec tracker-caddy wget -qO- http://app:3000/api/health`.

---

## 10. Routine administration

All of these are Admin actions unless noted.

| Task | How |
|---|---|
| Create a user | Admin → Users → New, or `POST /api/users`; then grant assignments |
| Reset a password | Admin → Users → Reset password, or `PATCH /api/users/:id { password }` |
| Reset the admin password | `npm run reset-admin -- admin@tracker.local '<new-password>'` |
| Rotate the shared field password | `npm run rotate-managers -- '<new-password>'` |
| Deactivate a leaver | Admin → Users → set inactive. Never delete the user. |
| Change a reporting line | Admin → Users → Reports to, or `PATCH /api/users/:id { managerId }` |
| Add a Head Office member | Admin → Users → Head Office departments, or `POST /api/head-office-memberships` |
| Make a department primary | `PUT /api/head-office-memberships { isPrimary: true }` |
| Grant project management | `POST /api/project-assignments` |
| Grant plaza access | Admin → Access → select user → tick plazas/roles → save (`PUT /api/access`) |
| Archive a project/plaza | Admin → Projects/Plazas → edit → set inactive |
| Create a task category | Admin → Categories |
| Investigate a change | Admin → Audit trail, or `GET /api/audit` |

Reporting lines are seeded and editable in Admin → Users ("Reports to"). Changing
one changes downline visibility and the status rights of managers above the
work; it does **not** add or remove `ProjectAssignment`, `PlazaAssignment` or
`HeadOfficeMembership` scope grants. Self-links, inactive managers and cycles
are rejected with `422` (`lib/reporting.ts`).

`npm run reset-admin` and `npm run rotate-managers` run `tsx` scripts against
`DATABASE_URL`; in production run them inside the `migrate` (tools) container:

```bash
docker compose -f docker/compose.yml run --rm migrate npm run reset-admin -- admin@tracker.local '<new-password>'
docker compose -f docker/compose.yml run --rm migrate npm run rotate-managers -- '<new-password>'
```

---

## 11. Security checklist

- [ ] `.env` is not committed (`git check-ignore .env`) and not baked into the
      image (`.dockerignore`)
- [ ] `AUTH_SECRET` is ≥ 32 random bytes and unique to this environment
- [ ] `POSTGRES_PASSWORD` is not the default `tracker`
- [ ] Demo passwords (`Admin@123`, `Manage@123`, `Tracker@123`) are rotated
      before real users get accounts
- [ ] Caddy terminates TLS; port `3000` is not exposed to untrusted networks
- [ ] Database port `5432` is not published in production (`compose.yml` does
      not publish it)
- [ ] Backups are encrypted at rest and copied off-host weekly
- [ ] Restore drill completed at least once
- [ ] Inactive users are deactivated promptly; sessions die on the next request
- [ ] Audit log reviewed after access changes
- [ ] Uploads volume backed up (once the volume exists)
- [ ] Host patched; Docker and images updated on a schedule

### Known operational risks

| Risk | Impact | Mitigation |
|---|---|---|
| Uploads are container-local and unbacked | Attachment loss on recreate | Add a volume and back it up |
| In-memory login rate limit | Resets on restart; per process | Acceptable for one pilot instance; replace for multi-instance |
| `/api/health` ignores the DB | False "healthy" signal | Check logs and `select 1` during incidents |
| No structured logging/metrics | Slow diagnosis | Centralise logs if the pilot grows |
| No automated backup unless cron is installed | Data loss | Install `scripts/backup.sh` cron and verify |
| Forward-only migrations | No quick schema rollback | Test migrations; keep pre-deploy dumps |
| Shared demo password | Broad credential reuse | Rotate before distribution |
| No virus scanning on uploads | Malicious file stored | Restrict to images/PDF and trusted users |

---

## 12. Related documents

| Document | Use it for |
|---|---|
| [`DEPLOY.md`](./DEPLOY.md) | First deploy, baseline reset, update commands |
| [`BACKUP.md`](./BACKUP.md) | Backup cron, restore drill, retention |
| [`ACCEPTANCE.md`](./ACCEPTANCE.md) | Pilot sign-off checks |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Runtime topology and limitations |
| [`SCHEMA.md`](./SCHEMA.md) | Column types and migration history |
| [`API.md`](./API.md) | Endpoint contracts used in the runbooks |
