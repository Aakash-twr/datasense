# Dataset Ingestion & Profiling

Implemented under [`services/api/app/ingestion/`](../../services/api/app/ingestion/), DataSense asynchronously transforms uploaded files into normalized, versioned Snappy Parquet tables with statistical summaries and PII detection.

---

## 1. Supported Input Formats & Limits

| Format | Parser | Highlights |
|---|---|---|
| **CSV** (`.csv`) | Polars | Streaming validation, inferred column types, delimiter handling |
| **Excel** (`.xlsx`) | `fastexcel` + Polars | Multi-sheet discovery (each worksheet becomes a logical `DataTable`), ZIP CRC & compression ratio check |
| **JSON** (`.json`) | Polars | JSON arrays & NDJSON object line formats |
| **Parquet** (`.parquet`) | Polars / PyArrow | Direct PAR1 magic-byte validation & normalization |

Default ingestion limits (`services/api/app/core/config.py`):
- `MAX_UPLOAD_SIZE_BYTES = 26,214,400` (25 MB)
- `MAX_DATASET_ROWS = 500,000`
- `MAX_DATASET_COLUMNS = 200`

---

## 2. Processing Stages

1. **Pre-Ingestion Check & Raw Store**: Validates filename sanitization, extension, magic bytes, and size; writes immutable raw artifact (`raw/`) and dispatches background job (`HTTP 202 Accepted` with `job_id`).
2. **Parsing & Identifier Sanitization**: Extracts tables, sanitizes headers into SQL-safe `snake_case`, and resolves duplicate column names deterministically.
3. **Profiling & PII Classification**: Computes `null_count`, `null_percentage`, `unique_count`, numeric quartiles/min/max/mean/stddev, data quality warnings, and heuristic sensitivity tagging (`email`, `phone`, `ssn`, etc.).
4. **Parquet Conversion & Atomic Activation**: Writes Snappy `.parquet` files per logical table, inserts `DataTable` + `DataColumn` rows, and promotes `DatasetVersion` as active.

---

## 3. Dataset Detail Workspace (`DatasetDetailPage.tsx`)

- **Overview**: Status badge, version badge, row/column totals, quality warnings, and sensitive column summary.
- **Tables**: Lists discovered worksheets/tables with row counts and one-click preview triggers.
- **Schema**: Full column ordinal, physical identifier, canonical data type, nullability, and semantic/PII chips.
- **Data Profile**: Visual null-rate / distinct distribution summaries and quality observations.
- **Data Preview**: Server-paginated tabular inspection backed by Parquet slices.
- **Versions**: Immutable version history with `"Upload New Version"` modal.
