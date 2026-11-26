"""Pydantic schemas for datasets, versions, schemas, profiling, and preview."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IngestionJobRead(BaseModel):
    """Ingestion job tracking representation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dataset_id: uuid.UUID
    dataset_version_id: uuid.UUID
    status: str
    current_stage: str | None = None
    progress_percentage: int
    status_message: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DatasetUploadResponse(BaseModel):
    """Response returned upon accepting a dataset upload for asynchronous processing."""

    dataset_id: uuid.UUID
    version_id: uuid.UUID
    job_id: uuid.UUID
    status: str
    message: str


class DataColumnRead(BaseModel):
    """Column schema and metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    column_name: str
    physical_name: str
    data_type: str
    ordinal_position: int
    nullable: bool
    unique_count: int | None = None
    null_count: int | None = None
    null_percentage: float | None = None
    semantic_type: str | None = None
    pii_category: str | None = None
    pii_confidence: float | None = None
    description: str | None = None
    profile_stats: dict[str, Any] = Field(default_factory=dict)


class DataTableRead(BaseModel):
    """Logical table representation with column definitions."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    table_name: str
    original_table_name: str
    row_count: int
    column_count: int
    description: str | None = None
    columns: list[DataColumnRead] = Field(default_factory=list)


class DatasetVersionSummary(BaseModel):
    """Summary of a dataset version."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    checksum: str
    file_size_bytes: int
    total_row_count: int
    total_column_count: int
    status: str
    created_at: datetime
    is_active: bool = False


class DatasetRead(BaseModel):
    """Detailed dataset representation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None = None
    source_type: str
    original_filename: str
    status: str
    active_version_id: uuid.UUID | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    active_version: DatasetVersionSummary | None = None


class DatasetListResponse(BaseModel):
    """Paginated list of datasets."""

    items: list[DatasetRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class DatasetStatusResponse(BaseModel):
    """Current status and progress of a dataset."""

    dataset_id: uuid.UUID
    status: str
    active_version_id: uuid.UUID | None = None
    job: IngestionJobRead | None = None


class DatasetSchemaResponse(BaseModel):
    """Inferred schema for all tables in a dataset version."""

    dataset_id: uuid.UUID
    version_id: uuid.UUID
    version_number: int
    tables: list[DataTableRead]


class QualityWarningItem(BaseModel):
    """Data quality warning item."""

    severity: str
    code: str
    column: str | None = None
    message: str
    affected_rows: int | None = None


class DatasetProfileResponse(BaseModel):
    """Profiling statistics and quality warnings."""

    dataset_id: uuid.UUID
    version_id: uuid.UUID
    table_id: uuid.UUID | None = None
    table_name: str | None = None
    table_stats: dict[str, Any] = Field(default_factory=dict)
    column_stats: dict[str, dict[str, Any]] = Field(default_factory=dict)
    quality_warnings: list[QualityWarningItem] = Field(default_factory=list)


class DatasetPreviewResponse(BaseModel):
    """Preview rows from a dataset table."""

    dataset_id: uuid.UUID
    version_id: uuid.UUID
    table_id: uuid.UUID
    table_name: str
    columns: list[str]
    column_types: dict[str, str] = Field(default_factory=dict)
    rows: list[dict[str, Any]]
    total_rows: int
    limit: int
    offset: int
