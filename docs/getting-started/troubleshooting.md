# Troubleshooting Guide

Common setup, runtime, database, and AI integration issues and their verified resolutions.

---

## 1. Backend Cannot Connect to PostgreSQL

**Symptom:** `503 Service Unavailable` or startup log: `"Database connection failed. Unable to reach the database server."`

**Fixes:**
- Verify PostgreSQL is running locally (`brew services start postgresql@16` on macOS or `docker compose up -d postgres`).
- Check `DATABASE_URL` in `services/api/.env`.
- For lightweight local development without PostgreSQL, set `DATABASE_URL=sqlite:///./datasense_dev.db` inside `services/api/.env` and run `.venv/bin/alembic upgrade head`.

---

## 2. Missing Tables or Schema Drift

**Symptom:** `OperationalError: no such table` or `ProgrammingError: relation does not exist`.

**Fix:**
```bash
cd services/api
.venv/bin/alembic upgrade head
```

---

## 3. Production Refuses to Start (`ValueError: Invalid production configuration`)

**Cause:** `Settings.validate_production_settings()` fails closed when `ENVIRONMENT=production` has unsafe defaults.

**Fix:** Ensure `services/api/.env` (or container env) satisfies:
- `DEBUG=false`
- `JWT_SECRET_KEY` is at least 32 chars and not prefixed with `datasense-development`
- `COOKIE_SECURE=true`
- `CORS_ORIGINS` lists explicit HTTPS origins without `*`
- `DATABASE_URL` uses `postgresql+psycopg://...` (not SQLite)

---

## 4. AI Copilot Reports `"Google Gemini API key is not set"` or `429 Quota Exceeded`

**Fixes:**
- Set `GOOGLE_API_KEY` in `services/api/.env` and restart Uvicorn.
- If a model name was deprecated upstream, update `GEMINI_MODEL` in `services/api/.env` (default `gemini-3.5-flash`).
- If Gemini quota limits return HTTP 429, wait for quota replenishment; SQL Analytics Studio, dataset profiling, and dashboards continue working offline.

---

## 5. Refresh Cookies Rejected (`403 CSRF check failed`)

**Cause:** `verify_cookie_csrf` rejects mismatched `Origin` / `Referer` headers or missing `X-Requested-With` custom headers in production.

**Fix:** Ensure `FRONTEND_URL` and `CORS_ORIGINS` match the exact origin domain served by Nginx (`http://localhost:8080` or `https://your-domain`). Serving API and web on the same domain via `deployment/docker/nginx.conf` eliminates cross-origin cookie issues.

---

## 6. Dataset Schema or Preview Shows Processing Error

- Check `MAX_UPLOAD_SIZE_BYTES` (`25 MB`) and `MAX_DATASET_ROWS` (`500,000`).
- Ensure the uploaded file extension (`.csv`, `.xlsx`, `.json`, `.parquet`) matches actual file magic bytes.
- Verify the active account role (`OWNER`, `ADMIN`, or `ANALYST`; `VIEWER` accounts cannot upload datasets or run SQL).
