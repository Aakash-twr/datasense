"""FastAPI routes for analytical SQL queries, catalog exploration, history, and saved queries."""

from __future__ import annotations

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.analytics.catalog import CatalogService
from app.analytics.exceptions import (
    CatalogError,
    ConcurrencyLimitError,
    DatasetNotReadyError,
    QueryExecutionError,
    QueryTimeoutError,
    QueryValidationError,
)
from app.analytics.query_executor import QueryExecutor
from app.analytics.schemas import (
    CatalogResponse,
    QueryExecutionRequest,
    QueryExecutionResponse,
    QueryHistoryListResponse,
    QueryRunResponse,
    QueryValidationRequest,
    QueryValidationResponse,
    SavedQueryCreate,
    SavedQueryListResponse,
    SavedQueryResponse,
    SavedQueryUpdate,
)
from app.analytics.services.query_service import QueryService
from app.api.deps import (
    OrganizationContext,
    get_authorized_project,
    get_current_user,
    require_role,
)
from app.core.observability import is_shutting_down
from app.core.rate_limit import rate_limit_dep
from app.db.session import get_db
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/projects/{project_id}", tags=["analytics"])


# ===========================================================================
# A. Catalog API
# ===========================================================================


@router.get(
    "/query/catalog",
    response_model=CatalogResponse,
    summary="Get available dataset schemas and tables for SQL queries",
)
def get_query_catalog(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    dataset_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> CatalogResponse:
    """Returns queryable datasets, logical tables, qualified identifiers, and column schemas."""
    return CatalogService.get_project_catalog(
        session=db,
        project_id=project.id,
        dataset_ids=dataset_ids,
    )


# ===========================================================================
# B. Validate SQL API
# ===========================================================================


@router.post(
    "/query/validate",
    response_model=QueryValidationResponse,
    summary="Validate an analytical SQL query before execution",
)
def validate_sql(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    request: QueryValidationRequest,
) -> QueryValidationResponse:
    """Parses and validates SQL via SQLGlot against authorized datasets and security rules."""
    try:
        return QueryExecutor.validate_query(
            session=db,
            project_id=project.id,
            sql=request.sql,
            dataset_ids=request.dataset_ids,
        )
    except (CatalogError, DatasetNotReadyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ===========================================================================
# C. Execute SQL API
# ===========================================================================


@router.post(
    "/query/execute",
    response_model=QueryExecutionResponse,
    summary="Execute an analytical SQL query against DuckDB",
    dependencies=[Depends(rate_limit_dep("query_execute", "rate_limit_query_per_minute"))],
)
async def execute_sql(
    project: Annotated[Project, Depends(get_authorized_project)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    request: QueryExecutionRequest,
) -> QueryExecutionResponse:
    """Validates and executes read-only SQL, returning structured rows and execution metrics."""
    if is_shutting_down():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server is shutting down",
        )
    try:
        return await QueryService.execute_and_record(
            session=db,
            project=project,
            user=user,
            request=request,
        )
    except QueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SQL Validation Error: {exc}",
        ) from exc
    except QueryTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Query Timeout: {exc}",
        ) from exc
    except ConcurrencyLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (CatalogError, DatasetNotReadyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except QueryExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ===========================================================================
# D. Query History APIs
# ===========================================================================


@router.get(
    "/query/history",
    response_model=QueryHistoryListResponse,
    summary="List query execution history for a project",
)
def list_query_history(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> QueryHistoryListResponse:
    """Lists past queries executed in this project with pagination."""
    items, total = QueryService.list_query_history(db, project.id, page, page_size)
    total_pages = max(1, math.ceil(total / page_size))
    return QueryHistoryListResponse(
        items=[QueryRunResponse.model_validate(it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.delete(
    "/query/history/{query_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a query execution history record",
)
def delete_query_history(
    project: Annotated[Project, Depends(get_authorized_project)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    query_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Removes a query execution history entry."""
    deleted = QueryService.delete_query_history(db, project.id, query_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Query history record not found",
        )


# ===========================================================================
# E. Query Execution Status & Detail API
# ===========================================================================


@router.get(
    "/query/{query_id}",
    response_model=QueryRunResponse,
    summary="Get execution telemetry and status of a query run",
)
def get_query_status(
    project: Annotated[Project, Depends(get_authorized_project)],
    query_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> QueryRunResponse:
    """Retrieves metadata, execution duration, and row count for a query run."""
    run = QueryService.get_query_run(db, project.id, query_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Query execution record not found",
        )
    return QueryRunResponse.model_validate(run)


# ===========================================================================
# F. Saved Queries APIs
# ===========================================================================


@router.post(
    "/saved-queries",
    response_model=SavedQueryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a frequently used SQL query",
)
def create_saved_query(
    project: Annotated[Project, Depends(get_authorized_project)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    request: SavedQueryCreate,
) -> SavedQueryResponse:
    """Saves a SQL query with name and description."""
    saved = QueryService.create_saved_query(db, project, user, request)
    return SavedQueryResponse.model_validate(saved)


@router.get(
    "/saved-queries",
    response_model=SavedQueryListResponse,
    summary="List all saved queries in a project",
)
def list_saved_queries(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> SavedQueryListResponse:
    """Lists user-saved queries for the project."""
    items, total = QueryService.list_saved_queries(db, project.id, page, page_size)
    total_pages = max(1, math.ceil(total / page_size))
    return SavedQueryListResponse(
        items=[SavedQueryResponse.model_validate(it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/saved-queries/{saved_query_id}",
    response_model=SavedQueryResponse,
    summary="Get saved query by ID",
)
def get_saved_query(
    project: Annotated[Project, Depends(get_authorized_project)],
    saved_query_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> SavedQueryResponse:
    """Fetches a specific saved query."""
    saved = QueryService.get_saved_query(db, project.id, saved_query_id)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved query not found",
        )
    return SavedQueryResponse.model_validate(saved)


@router.put(
    "/saved-queries/{saved_query_id}",
    response_model=SavedQueryResponse,
    summary="Update a saved query",
)
def update_saved_query(
    project: Annotated[Project, Depends(get_authorized_project)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    saved_query_id: uuid.UUID,
    request: SavedQueryUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> SavedQueryResponse:
    """Updates name, description, or SQL of a saved query."""
    saved = QueryService.update_saved_query(db, project.id, saved_query_id, request)
    if not saved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved query not found",
        )
    return SavedQueryResponse.model_validate(saved)


@router.delete(
    "/saved-queries/{saved_query_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved query",
)
def delete_saved_query(
    project: Annotated[Project, Depends(get_authorized_project)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    saved_query_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Permanently deletes a saved query."""
    deleted = QueryService.delete_saved_query(db, project.id, saved_query_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved query not found",
        )
