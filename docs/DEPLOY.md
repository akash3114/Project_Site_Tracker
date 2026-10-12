# DEPLOY — Project Site Tracker (Pilot, Option A)

## Target
- Ubuntu 22.04 LTS, 2 vCPU / 4 GB RAM min
- Docker Engine + Compose plugin, DNS `tracker.internal` → VM IP
- Outbound internet for pulls (app stays internal)

## Files
- `docker/compose.yml` — prod: `db` (postgres:16-alpine, `pgdata`, `pg_isready` healthcheck) + `app` (Next.js standalone, `depends_on db healthy`, runs `prisma migrate deploy && node server.js`) + `caddy` (reverse_proxy `app:3000`)
- `docker/compose.dev.yml` — local dev: `db` only
- `docker/Caddyfile` — `{$CADDY_DOMAIN:localhost} { reverse_proxy app:3000 }`
- `.env` — NEVER commit; prod values live only on VM (see `.env.example` for keys: `POSTGRES_*, DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, CADDY_DOMAIN, SEED_ADMIN_*`)
- Prisma pinned to **v6** (`prisma@6` + `@prisma/client@6`). Do NOT `npm install prisma@latest` (v8 RC breaks `validate`/`migrate dev` workflow).

## First deploy (cold VM)
```bash
git pull  # or copy repo to /opt/tracker
cp .env.example .env && nano .env   # set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), NEXTAUTH_URL=https://tracker.internal, CADDY_DOMAIN=tracker.internal
docker compose -f docker/compose.yml up -d --build
docker exec tracker-app npx prisma migrate deploy
docker exec tracker-app npm run seed   # dummy 3/28/27/40 pre-pilot only
curl -k https://tracker.internal/api/health  # -> {"ok":true,...}
```

## Updates
```bash
git pull
docker compose -f docker/compose.yml up -d --build
docker exec tracker-app npx prisma migrate deploy
curl -k https://tracker.internal/api/health
```

## Checks
- `docker ps` — `tracker-db`, `tracker-app`, `tracker-caddy` Up (db healthy)
- `docker compose -f docker/compose.yml logs -f app` — auth/seed errors surface here
- `GET /api/health` — 200, no auth, no DB ping (Caddy/uptime safe)

## Notes
- `.env` must NOT be baked into image — confirm `.dockerignore` excludes `.env`/`.env*.local` before VM build.
- Fonts use `next/font/google` at build time — VM needs internet at `docker build`, or switch to self-hosted fonts.
- Seed (`npm run seed`) is idempotent via upserts; run only pre-pilot. Never with real data (`SEED_RESET` stays unset in prod).
