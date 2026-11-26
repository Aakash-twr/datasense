"""Security headers middleware and CSRF protection helpers."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Applies defensive HTTP security headers on all API responses."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Frame-Options"] = "DENY"

        # Allow Swagger UI on /docs & /redoc while keeping strict frame-ancestors
        if request.url.path in ("/docs", "/redoc", "/openapi.json"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "frame-ancestors 'none'; base-uri 'self';"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none';"
            )

        if settings.cookie_secure or settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


def verify_cookie_csrf(request: Request) -> None:
    """Enforces Origin / Referer and custom-header CSRF protections on cookie-authenticated endpoints."""
    allowed_origins = set(settings.cors_origins)
    if settings.frontend_url:
        allowed_origins.add(settings.frontend_url.rstrip("/"))

    origin = request.headers.get("origin")
    referer = request.headers.get("referer")

    if origin:
        if origin.rstrip("/") not in allowed_origins:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-origin cookie request rejected.",
            )
    elif referer:
        parsed = urlparse(referer)
        ref_origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
        if ref_origin not in allowed_origins:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-origin referer rejected.",
            )

    # Require explicit non-simple header in production (cannot be forged cross-site without CORS)
    if settings.is_production and not request.headers.get("x-requested-with"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing CSRF protection header.",
        )
