# Production Configuration & Observability

DataSense enforces fail-closed environment configuration in production and exposes operational health probes and Prometheus-compatible metrics.

---

## 1. Fail-Closed Startup Validation

When `ENVIRONMENT=production` (or `prod`), [`validate_production_settings()`](../../services/api/app/core/config.py) blocks API boot unless all conditions pass:

1. `DEBUG=false`
2. `JWT_SECRET_KEY` is at least 32 characters and does not start with `datasense-development`
3. `COOKIE_SECURE=true` (requires HTTPS)
4. `CORS_ORIGINS` is populated with explicit origins (no `*` wildcard)
5. `DATABASE_URL` targets PostgreSQL (`postgresql+psycopg://...`) rather than SQLite

Generate strong secrets with:
```bash
openssl rand -hex 32
```

---

## 2. Database Connection Pooling

Configured via `services/api/app/db/session.py` and environment variables:
- `DB_POOL_SIZE` (default `5`)
- `DB_MAX_OVERFLOW` (default `10`)
- `DB_POOL_TIMEOUT` (default `30` seconds)
- `DB_POOL_RECYCLE` (default `1800` seconds)

---

## 3. Health Probes & Graceful Shutdown

Defined in [`services/api/app/api/v1/health.py`](../../services/api/app/api/v1/health.py):
- `GET /api/v1/health` — High-level status, service version, and PostgreSQL connectivity.
- `GET /api/v1/health/live` — Lightweight process liveness check (`200 OK`).
- `GET /api/v1/health/ready` — Verifies PostgreSQL (`SELECT 1`), in-memory DuckDB query, writable storage (`DATA_STORAGE_ROOT`), and active non-shutdown state (`503` during graceful shutdown drain).

---

## 4. Structured Logging, Metrics & Admin UI

Implemented in [`services/api/app/core/observability.py`](../../services/api/app/core/observability.py):
- **Correlation IDs**: Every response carries `X-Request-Id` and `X-Correlation-Id`.
- **Log Redaction (`RedactingFilter`)**: Strips `Bearer` tokens, Google AI API key patterns, password fields, and PostgreSQL DSN passwords from logs and recent error summaries.
- **Prometheus Exposition (`GET /api/v1/metrics`)**: Protected by `X-Metrics-Token` (matching `METRICS_TOKEN`) or an authenticated `OWNER`/`ADMIN` bearer JWT. Tracks HTTP request counts/latencies, DuckDB query executions/failures, ingestion errors, rate-limit rejections, Gemini errors, and DB pool checkout count.
- **Admin UI (`/admin/observability`)**: Visualizes live API operational stats for `OWNER` and `ADMIN` roles.
- **Optional OpenTelemetry**: Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` if an OTLP collector is attached.
