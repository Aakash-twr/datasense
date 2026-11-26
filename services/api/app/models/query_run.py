"""Query run tracking model."""

from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User


class QueryRunStatus(enum.StrEnum):
    """Lifecycle status of an analytical query execution."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class QueryRun(Base, TimestampMixin):
    """Stores query execution metadata and history."""

    __tablename__ = "query_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sql_query: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    selected_dataset_ids: Mapped[list[str]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=list,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=QueryRunStatus.PENDING,
        index=True,
    )
    execution_time_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    returned_row_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    error_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    project: Mapped[Project] = relationship(
        "Project",
        lazy="selectin",
    )
    user: Mapped[User] = relationship(
        "User",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_query_runs_project_created", "project_id", "created_at"),
        Index("ix_query_runs_user_created", "user_id", "created_at"),
    )
