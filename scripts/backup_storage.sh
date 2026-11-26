#!/usr/bin/env bash
# Backup local dataset & artifact storage directory with SHA-256 verification.
set -euo pipefail

STORAGE_ROOT="${DATA_STORAGE_ROOT:-./services/api/.local_storage/datasense}"
BACKUP_DIR="${1:-./backups/storage}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -d "$STORAGE_ROOT" ]]; then
  echo "ERROR: Storage directory not found: $STORAGE_ROOT" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
OUT_FILE="${BACKUP_DIR}/datasense_storage_${TIMESTAMP}.tar.gz"

tar -czf "$OUT_FILE" --exclude="temp/*" -C "$(dirname "$STORAGE_ROOT")" "$(basename "$STORAGE_ROOT")"
shasum -a 256 "$OUT_FILE" > "${OUT_FILE}.sha256" 2>/dev/null || sha256sum "$OUT_FILE" > "${OUT_FILE}.sha256"
echo "Storage backup written: $OUT_FILE"
