"""DataSense API – FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError as SQLAlchemyOperationalError

from app.agents.routers import (
    workflow_routes as agent_workflow_router,
)
from app.agents.services.workflow_service import WorkflowService
from app.ai.routers import (
    ai_routes as ai_router,
)
from app.analytics.routers import (
    query_routes as analytics_router,
)
from app.api.v1 import (
    auth as auth_router,
)
from app.api.v1 import (
    datasets as datasets_router,
)
from app.api.v1 import (
    health as health_router,
)
from app.api.v1 import (
    organizations as organizations_router,
)
from app.api.v1 import (
    projects as projects_router,
)
from app.api.v1.auth import cleanup_expired_auth_sessions
from app.core.config import settings
from app.core.observability import (
    RequestContextMiddleware,
    configure_logging,
    configure_optional_opentelemetry,
    metrics_registry,
    set_shutting_down,
)
from app.core.rate_limit import RateLimitService
from app.core.security_middleware import SecurityHeadersMiddleware
from app.db.session import SessionLocal, engine
from app.ingestion.jobs import recover_interrupted_jobs

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
configure_logging()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: Configuration Check, Crash Recovery, Periodic Hygiene, Graceful Shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate production settings, recover interrupted work, and drain gracefully on exit."""
    set_shutting_down(False)
    settings.validate_production_settings()

    try:
        with SessionLocal() as db:
            recovered = recover_interrupted_jobs(db)
            if recovered > 0:
                logger.info("Recovered %d interrupted ingestion jobs on startup", recovered)
            recovered_runs = WorkflowService.recover_interrupted_agent_runs(db)
            if recovered_runs > 0:
                logger.info("Recovered %d interrupted agent runs on startup", recovered_runs)
            purged_sessions = cleanup_expired_auth_sessions(db)
            purged_buckets = RateLimitService.cleanup_expired_buckets(db)
            if purged_sessions or purged_buckets:
                logger.info(
                    "Startup hygiene purged %d expired sessions and %d rate-limit buckets",
                    purged_sessions,
                    purged_buckets,
                )
    except Exception as exc:
        logger.warning("Startup maintenance check failed: %s", exc)

    yield

    # Graceful shutdown drain
    set_shutting_down(True)
    logger.info("DataSense API shutting down; disposing database connection pool.")
    try:
        engine.dispose()
    except Exception as exc:
        logger.warning("Error disposing database engine during shutdown: %s", exc)


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "DataSense – Autonomous AI Data Analyst API. "
        "Upload datasets, ask natural-language questions, and receive "
        "SQL queries, visualisations, and business-intelligence reports."
    ),
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middlewares (added inside-out so CORSMiddleware is outermost)
# ---------------------------------------------------------------------------
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestContextMiddleware)

allowed_origins = list(settings.cors_origins)
if settings.frontend_url and settings.frontend_url.rstrip("/") not in allowed_origins:
    allowed_origins.append(settings.frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "X-Request-Id",
        "X-Correlation-Id",
        "X-Metrics-Token",
    ],
    expose_headers=["X-Request-Id", "X-Correlation-Id", "Retry-After"],
)

configure_optional_opentelemetry(app)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health_router.router, prefix="/api/v1")
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(organizations_router.router, prefix="/api/v1")
app.include_router(projects_router.router, prefix="/api/v1")
app.include_router(datasets_router.router, prefix="/api/v1")
app.include_router(analytics_router.router, prefix="/api/v1")
app.include_router(ai_router.router, prefix="/api/v1")
app.include_router(agent_workflow_router.router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Global Database Error Handler
# ---------------------------------------------------------------------------
@app.exception_handler(SQLAlchemyOperationalError)
async def db_operational_error_handler(
    request: Request,
    exc: SQLAlchemyOperationalError,
) -> JSONResponse:
    """Handle database connectivity failures gracefully with safe error details."""
    logger.error("Database connection failure on %s %s: %s", request.method, request.url.path, exc)
    metrics_registry.record_recent_error(request.url.path, "DatabaseUnavailable", str(exc))
    detail = (
        "Service temporarily unavailable due to a database connectivity issue."
        if settings.is_production
        else (
            "Database connection failed. Unable to reach the database server. "
            "If running locally, ensure PostgreSQL is running (e.g. 'brew services start postgresql@16') "
            "or configure DATABASE_URL in services/api/.env."
        )
    )
    return JSONResponse(status_code=503, content={"detail": detail})


# ---------------------------------------------------------------------------
# Root redirect / info
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Root landing response."""
    info: dict[str, str] = {
        "message": "DataSense API is running",
        "service": settings.app_name,
        "version": settings.app_version,
        "health": "/api/v1/health",
    }
    if not settings.is_production:
        info["docs"] = "/docs"
    return info
