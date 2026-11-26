# DataSense System Architecture & Diagrams

This document details DataSense's runtime architecture, asynchronous ingestion pipeline, sandboxed SQL engine, schema-only AI Copilot flow, LangGraph multi-agent orchestration topology, and verified PostgreSQL/SQLAlchemy data model.

---

## A. High-Level System Architecture

DataSense cleanly separates presentation (`apps/web`), API orchestration (`services/api`), persistent relational metadata (`PostgreSQL`), analytical Parquet storage (`LocalStorageService`), zero-copy query execution (`DuckDB` + `SQLGlot`), and stateful LLM workflows (`LangChain` + `LangGraph`).

```mermaid
flowchart TB
    User["User Browser (React 18 + TypeScript)"]
    Nginx["Nginx Reverse Proxy / SPA Host"]
    FastAPI["FastAPI Application (/api/v1)"]
    Guard["SecurityHeaders, RequestContext, RBAC & RateLimitService"]
    Auth["Argon2 + HS256 JWT + HttpOnly Refresh Sessions"]
    Ingestion["Polars Ingestion, Profiling & PII Classifier"]
    Storage[("Local / Persistent Storage\nRaw + Snappy Parquet + Artifacts")]
    DB[("PostgreSQL 14+\nMetadata, History, Runs & Reports")]
    SQLGlot["SQLGlot AST Safety Gate\n(SELECT-only, Catalog-Scoped)"]
    DuckDB["DuckDB Analytical Engine\n(enable_external_access = false)"]
    AICopilot["AI Copilot Services\n(Schema-Only Context + Repair)"]
    LangChain["LangChain ChatGoogleGenerativeAI"]
    Gemini["Google Gemini API"]
    LangGraph["LangGraph StateGraph\n(8 Agents + Human Approval Interrupt)"]
    Ckpt[("Durable Checkpointer\nPostgresSaver / SqliteSaver")]

    User -->|"HTTPS / REST JSON"| Nginx
    Nginx -->|"/api/*"| FastAPI
    FastAPI --> Guard
    Guard --> Auth
    Auth --> DB
    FastAPI -->|"Async BackgroundTasks"| Ingestion
    Ingestion -->|"Raw & Normalized Parquet"| Storage
    Ingestion -->|"Tables, Columns & Profiles"| DB
    FastAPI --> SQLGlot
    SQLGlot -->|"Validated AST"| DuckDB
    DuckDB -->|"Zero-Copy PyArrow Scan"| Storage
    DuckDB -->|"Telemetry & Audit Logs"| DB
    FastAPI --> AICopilot
    AICopilot -->|"Metadata Schema Only"| LangChain
    LangChain --> Gemini
    AICopilot -->|"Draft Validation"| SQLGlot
    FastAPI --> LangGraph
    LangGraph -->|"Planning & Insights"| LangChain
    LangGraph -->|"Validated Execution"| SQLGlot
    LangGraph -->|"Pause / Resume State"| Ckpt
    LangGraph -->|"Runs, Evidence & 11-Section Reports"| DB
```

---

## B. Dataset Ingestion Flow

Uploaded files are authenticated, checked against file size limits (`MAX_UPLOAD_SIZE_BYTES = 25 MB`) and magic byte signatures, written to immutable version directories, and processed asynchronously into normalized Snappy Parquet tables with statistical profiles and PII flags.

```mermaid
flowchart LR
    Upload["File Upload\n(CSV, XLSX, JSON, Parquet)"] --> AuthCheck["Auth, Project Ownership & RBAC\n(Owner / Admin / Analyst)"]
    AuthCheck --> Validate["Validate Extension,\nMagic Bytes & XLSX Zip Safety"]
    Validate --> StoreRaw["Persist Original File &\nRegister Pending Version + Job (202)"]
    StoreRaw --> Parse["Background Worker:\nParse via Polars / fastexcel\n(Multi-Sheet Excel Support)"]
    Parse --> Normalize["Sanitize Identifiers\n(snake_case) & Check Limits"]
    Normalize --> Profile["Compute Stats, Quality Warnings\n& Heuristic PII Tags"]
    Profile --> Parquet["Convert Each Table\nto Snappy Parquet"]
    Parquet --> MetaDB["Register DataTable &\nDataColumn Metadata"]
    MetaDB --> Ready["Dataset Ready\n(Active Version Assigned)"]
```

---

## C. SQL Execution Flow

Every analytical query—whether handwritten in CodeMirror SQL Studio, suggested by AI Copilot, or approved within a Multi-Agent workflow—must pass through strict multi-tenant catalog scoping and AST validation before touching DuckDB.

