"""Copilot orchestration service uniting conversation, catalog, and SQL generation."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.ai.exceptions import AIPrivacyNotAcknowledgedError
from app.ai.schemas.ai_response import AIMessageResponse
from app.ai.services.context_service import ContextService
from app.ai.services.conversation_service import ConversationService
from app.ai.services.sql_generation_service import SQLGenerationService
from app.analytics.catalog import CatalogService
from app.models.ai_conversation import AIConversation
from app.models.user import User

logger = logging.getLogger(__name__)


class CopilotService:
    """High-level coordinator for AI analytics chat interactions."""

    def __init__(
        self,
        conversation_service: ConversationService | None = None,
        context_service: ContextService | None = None,
        sql_generation_service: SQLGenerationService | None = None,
        catalog_service: CatalogService | None = None,
    ):
        self.conversation_service = conversation_service or ConversationService()
        self.context_service = context_service or ContextService()
        self.sql_generation_service = sql_generation_service or SQLGenerationService()
        self.catalog_service = catalog_service or CatalogService()

    def process_user_message(
        self,
        db: Session,
        user: User,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        conversation_id: uuid.UUID,
        message_text: str,
    ) -> AIMessageResponse:
        """Processes a natural language prompt from the user and returns the AI assistant response.

        Guarantees:
        1. Privacy terms must be acknowledged before processing.
        2. Prompt and dataset metadata are sanitized and safely bounded.
        3. Never executes SQL; only returns drafts for review.
        """
        # 1. Privacy acknowledgment check
        if not user.ai_privacy_acknowledged_at:
            raise AIPrivacyNotAcknowledgedError(
                "You must review and acknowledge the AI privacy notice before sending prompts."
            )

        # 2. Get conversation
        conversation: AIConversation = self.conversation_service.get_conversation(
            db, organization_id, project_id, conversation_id
        )

        # 3. Record user message in DB
        self.conversation_service.add_user_message(db, conversation, message_text)

        # 4. Resolve project catalog for selected datasets
        catalog = self.catalog_service.get_project_catalog(
            session=db, project_id=project_id
        )

        selected_ids = conversation.selected_dataset_ids or []
        schema_context = self.context_service.build_schema_context(catalog, selected_ids)
        allowed_tables = self.context_service.get_allowed_tables(catalog, selected_ids)

        # 5. Extract bounded conversation history
        history = self.conversation_service.get_bounded_history(conversation)

        # 6. Generate analytical response and validated SQL draft
        ai_response, sql_val_status = self.sql_generation_service.generate_analytical_response(
            question=message_text,
            schema_context=schema_context,
            allowed_tables=allowed_tables,
            conversation_history=history,
        )

        metadata_dict: dict[str, Any] = {
            "response_type": ai_response.response_type,
            "assumptions": ai_response.assumptions,
            "requires_clarification": ai_response.requires_clarification,
            "clarification_question": ai_response.clarification_question,
            "suggested_follow_up_questions": ai_response.suggested_follow_up_questions,
        }
        if ai_response.visualization_recommendation:
            metadata_dict["visualization_recommendation"] = ai_response.visualization_recommendation.model_dump()

        # 7. Persist assistant reply
        assistant_msg = self.conversation_service.add_assistant_message(
            db=db,
            conversation=conversation,
            content=ai_response.message,
            structured_metadata=metadata_dict,
            generated_sql=ai_response.generated_sql,
            sql_explanation=ai_response.sql_explanation,
            sql_validation_status=sql_val_status,
        )

        # Update conversation title if default and this is first exchange
        if conversation.title == "New Analytics Chat" and len(conversation.messages) <= 2:
            snippet = message_text.strip()[:40]
            if snippet:
                self.conversation_service.update_conversation(
                    db, organization_id, project_id, conversation_id, title=snippet
                )

        return AIMessageResponse(
            id=str(assistant_msg.id),
            conversation_id=str(conversation.id),
            role=assistant_msg.role,
            content=assistant_msg.content,
            structured_metadata=assistant_msg.structured_metadata,
            generated_sql=assistant_msg.generated_sql,
            sql_explanation=assistant_msg.sql_explanation,
            sql_validation_status=assistant_msg.sql_validation_status,
            created_at=assistant_msg.created_at,
        )
