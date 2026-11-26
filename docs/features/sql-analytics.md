# SQL Analytics Workspace

Implemented in [`services/api/app/analytics/`](../../services/api/app/analytics/) and [`AnalyticsWorkspacePage.tsx`](../../apps/web/src/pages/analytics/AnalyticsWorkspacePage.tsx), the SQL Analytics Workspace runs high-speed read-only SQL across project datasets via DuckDB and SQLGlot.

---

## 1. Backend Execution Pipeline

- **Catalog Discovery (`GET /api/v1/projects/{id}/query/catalog`)**: Returns ready datasets, normalized schema names, qualified DuckDB identifiers (`<dataset_schema>.<table_name>`), column types, and PII flags.
- **AST Validation (`POST /api/v1/projects/{id}/query/validate`)**: Parses queries via SQLGlot without executing them, verifying syntax, read-only `SELECT`/`WITH` compliance, and table scoping.
- **Sandboxed Execution (`POST /api/v1/projects/{id}/query/execute`)**: Attaches authorized project Parquet files as in-memory PyArrow views inside an isolated DuckDB connection, executes under timeout & row bounds, and logs execution telemetry (`execution_time_ms`, `returned_row_count`, `status`) into `query_runs`.

---

## 2. Workspace Features (`apps/web`)

- **Database Explorer**: Resizable schema sidebar showing datasets, tables, row counts, data types, PII shields, and click-to-insert identifiers.
- **CodeMirror 6 SQL Editor**: Syntax highlighting, `Cmd/Ctrl + Enter` execution shortcut, keyword formatting, configurable row limits (`100`–`10,000`, capped server-side at `2,000`), Validate, Save, and AI Explain actions.
- **Results, History & Saved Queries**: Switchable bottom tabs for paginated Query Results (with CSV Export & TSV Copy), Chart View (Bar/Line viewer), Searchable Query History (`/analytics?tab=history`), and Saved Queries CRUD (`/analytics?tab=saved`).
