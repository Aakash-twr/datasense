"""Agent workflow run persistence model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent_run_evidence import AgentRunEvidence
    from app.models.agent_run_step import AgentRunStep
    from app.models.ai_conversation import AIConversation
    from app.models.analysis_report import AnalysisReport
    from app.models.project import Project
    from app.models.user import User


class AgentWorkflowStatus(enum.StrEnum):
    """Lifecycle status of a multi-agent workflow run."""

    PENDING = "pending"
    PLANNING = "planning"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentApprovalStatus(enum.StrEnum):
    """Approval status for human-in-the-loop SQL execution gates."""

    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AgentWorkflowType(enum.StrEnum):
    """Supported analytical workflow modes."""

    SIMPLE_QUESTION = "simple_question"
    DATA_DISCOVERY = "data_discovery"
    DATA_QUALITY_AUDIT = "data_quality_audit"
    DESCRIPTIVE_ANALYSIS = "descriptive_analysis"
    TREND_ANALYSIS = "trend_analysis"
    COMPARATIVE_ANALYSIS = "comparative_analysis"
    ANOMALY_INVESTIGATION = "anomaly_investigation"
    VISUALIZATION = "visualization"
    DEEP_ANALYSIS = "deep_analysis"
    REPORT_GENERATION = "report_generation"


class AgentRun(Base, TimestampMixin):
    """Persistent execution record for a LangGraph multi-agent analytical workflow."""

    __tablename__ = "agent_runs"

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
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    thread_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
    )
    workflow_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=AgentWorkflowType.DEEP_ANALYSIS,
        index=True,
    )
    user_request: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    selected_dataset_ids: Mapped[list[str]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=list,
    )
    dataset_version_snapshot: Mapped[dict[str, str]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=dict,
    )
    share_aggregate_summaries: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=AgentWorkflowStatus.PENDING,
        index=True,
    )
    current_step: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    approval_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=AgentApprovalStatus.NOT_REQUIRED,
    )
    approval_hash: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )
    approval_payload: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
    )
    approved_query_indices: Mapped[list[int]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=list,
    )
    llm_calls_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    sql_queries_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    token_usage: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
    )
    result_summary: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    error_code: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    error_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="agent_runs")
    user: Mapped[User] = relationship("User")
    conversation: Mapped[AIConversation | None] = relationship("AIConversation")
    steps: Mapped[list[AgentRunStep]] = relationship(
        "AgentRunStep",
        back_populates="agent_run",
        cascade="all, delete-orphan",
        order_by="AgentRunStep.sequence_order.asc()",
    )
    evidence_items: Mapped[list[AgentRunEvidence]] = relationship(
        "AgentRunEvidence",
        back_populates="agent_run",
        cascade="all, delete-orphan",
        order_by="AgentRunEvidence.created_at.asc()",
    )
    reports: Mapped[list[AnalysisReport]] = relationship(
        "AnalysisReport",
        back_populates="agent_run",
    )

    __table_args__ = (
        Index("ix_agent_runs_org_proj_status", "organization_id", "project_id", "status"),
        Index("ix_agent_runs_user_created", "user_id", "created_at"),
    )
