"""AI Message database model."""

from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PortableJSON, TimestampMixin

if TYPE_CHECKING:
    from app.models.ai_conversation import AIConversation


class MessageRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class AIMessage(Base, TimestampMixin):
    """Message exchanged in an AI analytics conversation."""

    __tablename__ = "ai_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    structured_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        PortableJSON,
        nullable=True,
        default=None,
    )
    generated_sql: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    sql_explanation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    sql_validation_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default=None,
    )

    # Relationship
    conversation: Mapped[AIConversation] = relationship(
        "AIConversation",
        back_populates="messages",
    )

    __table_args__ = (
        Index("ix_ai_messages_conv_created", "conversation_id", "created_at"),
    )
