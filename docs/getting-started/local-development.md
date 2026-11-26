# Local Development Guide

Run the FastAPI API and Vite React frontend side by side for local development.

---

## 1. Generate Sample Datasets (Optional)

Run the demo seed helper to generate synthetic CSV datasets (`retail_sales_2026.csv` and `customer_segments.csv`) under `data/demo/`:

```bash
python3 scripts/seed_demo_data.py
```

---

## 2. Start Backend API (`services/api`)

Ensure `services/api/.env` exists (`cp services/api/.env.example services/api/.env`) and migrations are up to date:

```bash
cd services/api
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Verify health endpoints:
- `http://127.0.0.1:8000/api/v1/health`
- Interactive OpenAPI docs (non-production only): `http://127.0.0.1:8000/docs`

---

## 3. Start Frontend Dev Server (`apps/web`)

```bash
cd apps/web
npm run dev
```

Open `http://localhost:5173`. `apps/web/vite.config.ts` proxies `/api/*` requests directly to `http://127.0.0.1:8000` so authentication cookies and API calls share the same origin cleanly.

---

## 4. Verify Code Quality Before Committing

```bash
# Backend lint + offline pytest suite
cd services/api
.venv/bin/ruff check app tests
GOOGLE_API_KEY="" .venv/bin/pytest -v

# Frontend type-check, lint, Vitest & Vite build
cd ../apps/web
npm run type-check
npm run lint
npm test -- --run
npm run build
```

Related: [Environment Configuration](environment-configuration.md) · [Troubleshooting](troubleshooting.md) · [Testing Guide](../development/testing.md).
