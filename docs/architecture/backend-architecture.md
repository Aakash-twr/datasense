# Backend Architecture

The DataSense API service (`services/api`) is a modular FastAPI application structured around domain boundaries (`api/v1`, `ingestion`, `analytics`, `ai`, `agents`, `core`, `db`, `models`, `schemas`).

---

## 1. Request Lifecycle & Middleware Stack

Configured in [`services/api/app/main.py`](../../services/api/app/main.py):

1. **CORSMiddleware** (outermost): Explicit allowed origins (`CORS_ORIGINS`, `FRONTEND_URL`), credentials enabled, explicit allowed methods & headers (`Authorization`, `Content-Type`, `X-Organization-Id`, `X-Requested-With`, `X-Request-Id`, `X-Correlation-Id`, `X-Metrics-Token`).
2. **RequestContextMiddleware**: Attaches `X-Request-Id` / `X-Correlation-Id` contextvars and records latency/error counts for `/api/v1/metrics`.
3. **SecurityHeadersMiddleware**: Injects `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP, and optional `Strict-Transport-Security`.

---

## 2. Startup & Shutdown Lifespan

Inside `@asynccontextmanager async def lifespan(app: FastAPI)`:
- Resets shutdown flag (`set_shutting_down(False)`).
- Calls `settings.validate_production_settings()` (fail-closed in `production`).
- Recovers interrupted ingestion jobs (`recover_interrupted_jobs`) and LangGraph runs (`WorkflowService.recover_interrupted_agent_runs`).
- Purges expired `auth_sessions` and `rate_limit_buckets`.
- On shutdown: flips `set_shutting_down(True)` so `/health/ready` returns `503`, then disposes SQLAlchemy engine pools.

---

## 3. Domain Subsystems

- **Authentication & RBAC (`app/api/v1/auth.py`, `app/api/deps.py`)**: Dependency injection verifies Bearer JWTs, resolves active organization context, verifies `organization_id` ownership on every project/dataset lookup, and checks `MembershipRole`.
- **Ingestion (`app/ingestion/`)**: Asynchronous FastAPI `BackgroundTasks` parse uploads (`Polars` / `fastexcel`), normalize column identifiers, infer types, compute column statistics, flag PII hints, and write Snappy Parquet to `LocalStorageService`.
- **SQL Analytics (`app/analytics/`)**: Validates SQL via SQLGlot AST parser (`QueryValidator`) and executes read-only Parquet views in an isolated in-memory DuckDB instance (`DuckDBEngine` + `QueryExecutor`).
- **AI Copilot (`app/ai/`)**: Builds bounded schema-only text context (`ContextService`) and drives `ChatGoogleGenerativeAI` (`LLMFactory`) with structured Pydantic outputs and single-pass AST repair.
- **Multi-Agent (`app/agents/`)**: Compiles the LangGraph `StateGraph` (`builder.py` / `graph.py`), binds `PostgresSaver` or `SqliteSaver` checkpoints (`CheckpointService`), enforces human SQL approval (`approval_node.py`), computes Polars summary stats (`StatisticalService`), and compiles 11-section BI reports.
