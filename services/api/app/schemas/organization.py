"""Organization schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrganizationBase(BaseModel):
    """Base organization attributes."""

    name: str = Field(..., min_length=1, max_length=255)


class OrganizationRead(OrganizationBase):
    """Organization response model."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class OrganizationWithRole(OrganizationRead):
    """Organization with the calling user's membership role."""

    role: str


class OrganizationUpdate(BaseModel):
    """Organization update request."""

    name: str | None = Field(None, min_length=1, max_length=255)
