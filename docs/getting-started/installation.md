# Installation Guide

This guide covers cloning DataSense and installing Python, Node.js, and PostgreSQL prerequisites on macOS (Apple Silicon / Intel) and Linux.

---

## 1. Prerequisites

| Dependency | Minimum Version | Verification Command |
|---|---|---|
| Python | `3.11+` | `python3 --version` |
| Node.js | `20+` (`22` used in CI) | `node --version && npm --version` |
| PostgreSQL | `14+` (`16` in Docker Compose / CI) | `psql --version` (optional if running local SQLite dev mode) |
| Docker / Compose | Modern CLI with `compose` v2 | `docker --version && docker compose version` (optional for local dev) |

---

## 2. Clone & Environment Precheck

```bash
git clone https://github.com/Aakash-Twr/datasense.git
cd datasense
python3 scripts/check_environment.py
```

---

## 3. Backend Dependencies (`services/api`)

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

Key installed runtime dependencies (defined in [`services/api/pyproject.toml`](../../services/api/pyproject.toml)):
- **API & ORM**: `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `alembic`, `psycopg[binary]`, `psycopg-pool`, `pydantic-settings`
- **Security**: `pwdlib[argon2]`, `pyjwt[crypto]`
- **Analytics**: `polars`, `pyarrow`, `fastexcel`, `duckdb`, `sqlglot`
- **AI & Orchestration**: `langchain-core`, `langchain-google-genai`, `langgraph`, `langgraph-checkpoint-sqlite`, `langgraph-checkpoint-postgres`

---

## 4. PostgreSQL Setup (Optional Locally, Mandatory in Production)

Create a local database role and schema matching `.env.example`:

```bash
psql postgres -c "CREATE USER datasense_user WITH PASSWORD 'your_secure_password';"
psql postgres -c "CREATE DATABASE datasense OWNER datasense_user;"
```

Copy the environment template and apply Alembic migrations:

```bash
cd services/api
cp .env.example .env
# Update DATABASE_URL in services/api/.env if using PostgreSQL, or sqlite:///./datasense_dev.db for lightweight dev
alembic upgrade head
```

---

## 5. Frontend Dependencies (`apps/web`)

```bash
cd apps/web
npm install
```

Next: proceed to [Local Development](local-development.md) or [Environment Configuration](environment-configuration.md).
