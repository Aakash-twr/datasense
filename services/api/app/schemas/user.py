"""User Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    """Base user attributes."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr


class UserRead(UserBase):
    """User response model."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    """User profile update request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    avatar_url: str | None = Field(None, max_length=1024)


class UserProfile(UserRead):
    """Extended user profile response."""

    pass
