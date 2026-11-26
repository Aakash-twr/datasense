"""FastAPI router for AI Analytics Copilot endpoints."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.exceptions import (
    AIConfigurationError,
    AIConversationNotFoundError,
    AIPrivacyNotAcknowledgedError,
    AIQuotaExceededError,
    AIRateLimitExceededError,
    AIServiceUnavailableError,
    AITimeoutError,
)
from app.ai.llm_factory import LLMFactory
from app.ai.schemas.ai_response import (
    AIConversationCreateRequest,
    AIConversationListResponse,
    AIConversationResponse,
    AIConversationUpdateRequest,
    AIInsightResponse,
    AIMessageRequest,
    AIMessageResponse,
    AIPrivacyAcknowledgeResponse,
    AISQLExplanationRequest,
    AISQLExplanationResponse,
    AIStatusResponse,
)
from app.ai.services.context_service import ContextService
from app.ai.services.conversation_service import ConversationService
from app.ai.services.copilot_service import CopilotService
from app.ai.services.explanation_service import SQLExplanationService
from app.ai.services.insight_service import InsightService
from app.analytics.catalog import CatalogService
from app.api.deps import (
    OrganizationContext,
    get_authorized_project,
    get_current_user,
    get_db,
    require_role,
)
from app.core.config import settings
from app.core.observability import is_shutting_down
from app.core.rate_limit import rate_limit_dep
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Analytics Copilot"])


# -----------------------------------------------------------------------------
# Global AI Status & Privacy Endpoints
# -----------------------------------------------------------------------------

@router.get("/ai/status", response_model=AIStatusResponse)
def get_ai_status(
    current_user: Annotated[User, Depends(get_current_user)],
) -> AIStatusResponse:
    """Returns availability and configuration state of the AI copilot without exposing secrets."""
    is_available, message = LLMFactory.check_availability()
    is_acknowledged = bool(current_user.ai_privacy_acknowledged_at is not None)

    return AIStatusResponse(
        enabled=settings.ai_enabled,
        configured=bool(settings.google_api_key and settings.google_api_key.strip()),
        model=settings.gemini_model,
        available=is_available,
        privacy_acknowledged=is_acknowledged,
        message=message,
    )


@router.post("/ai/privacy/acknowledge", response_model=AIPrivacyAcknowledgeResponse)
def acknowledge_privacy(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AIPrivacyAcknowledgeResponse:
    """Records that the user reviewed and accepted the AI data privacy notice."""
    now = datetime.now(UTC)
    current_user.ai_privacy_acknowledged_at = now
    db.commit()
    db.refresh(current_user)

    return AIPrivacyAcknowledgeResponse(
        acknowledged=True,
        acknowledged_at=now,
    )


# -----------------------------------------------------------------------------
# Project Conversations Endpoints
# -----------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/ai/conversations",
    response_model=AIConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    payload: AIConversationCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AIConversationResponse:
    """Creates a new AI analytical conversation thread in the specified project."""
    service = ConversationService()
    conv = service.create_conversation(
        db=db,
        organization_id=project.organization_id,
        project_id=project.id,
        user_id=current_user.id,
        title=payload.title,
        dataset_ids=payload.dataset_ids,
    )

    return AIConversationResponse(
        id=str(conv.id),
        organization_id=str(conv.organization_id),
        project_id=str(conv.project_id),
        user_id=str(conv.user_id),
        title=conv.title,
        selected_dataset_ids=conv.selected_dataset_ids or [],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@router.get(
    "/projects/{project_id}/ai/conversations",
    response_model=AIConversationListResponse,
)
def list_conversations(
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AIConversationListResponse:
    """Lists conversations for the given project with message counts."""
    service = ConversationService()
    return service.list_conversations(
        db=db,
        organization_id=project.organization_id,
        project_id=project.id,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/projects/{project_id}/ai/conversations/{conversation_id}",
    response_model=AIConversationResponse,
)
def get_conversation_details(
    conversation_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AIConversationResponse:
    """Retrieves conversation thread and all historical messages."""
    service = ConversationService()
    try:
        conv = service.get_conversation(
            db=db,
            organization_id=project.organization_id,
            project_id=project.id,
            conversation_id=conversation_id,
        )
    except AIConversationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc

    return AIConversationResponse(
        id=str(conv.id),
        organization_id=str(conv.organization_id),
        project_id=str(conv.project_id),
        user_id=str(conv.user_id),
        title=conv.title,
        selected_dataset_ids=conv.selected_dataset_ids or [],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[
            AIMessageResponse(
                id=str(m.id),
                conversation_id=str(m.conversation_id),
                role=m.role,
                content=m.content,
                structured_metadata=m.structured_metadata,
                generated_sql=m.generated_sql,
                sql_explanation=m.sql_explanation,
                sql_validation_status=m.sql_validation_status,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
    )


@router.put(
    "/projects/{project_id}/ai/conversations/{conversation_id}",
    response_model=AIConversationResponse,
)
def update_conversation(
    conversation_id: uuid.UUID,
    payload: AIConversationUpdateRequest,
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AIConversationResponse:
    """Updates conversation title or selected dataset IDs."""
    service = ConversationService()
    try:
        conv = service.update_conversation(
            db=db,
            organization_id=project.organization_id,
            project_id=project.id,
            conversation_id=conversation_id,
            title=payload.title,
            dataset_ids=payload.dataset_ids,
        )
    except AIConversationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc

    return AIConversationResponse(
        id=str(conv.id),
        organization_id=str(conv.organization_id),
        project_id=str(conv.project_id),
        user_id=str(conv.user_id),
        title=conv.title,
        selected_dataset_ids=conv.selected_dataset_ids or [],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@router.delete(
    "/projects/{project_id}/ai/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: uuid.UUID,
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> None:
    """Deletes a conversation and its messages."""
    service = ConversationService()
    try:
        service.delete_conversation(
            db=db,
            organization_id=project.organization_id,
            project_id=project.id,
            conversation_id=conversation_id,
        )
    except AIConversationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc


# -----------------------------------------------------------------------------
# Message Submission / Copilot Prompt Endpoint
# -----------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/ai/conversations/{conversation_id}/messages",
    response_model=AIMessageResponse,
    dependencies=[Depends(rate_limit_dep("ai_message", "rate_limit_ai_per_minute"))],
)
def send_message(
    conversation_id: uuid.UUID,
    payload: AIMessageRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AIMessageResponse:
    """Submits a natural language query to the AI Copilot.

    Returns the AI assistant's response, safe explanations, and validated SQL draft.
    """
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    copilot_service = CopilotService()

    try:
        return copilot_service.process_user_message(
            db=db,
            user=current_user,
            organization_id=project.organization_id,
            project_id=project.id,
            conversation_id=conversation_id,
            message_text=payload.message,
        )
    except AIPrivacyNotAcknowledgedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.message) from exc
    except AIConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message) from exc
    except AIRateLimitExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.message) from exc
    except AIQuotaExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.message) from exc
    except AITimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=exc.message) from exc
    except AIConversationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except AIServiceUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message) from exc


# -----------------------------------------------------------------------------
# Insights and SQL Explanation Endpoints
# -----------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/ai/insights",
    response_model=list[AIInsightResponse],
    dependencies=[Depends(rate_limit_dep("ai_insights", "rate_limit_ai_per_minute"))],
)
def generate_dataset_insights(
    payload: AIConversationCreateRequest,
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> list[AIInsightResponse]:
    """Generates analytical insights and exploration questions from dataset schema metadata."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    catalog = CatalogService.get_project_catalog(
        session=db, project_id=project.id
    )

    insight_service = InsightService()
    return insight_service.generate_insights(catalog, payload.dataset_ids)


@router.post(
    "/projects/{project_id}/ai/explain-sql",
    response_model=AISQLExplanationResponse,
    dependencies=[Depends(rate_limit_dep("ai_explain", "rate_limit_ai_per_minute"))],
)
def explain_sql_query(
    payload: AISQLExplanationRequest,
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AISQLExplanationResponse:
    """Explains an existing SQL query in plain English and suggests query optimizations."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    context_service = ContextService()

    catalog = CatalogService.get_project_catalog(
        session=db, project_id=project.id
    )
    schema_context = context_service.build_schema_context(catalog, payload.dataset_ids)
    allowed_tables = context_service.get_allowed_tables(catalog, payload.dataset_ids)

    explanation_service = SQLExplanationService()
    return explanation_service.explain_sql(
        sql=payload.sql,
        schema_context=schema_context,
        allowed_tables=allowed_tables,
    )
