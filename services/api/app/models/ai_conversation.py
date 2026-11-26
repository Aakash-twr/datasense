"""AI Conversation database model."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.ai_message import AIMessage
    from app.models.project import Project
    from app.models.user import User


class AIConversation(Base, TimestampMixin):
    """User conversation with the AI Analytics Copilot."""

    __tablename__ = "ai_conversations"

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
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="New Analytics Chat",
    )
    selected_dataset_ids: Mapped[list[str]] = mapped_column(
        PortableJSON,
        nullable=False,
        default=list,
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="ai_conversations")
    user: Mapped[User] = relationship("User")
    messages: Mapped[list[AIMessage]] = relationship(
        "AIMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AIMessage.created_at.asc()",
    )

    __table_args__ = (
        Index("ix_ai_conversations_org_proj", "organization_id", "project_id"),
        Index("ix_ai_conversations_user", "user_id"),
    )
