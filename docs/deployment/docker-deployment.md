# Docker Deployment & CI/CD Guide

Docker manifests under `deployment/` build a rootless FastAPI backend image (`python:3.11-slim`), an Nginx 1.27 Alpine SPA reverse-proxy image, and PostgreSQL 16 service definitions.

---

## 1. Container Artifacts

| File | Responsibility |
|---|---|
| [`deployment/docker/backend.Dockerfile`](../../deployment/docker/backend.Dockerfile) | Non-root user `datasense` (`uid 1000`), executes `alembic upgrade head` then launches `uvicorn app.main:app`, configures `/api/v1/health/live` healthcheck. |
| [`deployment/docker/frontend.Dockerfile`](../../deployment/docker/frontend.Dockerfile) | Multi-stage Node 22 build → Nginx 1.27 Alpine serving static bundle with `/healthz` probe. |
| [`deployment/docker/nginx.conf`](../../deployment/docker/nginx.conf) | Gzip compression, immutable asset caching, CSP / X-Frame-Options / nosniff headers, `client_max_body_size 30m`, and `/api/` proxy to `api:8000`. |
| [`deployment/compose/docker-compose.yml`](../../deployment/compose/docker-compose.yml) | Local container stack exposing UI on `8080` and API on `8000`. |
| [`deployment/compose/docker-compose.prod.yml`](../../deployment/compose/docker-compose.prod.yml) | Production stack enforcing explicit secrets (`POSTGRES_PASSWORD`), `ENVIRONMENT=production`, `COOKIE_SECURE=true`, and structured JSON logging. |

---

## 2. Local Docker Compose Stack

```bash
docker compose -f deployment/compose/docker-compose.yml up --build -d
./scripts/verify_deployment.sh http://127.0.0.1:8000
```

- Access UI at `http://localhost:8080` and API at `http://localhost:8000`.
- Persistent Docker volumes:
  - `datasense_pgdata` (`/var/lib/postgresql/data`)
  - `datasense_storage` (`/var/lib/datasense/storage`)

---

## 3. Production Docker Compose Stack

1. Copy [`.env.production.example`](../../.env.production.example) to `.env.production` and populate strong secrets (`POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `METRICS_TOKEN`), explicit `FRONTEND_URL` & `CORS_ORIGINS`, and optional `GOOGLE_API_KEY`.
2. Deploy behind a TLS-terminating edge proxy (Nginx, Caddy, or cloud ALB):

```bash
docker compose -f deployment/compose/docker-compose.prod.yml up --build -d
./scripts/verify_deployment.sh https://analytics.example.com
```

Resource memory limits (`512m–768m` PostgreSQL, `2g` API/DuckDB, `256m` Nginx) fit comfortably within constrained virtual machines and 8 GB hosts.

---

## 4. Automated CI/CD (`.github/workflows/ci.yml`)

Every push (`main`, `develop`) and PR to `main` executes three jobs:
1. **`backend-test`**: Starts PostgreSQL 16, runs `ruff check app tests`, validates `alembic upgrade head`, and executes offline `pytest -v` (`GOOGLE_API_KEY=""`).
2. **`frontend-test`**: Executes `npm ci`, `tsc --noEmit`, ESLint (`--max-warnings 0`), Vitest, and `vite build`.
3. **`docker-verify`**: Validates `docker-compose.yml` syntax and builds both API and Web images.
