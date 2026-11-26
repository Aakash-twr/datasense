"""LLM factory for initializing Google Gemini via LangChain."""

from __future__ import annotations

import logging
from typing import Any

from app.ai.exceptions import (
    AIConfigurationError,
    AIQuotaExceededError,
    AIRateLimitExceededError,
    AIServiceUnavailableError,
    AITimeoutError,
)
from app.core.config import settings
from app.core.observability import metrics_registry

logger = logging.getLogger(__name__)


class LLMFactory:
    """Central factory for managing and injecting the LangChain ChatGoogleGenerativeAI client."""

    _mock_model: Any | None = None

    @classmethod
    def set_mock_model(cls, model: Any | None) -> None:
        """Inject a mock model for unit tests or offline environments."""
        cls._mock_model = model

    @classmethod
    def get_model(cls, temperature: float | None = None) -> Any:
        """Creates and returns the configured LangChain chat model.

        Raises:
            AIConfigurationError: If AI is disabled or credentials are missing.
            AIServiceUnavailableError: If the langchain_google_genai package is missing.
        """
        if cls._mock_model is not None:
            return cls._mock_model

        if not settings.ai_enabled:
            raise AIConfigurationError("AI Analytics Copilot is disabled in application settings.")

        if not settings.google_api_key or not settings.google_api_key.strip():
            raise AIConfigurationError(
                "Google Gemini API key is not configured. Please set GOOGLE_API_KEY in the backend environment."
            )

        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as err:
            logger.error("langchain-google-genai is not installed: %s", err)
            raise AIServiceUnavailableError(
                "Gemini AI provider packages are missing on this server."
            ) from err

        model_temp = temperature if temperature is not None else settings.gemini_temperature

        try:
            return ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=settings.google_api_key,
                temperature=model_temp,
                max_output_tokens=settings.gemini_max_output_tokens,
                timeout=float(settings.gemini_request_timeout_seconds),
            )
        except Exception as exc:
            logger.exception("Failed to initialize ChatGoogleGenerativeAI: %s", exc)
            cls.handle_provider_exception(exc)

    @classmethod
    def check_availability(cls) -> tuple[bool, str]:
        """Checks whether the AI client is configured and available without exposing secrets."""
        if cls._mock_model is not None:
            return True, "Mock AI client is active for testing."

        if not settings.ai_enabled:
            return False, "AI features are disabled."

        if not settings.google_api_key or not settings.google_api_key.strip():
            return False, "Google Gemini API key is not set. Add GOOGLE_API_KEY to services/api/.env."

        try:
            import langchain_google_genai  # noqa: F401
            return True, "Gemini AI Copilot is configured and ready."
        except ImportError:
            return False, "Gemini integration dependencies are not installed."

    @staticmethod
    def handle_provider_exception(exc: Exception) -> None:
        """Translates upstream Gemini / LangChain errors into domain-specific exceptions."""
        metrics_registry.record_gemini_error()
        metrics_registry.record_recent_error("gemini_provider", exc.__class__.__name__, str(exc))
        exc_str = str(exc).lower()

        if "resource_exhausted" in exc_str or "quota" in exc_str or "429" in exc_str:
            if "rate limit" in exc_str or "too many requests" in exc_str:
                raise AIRateLimitExceededError("Rate limit exceeded for Gemini API. Please wait a few seconds.") from exc
            raise AIQuotaExceededError("Gemini API free tier quota exceeded. Check Google AI Studio console.") from exc

        if "timeout" in exc_str or "timed out" in exc_str or "deadline_exceeded" in exc_str:
            raise AITimeoutError("Gemini API request timed out.") from exc

        if "api_key" in exc_str or "unauthenticated" in exc_str or "permission_denied" in exc_str or "403" in exc_str or "401" in exc_str:
            raise AIConfigurationError("Invalid or unauthorized Google Gemini API key.") from exc

        if "503" in exc_str or "unavailable" in exc_str or "high demand" in exc_str or "overloaded" in exc_str:
            raise AIServiceUnavailableError(
                f"Gemini model '{settings.gemini_model}' is temporarily experiencing high demand or is unavailable. Please try again in a moment."
            ) from exc

        if (
            "not found" in exc_str
            or "not_found" in exc_str
            or "404" in exc_str
            or "no longer available" in exc_str
            or "deprecated" in exc_str
            or "not supported" in exc_str
        ):
            raise AIConfigurationError(
                f"Configured Gemini model '{settings.gemini_model}' was not found or is no longer supported. Update GEMINI_MODEL in services/api/.env (e.g. 'gemini-3.5-flash')."
            ) from exc

        raise AIServiceUnavailableError(f"Gemini API error: {str(exc)}") from exc
