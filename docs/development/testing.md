# Testing & Benchmarks

DataSense validates backend logic, security boundaries, frontend UI components, static types, and local throughput automatically.

---

## 1. Backend Verification (`services/api`)

```bash
cd services/api
.venv/bin/ruff check app tests
GOOGLE_API_KEY="" .venv/bin/pytest -v
```

### Verified Test Suites (104 Passing Tests)
- `tests/test_auth.py` — Registration, Argon2 verification, JWT claims, refresh rotation, logout.
- `tests/test_authorization.py` — Multi-tenant org isolation and role permissions (`owner`, `admin`, `analyst`, `viewer`).
- `tests/test_database.py` — SQLAlchemy relationships and constraints.
- `tests/test_health.py` — `/health`, `/health/live`, `/health/ready`.
- `tests/test_validation_and_storage.py` — Magic bytes, file ceilings, traversal/symlink rejection.
- `tests/test_parsers_and_profiling.py` — CSV/JSON/Parquet parsing, column normalization, stats, PII heuristics.
- `tests/test_dataset_api.py` — End-to-end async dataset ingestion, schema, profile, preview & versions.
- `tests/test_analytics.py` — SQLGlot AST blocking, DuckDB execution (`enable_external_access=false`), history & saved queries.
- `tests/test_ai_copilot.py` — `LLMFactory` mocks, schema-only context privacy, SQL repair, conversation lifecycle.
- `tests/test_multi_agent.py` — LangGraph topology, SHA-256 approval binding, version drift rejection, `CheckpointService` persistence, stats & reports.
- `tests/test_security_and_hardening.py` — Fail-closed prod config, session-family revocation on refresh replay, CSRF origin checks, DB rate limiter (`429`), RBAC write blocks, log redaction, E2E journey.

---

## 2. Frontend Verification (`apps/web`)

```bash
cd apps/web
npm test -- --run
npm run type-check
npm run lint
npm run build
```

### Latest Verified Run
- **Vitest (`vitest run --run`)**: **16 test files passed, 65 tests passed** (`jsdom` + mocked `apiService` / `authStore`) covering `App`, `Auth`, `LoginRedesign`, `DesignSystemAndShell`, `Projects`, `Datasets`, `Analytics`, `AICopilot`, `MultiAgent`, `Stage2Pages`–`Stage7Polish`, and `Phase7Polish`.
- **TypeScript (`tsc --noEmit`)**: 0 errors.
- **ESLint (`eslint . --report-unused-disable-directives --max-warnings 0`)**: 0 errors, 0 warnings.
- **Production Build (`vite build`)**: Route-lazy chunk compilation succeeded in `3.74s` cleanly.

---

## 3. Local Performance Benchmark (`scripts/benchmark_api.py`)

Measured on Apple M1 (8 GB RAM, Python 3.13.2) via FastAPI `TestClient` + temporary filesystem storage across a **10,000-row** synthetic CSV (~400 KB):
- **End-to-End Ingestion** (upload → Polars parse → profile → Snappy Parquet): **44.86 ms**
- **`GET /api/v1/health/live`** (30 requests): min **1.03 ms**, p50 **1.14 ms**, p95 **1.45 ms**
- **`POST /api/v1/projects/{id}/query/execute`** (DuckDB `GROUP BY`, 25 requests): min **21.27 ms**, p50 **22.31 ms**, p95 **23.19 ms**
- **Peak RSS Memory**: **334.70 MB**

*(Note: Single-process SQLite benchmark numbers exclude Docker/PostgreSQL container network latency.)*
