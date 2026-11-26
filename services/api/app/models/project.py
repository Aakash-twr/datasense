"""Project database model."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent_run import AgentRun
    from app.models.ai_conversation import AIConversation
    from app.models.analysis_report import AnalysisReport
    from app.models.dataset import Dataset
    from app.models.organization import Organization
    from app.models.query_run import QueryRun
    from app.models.saved_query import SavedQuery
    from app.models.user import User


class Project(Base, TimestampMixin):
    """Project entity belonging to an organization."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
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
        default=None,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    settings: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON,
        default=dict,
        nullable=False,
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        index=True,
    )

    # Relationships
    organization: Mapped[Organization] = relationship("Organization", back_populates="projects")
    creator: Mapped[User | None] = relationship("User", back_populates="created_projects")
    datasets: Mapped[list[Dataset]] = relationship(
        "Dataset",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    query_runs: Mapped[list[QueryRun]] = relationship(
        "QueryRun",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    saved_queries: Mapped[list[SavedQuery]] = relationship(
        "SavedQuery",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    ai_conversations: Mapped[list[AIConversation]] = relationship(
        "AIConversation",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    agent_runs: Mapped[list[AgentRun]] = relationship(
        "AgentRun",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    analysis_reports: Mapped[list[AnalysisReport]] = relationship(
        "AnalysisReport",
        back_populates="project",
        cascade="all, delete-orphan",
    )
