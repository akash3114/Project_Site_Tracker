# BACKUP & RESTORE — Project Site Tracker

## Strategy (pilot)
- Nightly `pg_dump` from `tracker-db` container → gzip → `/backups`, retain 14 days, weekly copy off-VM.
- Postgres data also persists in `pgdata` Docker volume (survives container recreates, NOT `down -v`).

## Setup (on VM)
```bash
sudo mkdir -p /backups && sudo chown $USER /backups
cat scripts/backup.sh  # verify container name tracker-db + POSTGRES_USER/DB
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/tracker/scripts/backup.sh >> /var/log/tracker-backup.log 2>&1") | crontab -
```

## Manual backup
```bash
./scripts/backup.sh
ls -lh /backups/tracker-*.sql.gz  # newest should be minutes old
```

## Restore drill (required once before UAT)
```bash
# 1. Pick a backup
ls -t /backups/tracker-*.sql.gz | head -1
# 2. Restore to SCRATCH db (never overwrite prod without snapshot)
docker exec -i tracker-db psql -U tracker -c "CREATE DATABASE tracker_restore;"
gunzip -c /backups/tracker-2026-10-09.sql.gz | docker exec -i tracker-db psql -U tracker -d tracker_restore
# 3. Verify counts match prod expectations (v2 seed: 28 projects / 46 plazas / 94 users / 40 tasks)
docker exec tracker-db psql -U tracker -d tracker_restore -c "SELECT (SELECT count(*) FROM \"Project\") AS projects, (SELECT count(*) FROM \"Plaza\") AS plazas, (SELECT count(*) FROM \"User\") AS users, (SELECT count(*) FROM \"Task\") AS tasks;"
```

## Prod restore (destructive — snapshot first)
```bash
docker compose -f docker/compose.yml stop app
docker exec tracker-db pg_dump -U tracker tracker | gzip > /backups/tracker-pre-restore-$(date +%F-%H%M).sql.gz
gunzip -c /backups/<chosen>.sql.gz | docker exec -i tracker-db psql -U tracker -d tracker
docker compose -f docker/compose.yml start app
curl -k https://tracker.internal/api/health
```

## Retention
```bash
# keep 14 days locally (runs after backup in cron, or manually)
find /backups -name 'tracker-*.sql.gz' -mtime +14 -delete
# weekly: copy newest off-VM (adjust dest)
scp /backups/tracker-$(date +%F).sql.gz backup-host:/vault/tracker/
```
