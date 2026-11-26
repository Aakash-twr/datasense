# Contributing Guide

Contributions, bug fixes, and documentation updates for DataSense follow clear engineering and verification standards.

---

## 1. Local Workflow

1. Create a focused feature or fix branch from `main`.
2. Keep frontend tokens centralized in `apps/web/src/styles/tokens.css` and avoid duplicating shared UI primitives under `apps/web/src/components/ui/`.
3. Preserve strict multi-tenant scoping (`get_authorized_project`, `require_role`) and SQLGlot validation on every new analytical route.
4. Add or update database schema changes strictly through new Alembic revisions under `services/api/alembic/versions/`.
5. Never commit `.env` files, API keys, uploaded datasets, or `.db` files. Ensure any additions to `.env` keys are mirrored in `.env.example` and `.env.production.example` using placeholder values only.

---

## 2. Pre-PR Verification Checklist

Run both suites locally before opening a Pull Request (matching `.github/workflows/ci.yml`):

```bash
# Backend checks
cd services/api
.venv/bin/ruff check app tests
GOOGLE_API_KEY="" .venv/bin/pytest -v

# Frontend checks
cd ../apps/web
npm run type-check
npm run lint
npm test -- --run
npm run build
```
