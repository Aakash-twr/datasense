"""Project schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    """Base project attributes."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class ProjectCreate(ProjectBase):
    """Project creation request."""

    settings: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    """Project update request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    settings: dict[str, Any] | None = None


class ProjectRead(ProjectBase):
    """Project response model."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    created_by: uuid.UUID | None = None
    settings: dict[str, Any]
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    """Paginated project listing response."""

    items: list[ProjectRead]
    total: int
    page: int
    page_size: int
    total_pages: int
