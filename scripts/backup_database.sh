#!/usr/bin/env bash
# Backup PostgreSQL (via pg_dump or Docker Compose) or local SQLite database cleanly.
set -euo pipefail

BACKUP_DIR="${1:-./backups/database}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

if [[ -n "${DATABASE_URL:-}" && "${DATABASE_URL}" == postgresql* ]]; then
  OUT_FILE="${BACKUP_DIR}/datasense_pg_${TIMESTAMP}.sql.gz"
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$DATABASE_URL" | gzip -9 > "$OUT_FILE"
  else
    echo "pg_dump not found locally; attempting via Docker Compose postgres service..." >&2
    docker compose -f deployment/compose/docker-compose.yml exec -T postgres \
      pg_dump -U "${POSTGRES_USER:-datasense_user}" "${POSTGRES_DB:-datasense}" | gzip -9 > "$OUT_FILE"
  fi
  shasum -a 256 "$OUT_FILE" > "${OUT_FILE}.sha256" 2>/dev/null || sha256sum "$OUT_FILE" > "${OUT_FILE}.sha256"
  echo "PostgreSQL backup written: $OUT_FILE"
else
  SQLITE_PATH="${SQLITE_DB_PATH:-./services/api/datasense_dev.db}"
  if [[ ! -f "$SQLITE_PATH" ]]; then
    echo "ERROR: SQLite file not found at $SQLITE_PATH and DATABASE_URL is not PostgreSQL." >&2
    exit 1
  fi
  OUT_FILE="${BACKUP_DIR}/datasense_sqlite_${TIMESTAMP}.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$SQLITE_PATH" ".backup '${OUT_FILE}'"
  else
    cp "$SQLITE_PATH" "$OUT_FILE"
  fi
  gzip -9 "$OUT_FILE"
  OUT_GZ="${OUT_FILE}.gz"
  shasum -a 256 "$OUT_GZ" > "${OUT_GZ}.sha256" 2>/dev/null || sha256sum "$OUT_GZ" > "${OUT_GZ}.sha256"
  echo "SQLite backup written: $OUT_GZ"
fi
