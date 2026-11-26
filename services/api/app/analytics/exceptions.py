"""Analytics engine custom exceptions."""

from __future__ import annotations


class AnalyticsError(Exception):
    """Base exception for analytical engine errors."""

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class QueryValidationError(AnalyticsError):
    """Raised when an analytical query fails security or semantic validation."""


class QueryExecutionError(AnalyticsError):
    """Raised when DuckDB execution fails."""


class QueryTimeoutError(AnalyticsError):
    """Raised when query execution exceeds the configured timeout threshold."""


class ConcurrencyLimitError(AnalyticsError):
    """Raised when too many concurrent analytical queries are in flight."""


class CatalogError(AnalyticsError):
    """Raised when table or dataset catalog resolution fails."""


class DatasetNotReadyError(AnalyticsError):
    """Raised when an analytical query references an incomplete or unready dataset."""
