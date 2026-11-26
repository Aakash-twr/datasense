"""AI schemas package."""

from app.ai.schemas.ai_response import (
    AIConversationCreateRequest,
    AIConversationListItem,
    AIConversationListResponse,
    AIConversationResponse,
    AIConversationUpdateRequest,
    AICopilotResponse,
    AIInsightItem,
    AIInsightResponse,
    AIMessageRequest,
    AIMessageResponse,
    AIPrivacyAcknowledgeResponse,
    AISQLExplanationRequest,
    AISQLExplanationResponse,
    AIStatusResponse,
    ResponseType,
    VisualizationRecommendation,
)

__all__ = [
    "AICopilotResponse",
    "AIConversationCreateRequest",
    "AIConversationListItem",
    "AIConversationListResponse",
    "AIConversationResponse",
    "AIConversationUpdateRequest",
    "AIInsightItem",
    "AIInsightResponse",
    "AIMessageRequest",
    "AIMessageResponse",
    "AIPrivacyAcknowledgeResponse",
    "AISQLExplanationRequest",
    "AISQLExplanationResponse",
    "AIStatusResponse",
    "ResponseType",
    "VisualizationRecommendation",
]
