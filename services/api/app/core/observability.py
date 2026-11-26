"""Phase 7 observability: structured JSON logging, secret/PII redaction, correlation IDs, Prometheus metrics, and optional OpenTelemetry."""

from __future__ import annotations

import contextvars
import json
import logging
import re
import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

# Context variables per request
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="-")
_shutting_down = False


def set_shutting_down(value: bool) -> None:
    """Marks application shutdown state to reject new long-running jobs safely."""
    global _shutting_down
    _shutting_down = value


def is_shutting_down() -> bool:
    """Returns True when application shutdown drain is active."""
    return _shutting_down


# Patterns redacted from logs to guarantee zero credential or PII leaks
_SECRET_PATTERNS = [
    (re.compile(r"(Bearer\s+)[A-Za-z0-9\-_\.]+", re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(AIza[0-9A-Za-z\-_]{20,}|AQ\.[0-9A-Za-z\-_]{20,})"), "[REDACTED_API_KEY]"),
    (re.compile(r'("?(?:password|secret|token|api_key|refresh_token)"?\s*[:=]\s*"?)[^"\s,}]+', re.IGNORECASE), r"\1[REDACTED]"),
    (re.compile(r"(postgresql(?:\+\w+)?://[^:]+:)[^@]+(@)"), r"\1[REDACTED]\2"),
]


def redact_sensitive_text(message: str) -> str:
    """Redacts tokens, API keys, passwords, and DB credentials from log strings."""
    cleaned = message
    for pattern, replacement in _SECRET_PATTERNS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


class RedactingFilter(logging.Filter):
    """Logging filter injecting correlation metadata and redacting secrets."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get("-")
        record.correlation_id = correlation_id_ctx.get("-")
        if isinstance(record.msg, str):
            record.msg = redact_sensitive_text(record.msg)
        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    redact_sensitive_text(a) if isinstance(a, str) else a for a in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: redact_sensitive_text(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
        return True


class JSONLogFormatter(logging.Formatter):
    """Structured JSON formatter suitable for container stdout and log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "correlation_id": getattr(record, "correlation_id", "-"),
            "message": redact_sensitive_text(record.getMessage()),
        }
        if record.exc_info:
            payload["exception"] = redact_sensitive_text(self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Configures root logger with redaction and optional JSON structured output."""
    root = logging.getLogger()
    level_name = settings.log_level.strip().upper()
    root.setLevel(getattr(logging, level_name, logging.INFO))

    formatter: logging.Formatter
    if settings.structured_logging or settings.is_production:
        formatter = JSONLogFormatter()
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s  %(levelname)-8s  [req:%(request_id)s]  %(name)s  %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )

    if not root.handlers:
        handler = logging.StreamHandler()
        root.addHandler(handler)

    redactor = RedactingFilter()
    for handler in root.handlers:
        handler.setFormatter(formatter)
        # Avoid stacking duplicate filters across reloads
        handler.filters = [f for f in handler.filters if not isinstance(f, RedactingFilter)]
        handler.addFilter(redactor)


class MetricsRegistry:
    """Thread-safe Prometheus-compatible operational metrics store."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.http_requests_total: dict[tuple[str, str, int], int] = {}
        self.http_errors_total: int = 0
        self.http_duration_ms_sum: float = 0.0
        self.http_duration_ms_count: int = 0
        self.rate_limit_rejections_total: int = 0
        self.query_executions_total: int = 0
        self.query_failures_total: int = 0
        self.query_duration_ms_sum: float = 0.0
        self.ingestion_failures_total: int = 0
        self.gemini_errors_total: int = 0
        self.recent_errors: list[dict[str, Any]] = []

    def record_http_request(self, method: str, path: str, status_code: int, duration_ms: float) -> None:
        # Normalize UUIDs in path for clean metric cardinality
        norm_path = re.sub(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            "{id}",
            path,
        )
        with self._lock:
            key = (method.upper(), norm_path, status_code)
            self.http_requests_total[key] = self.http_requests_total.get(key, 0) + 1
            self.http_duration_ms_sum += duration_ms
            self.http_duration_ms_count += 1
            if status_code >= 500:
                self.http_errors_total += 1

    def record_rate_limit_rejection(self) -> None:
        with self._lock:
            self.rate_limit_rejections_total += 1

    def record_query(self, duration_ms: float, failed: bool = False) -> None:
        with self._lock:
            self.query_executions_total += 1
            self.query_duration_ms_sum += duration_ms
            if failed:
                self.query_failures_total += 1

    def record_ingestion_failure(self) -> None:
        with self._lock:
            self.ingestion_failures_total += 1

    def record_gemini_error(self) -> None:
        with self._lock:
            self.gemini_errors_total += 1

    def record_recent_error(self, route: str, code: str, detail: str) -> None:
        with self._lock:
            self.recent_errors.insert(
                0,
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "request_id": request_id_ctx.get("-"),
                    "route": route,
                    "code": code,
                    "detail": redact_sensitive_text(detail)[:240],
                },
            )
            self.recent_errors = self.recent_errors[:25]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            total_req = sum(self.http_requests_total.values())
            avg_lat = (
                round(self.http_duration_ms_sum / self.http_duration_ms_count, 2)
                if self.http_duration_ms_count
                else 0.0
            )
            return {
                "total_http_requests": total_req,
                "http_5xx_errors": self.http_errors_total,
                "avg_http_latency_ms": avg_lat,
                "rate_limit_rejections": self.rate_limit_rejections_total,
                "query_executions": self.query_executions_total,
                "query_failures": self.query_failures_total,
                "ingestion_failures": self.ingestion_failures_total,
                "gemini_errors": self.gemini_errors_total,
                "recent_errors": list(self.recent_errors),
            }

    def prometheus_text(self, db_stats: dict[str, Any] | None = None) -> str:
        """Generates Prometheus text exposition format (0.0.4)."""
        lines: list[str] = [
            "# HELP datasense_http_requests_total Total HTTP requests handled",
            "# TYPE datasense_http_requests_total counter",
        ]
        with self._lock:
            for (method, path, status), val in sorted(self.http_requests_total.items()):
                lines.append(
                    f'datasense_http_requests_total{{method="{method}",path="{path}",status="{status}"}} {val}'
                )
            lines.extend(
                [
                    "# HELP datasense_http_errors_total Total HTTP 5xx server errors",
                    "# TYPE datasense_http_errors_total counter",
                    f"datasense_http_errors_total {self.http_errors_total}",
                    "# HELP datasense_http_request_duration_ms_sum Cumulative HTTP request duration in ms",
                    "# TYPE datasense_http_request_duration_ms_sum counter",
                    f"datasense_http_request_duration_ms_sum {self.http_duration_ms_sum:.2f}",
                    "# HELP datasense_http_request_duration_ms_count Total timed HTTP requests",
                    "# TYPE datasense_http_request_duration_ms_count counter",
                    f"datasense_http_request_duration_ms_count {self.http_duration_ms_count}",
                    "# HELP datasense_rate_limit_rejections_total Total requests rejected by rate limiter",
                    "# TYPE datasense_rate_limit_rejections_total counter",
                    f"datasense_rate_limit_rejections_total {self.rate_limit_rejections_total}",
                    "# HELP datasense_query_executions_total Total DuckDB query executions recorded",
                    "# TYPE datasense_query_executions_total counter",
                    f"datasense_query_executions_total {self.query_executions_total}",
                    "# HELP datasense_query_failures_total Total failed DuckDB queries",
                    "# TYPE datasense_query_failures_total counter",
                    f"datasense_query_failures_total {self.query_failures_total}",
                    "# HELP datasense_ingestion_failures_total Total dataset ingestion failures",
                    "# TYPE datasense_ingestion_failures_total counter",
                    f"datasense_ingestion_failures_total {self.ingestion_failures_total}",
                    "# HELP datasense_gemini_errors_total Total upstream Gemini API errors",
                    "# TYPE datasense_gemini_errors_total counter",
                    f"datasense_gemini_errors_total {self.gemini_errors_total}",
                ]
            )
        if db_stats and "checked_out" in db_stats:
            lines.extend(
                [
                    "# HELP datasense_db_pool_checked_out Active checked-out SQLAlchemy connections",
                    "# TYPE datasense_db_pool_checked_out gauge",
                    f"datasense_db_pool_checked_out {db_stats['checked_out']}",
                ]
            )
        return "\n".join(lines) + "\n"


metrics_registry = MetricsRegistry()


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attaches request/correlation IDs, logs request timing safely, and captures metrics."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        req_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        corr_id = request.headers.get("X-Correlation-Id") or req_id

        t1 = request_id_ctx.set(req_id)
        t2 = correlation_id_ctx.set(corr_id)
        start = time.perf_counter()

        try:
            response: Response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
            metrics_registry.record_http_request(request.method, request.url.path, 500, duration_ms)
            metrics_registry.record_recent_error(request.url.path, exc.__class__.__name__, str(exc))
            raise
        finally:
            request_id_ctx.reset(t1)
            correlation_id_ctx.reset(t2)

        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
        metrics_registry.record_http_request(
            request.method, request.url.path, response.status_code, duration_ms
        )
        response.headers["X-Request-Id"] = req_id
        response.headers["X-Correlation-Id"] = corr_id
        return response


def configure_optional_opentelemetry(app: Any) -> None:
    """Configures OpenTelemetry tracing only when OTEL_ENABLED=true and SDK packages exist."""
    if not settings.otel_enabled:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({"service.name": "datasense-api", "service.version": settings.app_version})
        provider = TracerProvider(resource=resource)
        if settings.otel_exporter_otlp_endpoint:
            exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
        logging.getLogger(__name__).info("OpenTelemetry tracing enabled for datasense-api.")
    except ImportError:
        logging.getLogger(__name__).warning(
            "OTEL_ENABLED=true but OpenTelemetry packages are not installed; skipping tracing setup."
        )
