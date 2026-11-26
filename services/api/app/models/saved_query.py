"""Saved query model."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User


class SavedQuery(Base, TimestampMixin):
    """User-saved analytical SQL query."""

    __tablename__ = "saved_queries"

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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
        Index("ix_saved_queries_project_created", "project_id", "created_at"),
        Index("ix_saved_queries_user_name", "user_id", "name"),
    )
