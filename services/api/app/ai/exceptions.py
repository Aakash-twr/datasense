"""AI module exceptions."""


class AIError(Exception):
    """Base class for all AI module exceptions."""

    def __init__(self, message: str, code: str = "AI_ERROR", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


class AIConfigurationError(AIError):
    """Raised when Gemini or AI settings are missing or misconfigured."""

    def __init__(self, message: str = "AI features are not configured or disabled."):
        super().__init__(message, code="AI_CONFIG_ERROR")


class AIServiceUnavailableError(AIError):
    """Raised when the AI model/provider is temporarily unreachable or unavailable."""

    def __init__(self, message: str = "AI service is currently unavailable. Please try again later."):
        super().__init__(message, code="AI_UNAVAILABLE")


class AIRateLimitExceededError(AIError):
    """Raised when request rate limits are exceeded."""

    def __init__(self, message: str = "AI request rate limit exceeded. Please wait a moment before trying again."):
        super().__init__(message, code="AI_RATE_LIMIT")


class AIQuotaExceededError(AIError):
    """Raised when the AI provider quota has been exhausted."""

    def __init__(self, message: str = "AI provider quota exceeded. Please check your Gemini API plan or try again later."):
        super().__init__(message, code="AI_QUOTA_EXCEEDED")


class AITimeoutError(AIError):
    """Raised when a request to the AI model times out."""

    def __init__(self, message: str = "AI model request timed out. Please try a simpler question."):
        super().__init__(message, code="AI_TIMEOUT")


class AISQLGenerationError(AIError):
    """Raised when the AI generated invalid or unrepairable SQL."""

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message, code="AI_SQL_GENERATION_FAILED", details=details)


class AIConversationNotFoundError(AIError):
    """Raised when an AI conversation does not exist or user lacks permission."""

    def __init__(self, message: str = "Conversation not found."):
        super().__init__(message, code="CONVERSATION_NOT_FOUND")


class AIPrivacyNotAcknowledgedError(AIError):
    """Raised when user has not yet acknowledged the AI privacy disclosure."""

    def __init__(self, message: str = "AI privacy disclosure must be acknowledged before submitting prompts."):
        super().__init__(message, code="AI_PRIVACY_REQUIRED")
