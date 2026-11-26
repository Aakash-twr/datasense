# Environment Configuration

Configuration is loaded by Pydantic `BaseSettings` in [`services/api/app/core/config.py`](../../services/api/app/core/config.py), reading `.env` and `services/api/.env`. Never commit `.env` or place live keys in `.env.example`.

---

## 1. Core Application & Security Variables

| Variable | Default / Example | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Set to `production` to enforce fail-closed startup checks. |
| `DEBUG` | `false` | Enables/disables debug mode (blocked in production). |
| `DATABASE_URL` | `postgresql+psycopg://...` | PostgreSQL DSN or local SQLite path (`sqlite:///./datasense_dev.db`). |
| `JWT_SECRET_KEY` | Strong 32+ char string | Signs HS256 access tokens (`openssl rand -hex 32`). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Short-lived access JWT lifetime. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Rotating refresh session TTL in `auth_sessions`. |
| `COOKIE_SECURE` | `false` (dev) / `true` (prod) | Require HTTPS for HttpOnly refresh cookies. |
| `FRONTEND_URL` & `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origin(s); wildcard `*` rejected in production. |

---

## 2. Storage & DuckDB Engine Bounds

| Variable | Default | Purpose |
|---|---|---|
| `DATA_STORAGE_ROOT` | `.local_storage/datasense` | Root directory for immutable raw uploads, Parquet files & artifacts. |
| `MAX_UPLOAD_SIZE_BYTES` | `26214400` (25 MB) | Hard ceiling for file uploads. |
| `MAX_DATASET_ROWS` | `500000` | Maximum parsed rows per table during ingestion. |
| `MAX_DATASET_COLUMNS` | `200` | Maximum column count per table. |
| `DUCKDB_MEMORY_LIMIT` | `512MB` | Memory ceiling enforced on every DuckDB sandbox connection. |
| `DUCKDB_THREADS` | `2` | Worker threads per analytical connection. |
| `DUCKDB_QUERY_TIMEOUT_SECONDS` | `30` | Maximum query execution timeout. |
| `DUCKDB_MAX_RESULT_ROWS` | `2000` | Row cap returned by API responses. |
| `DUCKDB_MAX_CONCURRENT_QUERIES` | `2` | Concurrency guard preventing engine starvation. |

---

## 3. Gemini AI & LangGraph Workflow Controls

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | *(empty offline)* | Google Gemini API key; when empty, AI routes stay offline cleanly. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Target Gemini chat model via `langchain-google-genai`. |
| `GEMINI_TEMPERATURE` | `0.1` | Low temperature for deterministic SQL generation. |
| `AI_ENABLED` | `true` | Global feature toggle for AI Copilot endpoints. |
| `AGENT_WORKFLOWS_ENABLED` | `true` | Global feature toggle for LangGraph multi-agent runs. |
| `AGENT_MAX_STEPS` | `15` | Recursion/step ceiling per workflow run. |
| `AGENT_MAX_LLM_CALLS` | `8` | Per-run cap on Gemini model calls. |
| `AGENT_MAX_SQL_QUERIES` | `5` | Maximum SQL drafts per run. |
| `AGENT_WORKFLOW_TIMEOUT_SECONDS` | `180` | Asynchronous run timeout bound. |
| `AGENT_MAX_PARALLEL_TASKS` | `2` | Max parallel `Send` branches in `StateGraph`. |
| `AGENT_RESULT_CACHE_TTL_SECONDS` | `900` | Expiration window for stored query result artifacts. |

---

## 4. Rate Limiting & Observability

| Variable | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Enables SQL-backed `RateLimitService` checks. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `20` | Auth route ceiling per client/IP bucket. |
| `RATE_LIMIT_UPLOAD_PER_MINUTE` | `15` | Upload ceiling per minute. |
| `RATE_LIMIT_QUERY_PER_MINUTE` | `40` | DuckDB execution ceiling per minute. |
| `RATE_LIMIT_AI_PER_MINUTE` | `12` | Copilot prompt ceiling per minute. |
| `RATE_LIMIT_AGENT_PER_MINUTE` | `8` | Agent workflow start ceiling per minute. |
| `STRUCTURED_LOGGING` | `false` / `true` | Enables JSON structured stdout logs with secret redaction. |
| `METRICS_TOKEN` | *(optional)* | Static bearer / `X-Metrics-Token` secret for `/api/v1/metrics` scraping. |
| `OTEL_ENABLED` | `false` | Optional OpenTelemetry instrumentation hook. |

See [Production Configuration](../deployment/production-configuration.md) for fail-closed production rules.
