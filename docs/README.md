# DataSense Documentation

Welcome to the technical documentation for **DataSense**, an AI-powered multi-agent data analytics platform combining structured dataset ingestion, DuckDB SQL execution, schema-only Google Gemini AI Copilot, and LangGraph multi-agent orchestration with human-in-the-loop approval.

---

## Core Overviews

- [**Project Audit**](project-audit.md) — Verified inventory of backend, frontend, infrastructure, test coverage, and deferred scope.
- [**System Architecture & Diagrams**](architecture.md) — End-to-end Mermaid diagrams covering system architecture, ingestion, SQL execution, AI Copilot, LangGraph state transitions, and database entities.
- [**Screenshots Index**](screenshots.md) — Visual walkthrough of all captured desktop (`1440×1000`) and mobile (`390×844`) screens.

---

## Documentation Directory

### Getting Started
- [Installation Guide](getting-started/installation.md) — Prerequisites, repository clone, Python/Node dependencies, and PostgreSQL setup.
- [Local Development](getting-started/local-development.md) — Running the FastAPI backend, Vite SPA, demo dataset seeding, and local SQLite mode.
- [Environment Configuration](getting-started/environment-configuration.md) — Complete `.env` variable reference across API, DuckDB, Gemini, and LangGraph bounds.
- [Troubleshooting](getting-started/troubleshooting.md) — Resolving database connection, migration, CORS, Gemini quota, and storage issues.

### Architecture
- [Backend Architecture](architecture/backend-architecture.md) — FastAPI routers, lifespan hooks, rate limiting, and structured observability.
- [Frontend Architecture](architecture/frontend-architecture.md) — React 18 SPA, lazy code splitting, Zustand auth memory model, and design tokens.
- [Database Schema](architecture/database-schema.md) — Full relational model specification across Alembic migrations `0001`–`0006`.
- [Agent Architecture](architecture/agent-architecture.md) — LangGraph `StateGraph` topology, `Send` parallelism, checkpoint persistence, and SHA-256 approval gates.

### Features
- [Authentication & Workspaces](features/authentication.md) — Argon2 hashing, rotating HttpOnly refresh cookies, and multi-tenant organizations.
- [Dataset Ingestion & Profiling](features/dataset-ingestion.md) — CSV, Excel (multi-sheet), JSON, and Parquet normalization, PII heuristics, and versioning.
- [SQL Analytics Workspace](features/sql-analytics.md) — CodeMirror SQL studio, SQLGlot AST gating, DuckDB execution, history, and saved queries.
- [AI Analytics Copilot](features/ai-copilot.md) — Conversational natural-language-to-SQL with repair, explanations, and follow-up insights.
- [Multi-Agent Workflows](features/multi-agent-workflows.md) — 7 analytical modes, 8 specialized agents, execution timelines, and SQL approval gates.
- [Reporting & Exports](features/reporting.md) — 11-section evidence-backed analytical documents, Recharts charts, and Markdown/print exports.

### Security & Governance
- [Security Overview](security/security-overview.md) — Consolidated threat model, hardening checklist, security headers, and session hygiene.
- [SQL Safety](security/sql-safety.md) — SQLGlot AST validation rules, allowlists, DuckDB hardware sandbox, and query limits.
- [AI Data Privacy](security/ai-privacy.md) — Privacy disclosure consent, schema-only LLM context, and aggregate opt-in rules.
- [Multi-Tenant Authorization](security/authorization.md) — `OWNER`, `ADMIN`, `ANALYST`, and `VIEWER` RBAC matrix and cross-tenant isolation.

### Deployment & Operations
- [Docker Deployment](deployment/docker-deployment.md) — Docker Compose local/production stacks, Nginx proxy, health probes, and CI/CD.
- [Production Configuration](deployment/production-configuration.md) — Fail-closed production checks, secret generation, pooling, and Prometheus metrics.
- [Backup & Restore](deployment/backup-and-restore.md) — Automated PostgreSQL/SQLite backups, storage archival, and startup crash recovery.

### Development
- [Testing & Benchmarks](development/testing.md) — Automated pytest, Vitest, lint, type-check, and Apple M1 local benchmark results.
- [Contributing](development/contributing.md) — Code standards, migration rules, branch workflow, and PR verification expectations.
- [Release Process](development/release-process.md) — Pre-release hardening checklist and smoke verification steps.
- [Known Limitations](development/known-limitations.md) — Documented operational constraints and deferred scaling extensions.
