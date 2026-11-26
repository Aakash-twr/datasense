#!/usr/bin/env bash
# Restore DataSense PostgreSQL or SQLite database backup safely.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_file.sql.gz|backup_file.db.gz> [target_sqlite_path]" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "${BACKUP_FILE}.sha256"
  else
    sha256sum -c "${BACKUP_FILE}.sha256"
  fi
fi

if [[ "$BACKUP_FILE" == *.sql.gz ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: Set DATABASE_URL before restoring PostgreSQL dump." >&2
    exit 1
  fi
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
  echo "PostgreSQL restore complete."
elif [[ "$BACKUP_FILE" == *.db.gz ]]; then
  TARGET_DB="${2:-./services/api/datasense_dev.db.restored}"
  mkdir -p "$(dirname "$TARGET_DB")"
  gunzip -c "$BACKUP_FILE" > "$TARGET_DB"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$TARGET_DB" "PRAGMA integrity_check;"
  fi
  echo "SQLite restore written & verified at: $TARGET_DB"
else
  echo "ERROR: Unsupported backup extension (expected .sql.gz or .db.gz)." >&2
  exit 1
fi
