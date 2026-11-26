# Backup & Restore Guide

DataSense separates persistent state into two stores: the relational database (`PostgreSQL` or dev `SQLite`) and uploaded/normalized dataset artifacts (`DATA_STORAGE_ROOT`).

---

## 1. Automated Backup Scripts

All backup scripts generate checksums (`.sha256`) alongside compressed archives:

### Relational Database
```bash
# PostgreSQL (set DATABASE_URL or run inside PostgreSQL container environment)
./scripts/backup_database.sh ./backups/database

# Local SQLite dev DB (uses sqlite3 .backup + gzip + sha256)
SQLITE_DB_PATH=./services/api/datasense_dev.db ./scripts/backup_database.sh ./backups/database
```

### Dataset & Artifact Storage
```bash
DATA_STORAGE_ROOT=./services/api/.local_storage/datasense ./scripts/backup_storage.sh ./backups/storage
```

Ephemereal DuckDB spill files under `temp/duckdb/` do not need archival.

---

## 2. Restore Procedures

1. **Restore Database Archive**:
```bash
./scripts/restore_database.sh ./backups/database/<backup-file>.gz [target_sqlite_path]
```

2. **Restore File Storage Archive**:
```bash
tar -xzf ./backups/storage/datasense_storage_<timestamp>.tar.gz -C /var/lib/datasense/
```

3. **Apply Migrations & Verify Readiness**:
```bash
cd services/api && alembic upgrade head
cd ../.. && ./scripts/verify_deployment.sh http://127.0.0.1:8000
```

---

## 3. Crash & Startup Recovery

During every API lifespan startup (`services/api/app/main.py`):
- `recover_interrupted_jobs(db)` marks orphaned `pending` / `processing` ingestion jobs after an unexpected restart.
- `WorkflowService.recover_interrupted_agent_runs(db)` transitions orphaned `planning` / `running` LangGraph runs cleanly so they do not appear permanently hung in the UI.
- Expired rows in `auth_sessions` and `rate_limit_buckets` are pruned automatically.
