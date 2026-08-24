#!/usr/bin/env bash
#
# Nightly Postgres dump for the VPS.
#
# The database lives in a Docker named volume on a single machine. A disk
# failure, a bad migration, or one `docker compose down -v` takes every user,
# listing, order and message with it - so a dump that stays on the same box is
# only half a backup. Point BACKUP_REMOTE at somewhere else and it becomes a
# real one.
#
# Install (as the user that owns the compose stack):
#
#   chmod +x scripts/backup-db.sh
#   crontab -e
#   15 3 * * *  cd /srv/campusmarket && ./scripts/backup-db.sh >> /var/log/campusmarket-backup.log 2>&1
#
# Restoring is the half people skip. Do it once, now, into a scratch database,
# and confirm the row counts - an untested backup is a guess:
#
#   gunzip -c backups/campusmarket-YYYY-MM-DD.sql.gz \
#     | docker compose exec -T postgres psql -U campusmarket -d postgres

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
# Optional. Anything `rclone` understands, e.g. "b2:campusmarket-backups".
# Left empty the dump stays local, which is better than nothing and worse than
# the point of this script.
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

STAMP="$(date +%F)"
ARCHIVE="${BACKUP_DIR}/campusmarket-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Is)] dumping to ${ARCHIVE}"

# --clean --if-exists so the dump can be replayed over an existing database
# without hand-dropping it first. Piped straight to gzip: the uncompressed
# dump never touches disk, which matters on a small VPS.
docker compose exec -T postgres \
  pg_dump --username=campusmarket --clean --if-exists campusmarket \
  | gzip -9 > "${ARCHIVE}"

# A dump that failed midway still leaves a file behind, and a 20-byte gzip is
# the kind of thing nobody notices until the day they need it.
SIZE="$(wc -c < "${ARCHIVE}")"
if [ "${SIZE}" -lt 1024 ]; then
  echo "[$(date -Is)] FAILED: dump is only ${SIZE} bytes" >&2
  rm -f "${ARCHIVE}"
  exit 1
fi

echo "[$(date -Is)] wrote ${SIZE} bytes"

if [ -n "${BACKUP_REMOTE}" ]; then
  echo "[$(date -Is)] copying to ${BACKUP_REMOTE}"
  rclone copy "${ARCHIVE}" "${BACKUP_REMOTE}"
else
  echo "[$(date -Is)] WARNING: BACKUP_REMOTE unset - this copy is on the same disk as the database it protects" >&2
fi

# Local pruning only. Retention on the remote is the remote's job, and deleting
# there from a cron job on the box being backed up is how ransomware gets to
# the backups too.
find "${BACKUP_DIR}" -name 'campusmarket-*.sql.gz' -mtime "+${RETAIN_DAYS}" -delete

echo "[$(date -Is)] done"
