# Known Limitations & Deferred Scope

Documented operational constraints verified against the current DataSense codebase:

1. **Google Gemini Quotas & Offline Mode**: Live natural-language AI Copilot synthesis and LLM-guided Multi-Agent workflows require a configured `GOOGLE_API_KEY`. When omitted or rate-limited (`429`), AI routes surface clear guidance while deterministic dataset ingestion, SQL Studio, and DuckDB remain operational offline.
2. **Per-Worker Metrics Aggregation**: In-process Prometheus counters exposed via `/api/v1/metrics` and `/admin/observability` track per-worker process state rather than cross-replica storage. Multi-worker deployments should scrape each instance with Prometheus or configure `OTEL_ENABLED=true`.
3. **Database-Backed Rate Limiting Scope**: `RateLimitService` persists sliding buckets in `rate_limit_buckets` (`PostgreSQL` / `SQLite`) to avoid mandatory Redis dependencies. High-throughput public internet ingress should layer edge rate limiting in Nginx/CDN/WAF.
4. **POSIX Local File Storage**: `LocalStorageService` relies on local or bind-mounted filesystems (`DATA_STORAGE_ROOT`). Horizontally scaling stateless API nodes requires adding an S3-compatible `StorageService` driver.
5. **Authentication Flows**: Supported identity mechanisms cover email/password registration, login, Argon2 verification, and HttpOnly refresh rotation. Self-service email password reset ("Forgot Password") and enterprise OIDC/SAML SSO are deferred scope and intentionally absent from the UI.
6. **Live Docker Container Run Outside CI**: Container Dockerfiles and Compose configs (`deployment/compose/docker-compose.yml` & `docker-compose.prod.yml`) are validated syntactically; full runtime container execution should be tested cleanly on hosts with active Docker daemons and registry connectivity.
7. **License Pending**: No open-source `LICENSE` file has been selected yet.
