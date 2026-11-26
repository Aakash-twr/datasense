"""Saved analytical report persistence model."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent_run import AgentRun
    from app.models.project import Project
    from app.models.user import User


class AnalysisReport(Base, TimestampMixin):
    """Persisted multi-agent analytical report with evidence citations and Markdown export."""

    __tablename__ = "analysis_reports"

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
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    workflow_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="deep_analysis",
    )
    report_json: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=dict,
    )
    report_markdown: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
    )
    evidence_references: Mapped[list[dict[str, Any]]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=list,
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="analysis_reports")
    user: Mapped[User] = relationship("User")
    agent_run: Mapped[AgentRun | None] = relationship("AgentRun", back_populates="reports")

    __table_args__ = (
        Index("ix_analysis_reports_org_proj", "organization_id", "project_id"),
    )
