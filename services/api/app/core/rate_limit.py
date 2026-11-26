"""Multi-worker safe database-backed rate limiter."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.observability import metrics_registry
from app.db.session import get_db
from app.models.rate_limit_bucket import RateLimitBucket

logger = logging.getLogger(__name__)


class RateLimitService:
    """Persistent sliding-window rate limiter backed by PostgreSQL / SQLite."""

    @staticmethod
    def _client_identifier(request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        elif request.client:
            ip = request.client.host
        else:
            ip = "unknown"
        return ip[:64]

    @classmethod
    def check_and_increment(
        cls,
        db: Session,
        *,
        category: str,
        identifier: str,
        max_requests: int,
        window_seconds: int = 60,
    ) -> None:
        """Checks and increments request count in DB; raises 429 if limit exceeded."""
        if not settings.rate_limit_enabled or max_requests <= 0:
            return

        now = datetime.now(UTC)
        bucket_key = f"{category}:{identifier}"

        bucket = db.scalar(select(RateLimitBucket).where(RateLimitBucket.key == bucket_key))
        if bucket is None:
            bucket = RateLimitBucket(
                key=bucket_key,
                window_start=now,
                count=1,
                expires_at=now + timedelta(seconds=window_seconds),
            )
            db.add(bucket)
            db.commit()
            return

        exp = bucket.expires_at.replace(tzinfo=UTC) if bucket.expires_at.tzinfo is None else bucket.expires_at
        if exp <= now:
            bucket.window_start = now
            bucket.count = 1
            bucket.expires_at = now + timedelta(seconds=window_seconds)
            db.commit()
            return

        if bucket.count >= max_requests:
            metrics_registry.record_rate_limit_rejection()
            retry_after = max(1, int((exp - now).total_seconds()))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for {category}. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.count += 1
        db.commit()

    @staticmethod
    def cleanup_expired_buckets(db: Session) -> int:
        """Deletes expired rate limit buckets to prevent table bloat."""
        now = datetime.now(UTC)
        res = db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at < now))
        db.commit()
        return int(res.rowcount or 0)


def rate_limit_dep(category: str, max_attr: str):
    """FastAPI dependency enforcing DB-backed rate limits per route category."""

    def _checker(
        request: Request,
        db: Annotated[Session, Depends(get_db)],
    ) -> None:
        max_reqs = int(getattr(settings, max_attr, 30))
        ident = RateLimitService._client_identifier(request)
        # Scope authenticated users by Authorization token hash prefix if available
        auth_hdr = request.headers.get("authorization", "")
        if auth_hdr.startswith("Bearer ") and len(auth_hdr) > 16:
            ident = f"{ident}:{auth_hdr[-12:]}"
        RateLimitService.check_and_increment(
            db,
            category=category,
            identifier=ident,
            max_requests=max_reqs,
        )

    return _checker