```mermaid
flowchart TD
    Req["User SQL Execution Request"] --> Auth["Verify Bearer JWT &\nOrganization Membership"]
    Auth --> RBAC["Enforce Project Access &\nRole (Owner / Admin / Analyst)"]
    RBAC --> Rate["PostgreSQL/SQLite Sliding-Window\nRateLimitService Check"]
    Rate --> Catalog["Resolve Ready Project Datasets &\nNormalized Qualified Table Names"]
    Catalog --> AST{"SQLGlot AST Gate\nSingle SELECT / CTE Only?\nNo DDL, DML, or read_* Functions?"}
    AST -- "Rejected" --> Err400["Return 400 Bad Request\n(Zero Engine Execution)"]
    AST -- "Approved AST" --> Sandbox["Open Isolated In-Memory DuckDB\nAttach Project Parquet Views\nenable_external_access = false"]
    Sandbox --> Exec["Execute Under Query Timeout,\nMemory Limit & Concurrency Lock"]
    Exec --> Persist["Record Telemetry & Status\nin query_runs Table"]
    Persist --> Return["Return Bounded Rows\n(<= DUCKDB_MAX_RESULT_ROWS)"]
```

---

## D. AI Copilot Flow

By default, DataSense **never sends raw customer rows** to external LLM APIs. `ContextService` extracts strictly bounded metadata (dataset names, table names, column types, nullability, and sensitive PII tags) for Gemini SQL drafting, followed by deterministic SQLGlot verification and one optional AST repair attempt.

```mermaid
flowchart LR
    Prompt["Natural Language Question"] --> Privacy{"User Acknowledged\nAI Privacy Notice?"}
    Privacy -- "No" --> Gate["403 Privacy Disclosure\nModal Prompt"]
    Privacy -- "Yes" --> Context["ContextService:\nSchema Metadata Only\n(Zero Raw Rows)"]
    Context --> Gemini["Gemini API via LangChain\nStructured Output Draft"]
    Gemini --> CheckAST{"SQLGlot AST\nValidation"}
    CheckAST -- "Syntax / Scope Error" --> Repair["Single Controlled Repair Pass\nWith Specific AST Error"]
    Repair --> FinalCheck{"Valid?"}
    FinalCheck -- "No" --> Warn["Return Clarification /\nScope Notice"]
    CheckAST -- "Valid" --> DraftCard["Present Validated SQL Draft Card\n& Plain-English Explanation"]
    FinalCheck -- "Yes" --> DraftCard
    DraftCard --> UserAction["User Clicks 'Run Query'\nor 'Open in SQL Editor'"]
    UserAction --> Duck["Re-Validate & Execute\nin Sandboxed DuckDB"]
    Duck --> Output["Render Bounded Table &\nCharts in Workspace"]
```

---

## E. Multi-Agent LangGraph Workflow

Compiled in `services/api/app/agents/graph.py`, the LangGraph `StateGraph` orchestrates specialized nodes, fan-out `Send` branches for independent metadata discovery and quality auditing, a mandatory SHA-256 bound human approval `interrupt()`, durable checkpoint persistence, deterministic Polars statistical analysis, Recharts specification generation, and 11-section executive reporting.

```mermaid
flowchart TD
    Start((START)) --> Context["context_loader\nLoad Authorized Catalog & Versions"]
    Context --> Supervisor["supervisor\nClassify Workflow Mode & Plan Steps"]

    Supervisor -->|"Parallel Send (max_parallel)"| Discovery["discovery\nTables, Measures, Joins & PII"]
    Supervisor -->|"Parallel Send (max_parallel)"| Quality["quality\nCompleteness, Nulls & Anomalies"]
    Supervisor -.->|"Direct when Prep Skipped"| SQLAnalyst

    Discovery --> Barrier["prep_barrier\nConverge Prep Branches"]
    Quality --> Barrier

    Barrier --> SQLAnalyst["sql_analyst\nDraft Analytical DuckDB SQL"]
    SQLAnalyst --> Validator["sql_validation\nVerify ASTs & Compute\nSHA-256 Approval Hash"]

    Validator -->|"approval_required = true"| Approval{{"human_approval\nLangGraph interrupt()\nDurable Checkpoint Saved"}}
    Validator -.->|"Read-Only / No SQL Modes"| Insight

    Approval -->|"Command(resume: rejected)"| Finalize["finalize\nPersist Outcome & Step Logs"]
    Approval -->|"Command(resume: approved)\nHash & Version Snapshot Verified"| Exec["execution\nRun Approved Queries in DuckDB\nSave Bounded Result Artifacts"]

    Exec --> Stats["statistical\nDeterministic Polars Metrics,\nRankings & IQR Outliers"]
    Stats --> Viz["visualization\nGenerate Grounded Recharts\nChart Specifications"]
    Viz --> Insight["insight\nEvidence-Backed Business Findings"]
    Insight --> Report["report\nCompile 11-Section JSON\n& Downloadable Markdown"]
    Report --> Finalize
    Finalize --> Done((END))
```

---

## F. Database Entity Relationship Diagram

All core PostgreSQL tables use UUID v4 primary keys and timezone-aware UTC timestamps (`TimestampMixin`). Foreign-key relationships below match the verified SQLAlchemy ORM models under `services/api/app/models/`.

