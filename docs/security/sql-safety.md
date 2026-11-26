# SQL Safety & DuckDB Sandbox

All analytical queries—manual, AI-generated, or multi-agent—pass through two independent security layers before accessing dataset rows.

---

## Layer 1: SQLGlot AST Validation Gate (`QueryValidator`)

Implemented in [`services/api/app/analytics/query_validator.py`](../../services/api/app/analytics/query_validator.py):

1. **Single-Statement Enforcement**: Multi-statement payloads (`; DROP TABLE ...`) fail parsing immediately.
2. **Read-Only Statement Restriction**: Only `SELECT`, CTEs (`WITH`), and set operations (`UNION`/`INTERSECT`) are allowed. All DDL/DML/session expressions (`Insert`, `Update`, `Delete`, `Create`, `Drop`, `Alter`, `TruncateTable`, `Copy`, `Attach`, `Detach`, `Pragma`, `Set`, `Command`, `ReadCSV`) are blocked at the AST level.
3. **Catalog Scoping**: Every table referenced in the AST must exist within the active project's ready `DataTable` catalog (`CatalogService`). Unregistered tables and system catalogs (`information_schema`, `pg_catalog`, `duckdb_catalog`, `system`, `temp`) are rejected.
4. **Forbidden Function Blocklist & Allowlist**:
   - Explicitly blocks filesystem/network/system functions (`read_csv`, `read_parquet`, `scan_parquet`, `read_json`, `glob`, `httpfs`, `postgres_scan`, `sqlite_scan`, `install`, `load`, `system`, `shell`, `current_setting`).
   - Enforces safe analytical functions (math, date, window, aggregate, string casting).

---

## Layer 2: Isolated DuckDB Execution (`DuckDBEngine`)

- Opens a fresh `:memory:` DuckDB instance per query containing **only** PyArrow views registered for authorized project datasets.
- Applies strict runtime settings prior to `lock_configuration = true`:
  - `SET enable_external_access = false`
  - `SET memory_limit = '512MB'` (configurable)
  - `SET threads = 2` (configurable)
- Enforces query execution timeouts (`DUCKDB_QUERY_TIMEOUT_SECONDS`), concurrent query semaphore limits (`DUCKDB_MAX_CONCURRENT_QUERIES`), and server-side row truncation (`DUCKDB_MAX_RESULT_ROWS = 2000`).
- Strips filesystem paths or internal Parquet URIs before formatting user-facing error summaries.
