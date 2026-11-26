# Release Readiness Checklist

Complete before tagging a release or deploying DataSense to production:

- [ ] `.env.production` populated from [`.env.production.example`](../../.env.production.example) with unique `JWT_SECRET_KEY` (`openssl rand -hex 32`), strong `POSTGRES_PASSWORD`, explicit `CORS_ORIGINS` / `FRONTEND_URL`, `COOKIE_SECURE=true`, and `DEBUG=false`.
- [ ] HTTPS TLS termination verified at the edge proxy / load balancer in front of Nginx and API containers.
- [ ] `alembic upgrade head` completes cleanly on target PostgreSQL instance (current head: `0006_phase7_hardening_indexes`).
- [ ] Backend test & lint checks pass cleanly (`ruff check app tests` and offline `pytest -v`).
- [ ] Frontend verification passes (`npm run type-check`, `npm run lint`, `npm test -- --run`, `npm run build`).
- [ ] Automated backups configured via [`scripts/backup_database.sh`](../../scripts/backup_database.sh) and [`scripts/backup_storage.sh`](../../scripts/backup_storage.sh) and verified with [`scripts/restore_database.sh`](../../scripts/restore_database.sh).
- [ ] Post-deployment smoke script passes (`./scripts/verify_deployment.sh https://your-domain`).
- [ ] Owner/Admin user verifies `/admin/observability` health and `/api/v1/metrics` access controls.
