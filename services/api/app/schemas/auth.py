"""Authentication request and response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserRead


class RegisterRequest(BaseModel):
    """Registration request payload."""

    name: str = Field(..., min_length=1, max_length=255, description="User full name")
    email: EmailStr = Field(..., description="Unique email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password (at least 8 characters)")
    organization_name: str = Field(..., min_length=1, max_length=255, description="Initial organization/workspace name")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Require basic complexity (letters + digits) while staying friendly for interactive logins."""
        if not any(ch.isalpha() for ch in v) or not any(ch.isdigit() for ch in v):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class LoginRequest(BaseModel):
    """Login request payload."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """Access token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class CurrentMembership(BaseModel):
    """Membership information for current user."""

    organization_id: uuid.UUID
    organization_name: str
    organization_slug: str
    role: str


class AuthMeResponse(BaseModel):
    """Authenticated user info including organizations and current role."""

    user: UserRead
    current_organization: CurrentMembership | None = None
    organizations: list[CurrentMembership] = []
