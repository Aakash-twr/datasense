"""AI Conversation and message persistence service."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.ai.exceptions import AIConversationNotFoundError
from app.ai.schemas.ai_response import (
    AIConversationListItem,
    AIConversationListResponse,
)
from app.core.config import settings
from app.models.ai_conversation import AIConversation
from app.models.ai_message import AIMessage, MessageRole

logger = logging.getLogger(__name__)


class ConversationService:
    """Manages AI conversation threads, message history, and bounded context."""

    def create_conversation(
        self,
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str = "New Analytics Chat",
        dataset_ids: list[str] | None = None,
    ) -> AIConversation:
        conversation = AIConversation(
            organization_id=organization_id,
            project_id=project_id,
            user_id=user_id,
            title=title or "New Analytics Chat",
            selected_dataset_ids=dataset_ids or [],
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return conversation

    def get_conversation(
        self,
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> AIConversation:
        stmt = (
            select(AIConversation)
            .where(
                AIConversation.id == conversation_id,
                AIConversation.organization_id == organization_id,
                AIConversation.project_id == project_id,
            )
            .options(selectinload(AIConversation.messages))
        )
        result = db.execute(stmt)
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise AIConversationNotFoundError(f"Conversation {conversation_id} not found.")
        return conversation

    def list_conversations(
        self,
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> AIConversationListResponse:
        offset = (page - 1) * page_size

        count_stmt = (
            select(func.count(AIConversation.id))
            .where(
                AIConversation.organization_id == organization_id,
                AIConversation.project_id == project_id,
            )
        )
        total_res = db.execute(count_stmt)
        total = total_res.scalar_one() or 0

        stmt = (
            select(
                AIConversation,
                func.count(AIMessage.id).label("msg_count"),
            )
            .outerjoin(AIMessage, AIMessage.conversation_id == AIConversation.id)
            .where(
                AIConversation.organization_id == organization_id,
                AIConversation.project_id == project_id,
            )
            .group_by(AIConversation.id)
            .order_by(AIConversation.updated_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = db.execute(stmt)
        rows = result.all()

        items: list[AIConversationListItem] = []
        for conv, msg_count in rows:
            items.append(
                AIConversationListItem(
                    id=str(conv.id),
                    title=conv.title,
                    selected_dataset_ids=conv.selected_dataset_ids or [],
                    created_at=conv.created_at,
                    updated_at=conv.updated_at,
                    message_count=msg_count,
                )
            )

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        return AIConversationListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def update_conversation(
        self,
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        conversation_id: uuid.UUID,
        title: str | None = None,
        dataset_ids: list[str] | None = None,
    ) -> AIConversation:
        conv = self.get_conversation(db, organization_id, project_id, conversation_id)
        if title is not None:
            conv.title = title
        if dataset_ids is not None:
            conv.selected_dataset_ids = dataset_ids
        db.commit()
        db.refresh(conv)
        return conv

    def delete_conversation(
        self,
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> bool:
        conv = self.get_conversation(db, organization_id, project_id, conversation_id)
        db.delete(conv)
        db.commit()
        return True

    def add_user_message(
        self,
        db: Session,
        conversation: AIConversation,
        content: str,
    ) -> AIMessage:
        msg = AIMessage(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=content,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    def add_assistant_message(
        self,
        db: Session,
        conversation: AIConversation,
        content: str,
        structured_metadata: dict[str, Any] | None = None,
        generated_sql: str | None = None,
        sql_explanation: str | None = None,
        sql_validation_status: str | None = None,
    ) -> AIMessage:
        msg = AIMessage(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=content,
            structured_metadata=structured_metadata,
            generated_sql=generated_sql,
            sql_explanation=sql_explanation,
            sql_validation_status=sql_validation_status,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    def get_bounded_history(
        self,
        conversation: AIConversation,
        max_messages: int | None = None,
    ) -> list[dict[str, str]]:
        """Extracts bounded history without sending raw datasets or exceeding token budgets."""
        limit = max_messages or settings.ai_max_conversation_messages
        recent_messages = sorted(conversation.messages, key=lambda m: m.created_at)[-limit:]
        return [
            {
                "role": msg.role,
                "content": msg.content,
            }
            for msg in recent_messages
        ]