```mermaid
erDiagram
    USERS ||--o{ ORGANIZATIONS : "owns"
    USERS ||--o{ MEMBERSHIPS : "belongs_to"
    ORGANIZATIONS ||--o{ MEMBERSHIPS : "has"
    USERS ||--o{ AUTH_SESSIONS : "holds"

    ORGANIZATIONS ||--o{ PROJECTS : "contains"
    USERS ||--o{ PROJECTS : "creates"

    PROJECTS ||--o{ DATASETS : "contains"
    USERS ||--o{ DATASETS : "creates"
    DATASETS ||--o{ DATASET_VERSIONS : "has_versions"
    DATASET_VERSIONS ||--o{ DATA_TABLES : "defines_tables"
    DATA_TABLES ||--o{ DATA_COLUMNS : "defines_columns"

    PROJECTS ||--o{ INGESTION_JOBS : "tracks"
    DATASETS ||--o{ INGESTION_JOBS : "processes"

    ORGANIZATIONS ||--o{ QUERY_RUNS : "scopes"
    PROJECTS ||--o{ QUERY_RUNS : "executes"
    USERS ||--o{ QUERY_RUNS : "runs"

    PROJECTS ||--o{ SAVED_QUERIES : "stores"
    USERS ||--o{ SAVED_QUERIES : "authors"

    PROJECTS ||--o{ AI_CONVERSATIONS : "contains"
    USERS ||--o{ AI_CONVERSATIONS : "initiates"
    AI_CONVERSATIONS ||--o{ AI_MESSAGES : "contains"

    PROJECTS ||--o{ AGENT_RUNS : "orchestrates"
    USERS ||--o{ AGENT_RUNS : "triggers"
    AI_CONVERSATIONS ||--o{ AGENT_RUNS : "links_to"
    AGENT_RUNS ||--o{ AGENT_RUN_STEPS : "logs"
    AGENT_RUNS ||--o{ AGENT_RUN_EVIDENCE : "cites"
    QUERY_RUNS ||--o{ AGENT_RUN_EVIDENCE : "verifies"
    AGENT_RUNS ||--o{ ANALYSIS_REPORTS : "generates"
    PROJECTS ||--o{ ANALYSIS_REPORTS : "persists"

    USERS {
        uuid id PK
        string email UK
        string name
        string password_hash
        boolean is_active
        timestamptz ai_privacy_acknowledged_at
    }
    ORGANIZATIONS {
        uuid id PK
        string name
        string slug UK
        uuid owner_id FK
    }
    MEMBERSHIPS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        enum role
    }
    AUTH_SESSIONS {
        uuid id PK
        uuid user_id FK
        string refresh_token_hash UK
        timestamptz expires_at
        timestamptz revoked_at
    }
    PROJECTS {
        uuid id PK
        uuid organization_id FK
        uuid created_by FK
        string name
        timestamptz archived_at
    }
    DATASETS {
        uuid id PK
        uuid project_id FK
        uuid active_version_id
        string name
        enum status
    }
    DATASET_VERSIONS {
        uuid id PK
        uuid dataset_id FK
        int version_number
        string source_format
        int total_row_count
    }
    DATA_TABLES {
        uuid id PK
        uuid dataset_version_id FK
        string table_name
        bigint row_count
        int column_count
    }
    DATA_COLUMNS {
        uuid id PK
        uuid data_table_id FK
        string column_name
        string data_type
        string pii_category
    }
    INGESTION_JOBS {
        uuid id PK
        uuid dataset_id FK
        enum status
        int progress_percentage
    }
    QUERY_RUNS {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        text sql_query
        float execution_time_ms
    }
    SAVED_QUERIES {
        uuid id PK
        uuid project_id FK
        string name
        text sql_query
    }
    AI_CONVERSATIONS {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string title
    }
    AI_MESSAGES {
        uuid id PK
        uuid conversation_id FK
        string role
        text generated_sql
        string sql_validation_status
    }
    AGENT_RUNS {
        uuid id PK
        uuid project_id FK
        string thread_id UK
        string workflow_type
        string status
        string approval_hash
    }
    AGENT_RUN_STEPS {
        uuid id PK
        uuid agent_run_id FK
        string agent_name
        string status
        int sequence_order
    }
    AGENT_RUN_EVIDENCE {
        uuid id PK
        uuid agent_run_id FK
        uuid query_run_id FK
        string evidence_type
    }
    ANALYSIS_REPORTS {
        uuid id PK
        uuid project_id FK
        uuid agent_run_id FK
        string title
    }
```

> **Note**: Standalone rate-limiting state is persisted in `rate_limit_buckets` (`key PK`, `window_start`, `count`, `expires_at`), and LangGraph checkpoint serialization stores graph resume state inside `PostgresSaver` / `SqliteSaver` tables keyed by opaque `thread_id`.

For table-by-table column specifications, see [Database Schema Reference](architecture/database-schema.md).
