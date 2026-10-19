#!/usr/bin/env bash
# One-time v2 baseline reset for an existing v1 pilot database (see docs/DEPLOY.md).
#
# DESTRUCTIVE: drops the entire `public` schema (old v1 tables + the stale
# `_prisma_migrations` ledger), re-applies the v2 baseline via the `migrate`
# service, then optionally seeds. Refuses to run unless CONFIRM=DROP is set and
# always snapshots first.
#
# Usage (on the VM, from the repo root):
#   CONFIRM=DROP ./scripts/reset-prod.sh          # reset schema + migrate deploy
#   CONFIRM=DROP SEED=1 ./scripts/reset-prod.sh   # + reseed NHIT masters
#
# Override via env: BACKUP_DIR, DB_CONTAINER, COMPOSE_FILE, POSTGRES_USER, POSTGRES_DB
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_USER="${POSTGRES_USER:-tracker}"
POSTGRES_DB="${POSTGRES_DB:-tracker}"
DB_CONTAINER="${DB_CONTAINER:-tracker-db}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

if [[ "${CONFIRM:-}" != "DROP" ]]; then
  cat >&2 <<'EOF'
Refusing to run: this tears down and rebuilds the entire database schema.

  Re-run with CONFIRM=DROP to proceed, e.g.
    CONFIRM=DROP ./scripts/reset-prod.sh
EOF
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "compose file not found: $COMPOSE_FILE (run from the repo root)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
SNAP="$BACKUP_DIR/tracker-prereset-$(date +%F-%H%M).sql.gz"
echo "[reset] snapshot -> $SNAP"
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$SNAP.tmp"
mv "$SNAP.tmp" "$SNAP"
echo "[reset] snapshot OK ($(du -h "$SNAP" | cut -f1))"

echo "[reset] stopping app"
"${COMPOSE[@]}" stop app >/dev/null

echo "[reset] dropping schema public (removes all tables + _prisma_migrations)"
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

echo "[reset] applying v2 baseline (migrate service)"
"${COMPOSE[@]}" run --rm --no-deps migrate npx prisma migrate deploy

if [[ "${SEED:-}" == "1" ]]; then
  echo "[reset] seeding NHIT masters (SEED_RESET=1)"
  "${COMPOSE[@]}" run --rm --no-deps -e SEED_RESET=1 migrate npm run seed
fi

echo "[reset] starting app + caddy"
"${COMPOSE[@]}" up -d --build

echo "[reset] done. Verify:  curl -k https://<domain>/api/health"
