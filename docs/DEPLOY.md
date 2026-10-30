# DEPLOY — Project Site Tracker (Pilot, Option A)

## Target
- Ubuntu 22.04 LTS, 2 vCPU / 4 GB RAM min
- Docker Engine + Compose plugin, DNS `tracker.internal` → VM IP
- Outbound internet for pulls (app stays internal)

## Files
- `docker/compose.yml` — prod stack:
  - `db` — postgres:16-alpine, `pgdata` volume, `pg_isready` healthcheck
  - `migrate` — one-shot `tools` image; runs `prisma migrate deploy` then exits; `app` waits on it (`service_completed_successfully`)
  - `app` — lean Next.js standalone server (`node server.js`); `depends_on db healthy`
  - `caddy` — `reverse_proxy app:3000`
- `docker/compose.dev.yml` — local dev: `db` only
- `docker/Caddyfile` — `{$CADDY_DOMAIN:localhost} { reverse_proxy app:3000 }`
- `.env` — NEVER commit (git-ignored + docker-ignored); prod values live only on the VM. Keys in `.env.example` (`POSTGRES_*, DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, CADDY_DOMAIN, SEED_ADMIN_*`)
- `scripts/reset-prod.sh` — guarded one-time baseline reset (see below)
- Prisma pinned to **v6** (`prisma@6` + `@prisma/client@6`). Do NOT `npm install prisma@latest` (v8 RC breaks the `validate`/`migrate dev` workflow).

## One-time company-hierarchy baseline reset (existing pilot DB)

Any earlier pilot schema (pre-Company, different role/enum layout) is
incompatible with the current baseline migration `20261021000000_init`. If the
VM already ran an earlier build, drop and rebuild the schema once. **It
snapshots first, but back up regardless.**

```bash
cd /opt/tracker
CONFIRM=DROP SEED=1 ./scripts/reset-prod.sh
curl -k https://tracker.internal/api/health   # -> {"ok":true,...}
```

The script refuses to run without `CONFIRM=DROP`, dumps to `/backups`, stops
`app`, drops and recreates the `public` schema (which also clears the stale
`_prisma_migrations` ledger), applies the current baseline through the `migrate`
service, and seeds when `SEED=1`. A brand-new VM skips this section — go straight
to First deploy.

## First deploy (cold VM)
```bash
git pull                               # or copy the repo to /opt/tracker
cp .env.example .env && nano .env      # set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), NEXTAUTH_URL=https://tracker.internal, CADDY_DOMAIN=tracker.internal
docker compose -f docker/compose.yml up -d --build      # db → migrate → app/caddy
docker compose -f docker/compose.yml run --rm -e SEED_RESET=1 migrate npm run seed
curl -k https://tracker.internal/api/health             # -> {"ok":true,...}
```

## Updates
```bash
git pull
docker compose -f docker/compose.yml up -d --build      # `migrate` re-applies any pending migrations
curl -k https://tracker.internal/api/health
```

## Checks
- `docker ps` — `tracker-db`, `tracker-app`, `tracker-caddy` Up (db healthy); `tracker-migrate` has exited 0
- `docker compose -f docker/compose.yml logs migrate` — migration output
- `docker compose -f docker/compose.yml run --rm migrate npx prisma migrate status` — every migration applied, no drift (run after an update)
- Admin → Audit trail — task history (`TaskActivity`) plus the master-data log (`AuditLog`) render; both are append-only
- `docker compose -f docker/compose.yml logs -f app` — auth/seed errors surface here
- `GET /api/health` — 200, no auth, no DB ping (Caddy/uptime safe)

## Notes
- `.env` is excluded by `.dockerignore` and `.gitignore` — secrets are never baked into the image. Verify with `git check-ignore .env`.
- Migrations and seed run in the `migrate` service (`tools` image), **not** in `app`: the runner is a lean standalone bundle with no Prisma CLI and no `tsx`.
- Fonts use `next/font/google` at build time — the VM needs internet at `docker build`, or switch to self-hosted fonts.
- Seed (`npm run seed`) is idempotent via upserts; run only pre-pilot. Never with real data (`SEED_RESET` wipes every table — one-time baseline reset only).
- **Credentials:** the seed creates 92 field logins on a shared `Tracker@123` plus Admin/Head Office accounts. Rotate after distribution:
  - bulk: `docker compose -f docker/compose.yml run --rm migrate npm run rotate-managers -- '<new-password>'`
  - single user: Admin → Users → Reset password
  - admin: `docker compose -f docker/compose.yml run --rm migrate npm run reset-admin -- admin@tracker.local '<new-password>'`
