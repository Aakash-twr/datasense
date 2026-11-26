"""Pydantic v2 schemas for the analytical engine and SQL queries."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CatalogTableColumn(BaseModel):
    """Column definition within a catalog table."""

    name: str
    display_name: str
    data_type: str
    canonical_type: str
    is_nullable: bool = True
    is_sensitive: bool = False
    sensitivity_category: str | None = None


class CatalogTable(BaseModel):
    """A logical table available in DuckDB."""

    table_name: str
    schema_name: str
    qualified_name: str  # e.g. "sales_data.orders"
    display_name: str
    row_count: int
    column_count: int
    columns: list[CatalogTableColumn]


class CatalogDataset(BaseModel):
    """A dataset containing one or more queryable tables."""

    dataset_id: uuid.UUID
    dataset_name: str
    schema_name: str
    version_id: uuid.UUID
    version_number: int
    source_format: str
    tables: list[CatalogTable]


class CatalogResponse(BaseModel):
    """Response containing all queryable datasets for a project."""

    datasets: list[CatalogDataset]


class QueryValidationRequest(BaseModel):
    """Request payload to validate a SQL query."""

    sql: str = Field(..., min_length=1, max_length=50000, description="SQL query string")
    dataset_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Dataset IDs in scope for query",
    )


class QueryValidationResponse(BaseModel):
    """Response for SQL query validation."""

    is_valid: bool
    error: str | None = None
    tables_referenced: list[str] = Field(default_factory=list)
    suggested_fixes: list[str] = Field(default_factory=list)


class QueryExecutionRequest(BaseModel):
    """Request payload to execute an analytical SQL query."""

    sql: str = Field(..., min_length=1, max_length=50000, description="SQL query string")
    dataset_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Dataset IDs in scope for query",
    )
    limit: int | None = Field(
        default=2000,
        ge=1,
        le=10000,
        description="Maximum rows to return",
    )


class QueryColumn(BaseModel):
    """Schema descriptor for a returned result column."""

    name: str
    type: str


class QueryExecutionResponse(BaseModel):
    """Result of an analytical SQL query execution."""

    query_id: uuid.UUID
    status: str
    columns: list[QueryColumn] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    execution_time_ms: float = 0.0
    error_message: str | None = None


class QueryRunResponse(BaseModel):
    """Query execution history record."""

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    sql_query: str
    selected_dataset_ids: list[str]
    status: str
    execution_time_ms: float | None = None
    returned_row_count: int | None = None
    error_summary: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QueryHistoryListResponse(BaseModel):
    """Paginated list of query runs."""

    items: list[QueryRunResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SavedQueryCreate(BaseModel):
    """Request payload to save a query."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sql_query: str = Field(..., min_length=1, max_length=50000)
    selected_dataset_ids: list[uuid.UUID] = Field(default_factory=list)


class SavedQueryUpdate(BaseModel):
    """Request payload to update a saved query."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sql_query: str | None = Field(default=None, min_length=1, max_length=50000)
    selected_dataset_ids: list[uuid.UUID] | None = None


class SavedQueryResponse(BaseModel):
    """Saved query record response."""

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: str | None = None
    sql_query: str
    selected_dataset_ids: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SavedQueryListResponse(BaseModel):
    """List of saved queries."""

    items: list[SavedQueryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
