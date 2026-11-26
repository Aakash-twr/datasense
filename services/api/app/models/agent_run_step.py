"""Agent workflow step tracking model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON

if TYPE_CHECKING:
    from app.models.agent_run import AgentRun


class AgentStepStatus(enum.StrEnum):
    """Execution status of an individual agent step."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    FAILED = "failed"
    AWAITING_APPROVAL = "awaiting_approval"


class AgentRunStep(Base):
    """Records step-level agent progress and compact metadata without raw data."""

    __tablename__ = "agent_run_steps"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    step_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=AgentStepStatus.PENDING,
    )
    sequence_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
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
    input_summary: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
    )
    output_summary: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationship
    agent_run: Mapped[AgentRun] = relationship("AgentRun", back_populates="steps")

    __table_args__ = (
        Index("ix_agent_run_steps_run_seq", "agent_run_id", "sequence_order"),
    )
