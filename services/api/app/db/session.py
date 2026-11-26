"""SQLAlchemy engine, connection pooling, and session management."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Engine setup with production PostgreSQL connection pooling vs SQLite dev compatibility
connect_args: dict[str, object] = {}
engine_kwargs: dict[str, Any] = {
    "pool_pre_ping": True,
    "echo": settings.debug,
}

if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    engine_kwargs["pool_size"] = settings.db_pool_size
    engine_kwargs["max_overflow"] = settings.db_max_overflow
    engine_kwargs["pool_timeout"] = settings.db_pool_timeout
    engine_kwargs["pool_recycle"] = settings.db_pool_recycle

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    **engine_kwargs,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_pool_stats() -> dict[str, Any]:
    """Returns safe database pool status metrics without exposing credentials."""
    pool = engine.pool
    stats: dict[str, Any] = {
        "dialect": engine.dialect.name,
    }
    if hasattr(pool, "size"):
        stats["pool_size"] = pool.size()
    if hasattr(pool, "checkedout"):
        stats["checked_out"] = pool.checkedout()
    if hasattr(pool, "overflow"):
        stats["overflow"] = pool.overflow()
    return stats
