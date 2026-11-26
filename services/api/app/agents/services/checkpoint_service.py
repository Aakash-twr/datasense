"""Persistent LangGraph checkpointing service supporting PostgreSQL and SQLite."""

from __future__ import annotations

import logging
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.sqlite import SqliteSaver

from app.core.config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()


def _normalize_postgres_uri(url: str) -> str:
    """Converts SQLAlchemy psycopg URL (postgresql+psycopg://) to raw libpq URI."""
    if url.startswith("postgresql+psycopg://"):
        return "postgresql://" + url.removeprefix("postgresql+psycopg://")
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url.removeprefix("postgresql+psycopg2://")
    return url


class CheckpointService:
    """Manages durable LangGraph checkpointer instances and thread retention."""

    def __init__(self, sqlite_path: Path | None = None):
        self._sqlite_path = sqlite_path
        self._pg_pool: Any = None
        self._sqlite_conn: sqlite3.Connection | None = None

    @staticmethod
    def generate_thread_id() -> str:
        """Generates an opaque, unguessable server-side thread ID."""
        return f"lg_thr_{uuid.uuid4().hex}"

    def _default_sqlite_path(self) -> Path:
        if self._sqlite_path is not None:
            self._sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            return self._sqlite_path
        ckpt_dir = Path(settings.data_storage_root) / "checkpoints"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        return ckpt_dir / "langgraph_checkpoints.db"

    @contextmanager
    def get_checkpointer(self):
        """Yields an initialized durable LangGraph checkpointer (PostgresSaver or SqliteSaver)."""
        db_url = settings.database_url.strip()

        if db_url.startswith("postgresql"):
            from langgraph.checkpoint.postgres import PostgresSaver
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            pg_uri = _normalize_postgres_uri(db_url)
            with ConnectionPool(
                conninfo=pg_uri,
                max_size=4,
                kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
            ) as pool:
                saver = PostgresSaver(pool)
                saver.setup()
                yield saver
            return

        # Local development / SQLite mode
        db_path = self._default_sqlite_path()
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        try:
            saver = SqliteSaver(conn)
            saver.setup()
            yield saver
        finally:
            conn.close()

    def delete_thread_checkpoints(self, thread_id: str) -> None:
        """Removes all checkpoints associated with a specific opaque thread ID."""
        try:
            with self.get_checkpointer() as saver:
                if hasattr(saver, "delete_thread"):
                    saver.delete_thread(thread_id)
        except Exception as exc:
            logger.warning("Failed to delete checkpoints for thread %s: %s", thread_id, exc)

    @staticmethod
    def cleanup_expired_checkpoints(db_session: Any, retention_days: int | None = None) -> int:
        """Deletes checkpoint data for runs older than AGENT_CHECKPOINT_RETENTION_DAYS."""
        from datetime import UTC, datetime, timedelta

        from sqlalchemy import select

        from app.models.agent_run import AgentRun

        days = retention_days if retention_days is not None else settings.agent_checkpoint_retention_days
        cutoff = datetime.now(UTC) - timedelta(days=days)
        old_threads = list(
            db_session.scalars(
                select(AgentRun.thread_id).where(AgentRun.created_at < cutoff)
            ).all()
        )
        if not old_threads:
            return 0

        svc = CheckpointService()
        cleaned = 0
        for tid in old_threads:
            svc.delete_thread_checkpoints(tid)
            cleaned += 1
        return cleaned

    @staticmethod
    def serialize_interrupt_state(saver: BaseCheckpointSaver, thread_id: str) -> dict[str, Any] | None:
        """Safely reads the latest checkpoint tuple metadata for diagnostics without leaking secrets."""
        try:
            config = {"configurable": {"thread_id": thread_id}}
            ckpt = saver.get_tuple(config)
            if not ckpt:
                return None
            return {
                "has_checkpoint": True,
                "next": list(ckpt.metadata.get("writes", {}).keys()) if ckpt.metadata else [],
            }
        except Exception:
            return None
