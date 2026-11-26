"""Health, readiness, Prometheus metrics, and Admin operational observability endpoints."""

from __future__ import annotations

import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

import duckdb
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import (
    OrganizationContext,
    get_db,
    require_role,
)
from app.core.config import settings
from app.core.observability import is_shutting_down, metrics_registry
from app.core.security import decode_access_token
from app.db.session import engine, get_pool_stats
from app.models.agent_run import AgentRun
from app.models.ingestion_job import IngestionJob
from app.models.membership import Membership, MembershipRole

router = APIRouter()
_optional_bearer = HTTPBearer(auto_error=False)


class HealthResponse(BaseModel):
    """Schema for the health-check response."""

    status: str
    service: str
    version: str
    environment: str
    timestamp: str
    python_version: str
    database: str = "ok"


class ReadinessResponse(BaseModel):
    """Detailed readiness probe response."""

    ready: bool
    shutting_down: bool
    checks: dict[str, str]
    timestamp: str


def _check_database() -> str:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:
        return f"unavailable: {exc.__class__.__name__}"


def _check_duckdb() -> str:
    try:
        conn = duckdb.connect(database=":memory:")
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return "ok"
    except Exception as exc:
        return f"unavailable: {exc.__class__.__name__}"


def _check_storage() -> str:
    try:
        root = Path(settings.data_storage_root).resolve()
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".healthcheck_write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return "ok"
    except Exception as exc:
        return f"unavailable: {exc.__class__.__name__}"


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check",
    description="Returns the current operational status of the DataSense API.",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    """Return API health information."""
    db_status = _check_database()
    overall_status = "ok" if db_status == "ok" else "degraded"

    return HealthResponse(
        status=overall_status,
        service="datasense-api",
        version=settings.app_version,
        environment=settings.environment,
        timestamp=datetime.now(UTC).isoformat(),
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        database=db_status,
    )


@router.get(
    "/health/live",
    summary="Liveness Probe",
    description="Lightweight process liveness probe for container orchestrators.",
    tags=["System"],
)
async def liveness_probe() -> dict[str, str]:
    """Returns 200 OK while the FastAPI process is alive."""
    return {
        "status": "alive",
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness Probe",
    description="Verifies PostgreSQL, DuckDB, writable storage, and active non-shutdown state.",
    tags=["System"],
)
async def readiness_probe(response: Response) -> ReadinessResponse:
    """Returns 200 when all runtime dependencies are ready, else 503."""
    shutting_down = is_shutting_down()
    checks = {
        "database": _check_database(),
        "duckdb": _check_duckdb(),
        "storage": _check_storage(),
    }
    ready = (not shutting_down) and all(v == "ok" for v in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        ready=ready,
        shutting_down=shutting_down,
        checks=checks,
        timestamp=datetime.now(UTC).isoformat(),
    )


def _authorize_metrics_access(
    db: Session,
    x_metrics_token: str | None,
    credentials: HTTPAuthorizationCredentials | None,
) -> None:
    """Authorize Prometheus /metrics scrapers via metrics token or OWNER/ADMIN bearer JWT."""
    if settings.metrics_token and x_metrics_token:
        if secrets.compare_digest(x_metrics_token, settings.metrics_token):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid metrics token")

    if credentials is not None:
        try:
            payload = decode_access_token(credentials.credentials)
            user_id = payload.get("sub")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization token",
            ) from None
        if user_id:
            import uuid

            uid = uuid.UUID(user_id)
            membership = db.scalar(
                select(Membership).where(
                    Membership.user_id == uid,
                    Membership.role.in_([MembershipRole.OWNER, MembershipRole.ADMIN]),
                )
            )
            if membership:
                return
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Owner or Admin role required to access /metrics",
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication or valid X-Metrics-Token header required for /metrics",
    )


@router.get(
    "/metrics",
    summary="Prometheus Metrics",
    description="Exports Prometheus text metrics (protected by X-Metrics-Token or Owner/Admin auth).",
    tags=["System"],
)
def prometheus_metrics(
    db: Annotated[Session, Depends(get_db)],
    x_metrics_token: Annotated[str | None, Header(alias="X-Metrics-Token")] = None,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)] = None,
) -> Response:
    """Expose Prometheus text exposition metrics."""
    _authorize_metrics_access(db, x_metrics_token, credentials)
    content = metrics_registry.prometheus_text(db_stats=get_pool_stats())
    return Response(content=content, media_type="text/plain; version=0.0.4; charset=utf-8")


@router.get(
    "/admin/observability",
    summary="Admin Operational Observability Snapshot",
    description="Returns operational metrics, dependency health, queue states, and recent failures for workspace Owners/Admins.",
    tags=["System"],
)
def get_admin_observability(
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Returns consolidated operational telemetry scoped safely for Admin/Owner inspection."""
    org_id = org_ctx.organization.id

    agent_counts_rows = db.execute(
        select(AgentRun.status, func.count(AgentRun.id))
        .where(AgentRun.organization_id == org_id)
        .group_by(AgentRun.status)
    ).all()
    agent_run_counts = {str(st): int(cnt) for st, cnt in agent_counts_rows}

    ingestion_counts_rows = db.execute(
        select(IngestionJob.status, func.count(IngestionJob.id)).group_by(IngestionJob.status)
    ).all()
    ingestion_job_counts = {str(st): int(cnt) for st, cnt in ingestion_counts_rows}

    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "environment": settings.environment,
        "version": settings.app_version,
        "shutting_down": is_shutting_down(),
        "dependencies": {
            "database": _check_database(),
            "duckdb": _check_duckdb(),
            "storage": _check_storage(),
            "ai_configured": bool(settings.google_api_key and settings.google_api_key.strip()),
            "ai_model": settings.gemini_model,
        },
        "database_pool": get_pool_stats(),
        "metrics": metrics_registry.snapshot(),
        "agent_runs_by_status": agent_run_counts,
        "ingestion_jobs_by_status": ingestion_job_counts,
    }
