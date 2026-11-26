"""Database session context helper for LangGraph nodes and background workflow runners."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy.orm import Session

from app.db.session import SessionLocal

_test_session_override: Session | None = None


def set_agent_db_override(session: Session | None) -> None:
    """Allows automated tests to bind the transactional test Session without closing it."""
    global _test_session_override
    _test_session_override = session


@contextmanager
def agent_db_session() -> Generator[Session, None, None]:
    """Yields a SQLAlchemy Session (uses test override if set, otherwise opens SessionLocal)."""
    if _test_session_override is not None:
        yield _test_session_override
        return

    with SessionLocal() as db:
        yield db
