#!/usr/bin/env bash
# Nightly backup for Project Site Tracker (see docs/BACKUP.md).
# Cron: 0 2 * * * /opt/tracker/scripts/backup.sh >> /var/log/tracker-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_USER="${POSTGRES_USER:-tracker}"
POSTGRES_DB="${POSTGRES_DB:-tracker}"
CONTAINER="${DB_CONTAINER:-tracker-db}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/tracker-$(date +%F).sql.gz"

docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
echo "[$(date -Is)] backup OK: $OUT ($(du -h "$OUT" | cut -f1))"

find "$BACKUP_DIR" -name 'tracker-*.sql.gz' -mtime +"$KEEP_DAYS" -delete || true
echo "[$(date -Is)] retention: kept last $KEEP_DAYS days"
