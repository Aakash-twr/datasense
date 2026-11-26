"""Projects API routes: CRUD and soft archiving with organization multi-tenancy."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    OrganizationContext,
    get_authorized_project,
    get_current_organization,
    get_current_user,
    require_role,
)
from app.db.session import get_db
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectRead,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List projects in current organization",
)
def list_projects(
    org_ctx: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(None, max_length=100, description="Search term for project name"),
    include_archived: bool = Query(False, description="Whether to include archived projects"),
) -> ProjectListResponse:
    """List projects belonging to the active organization with search, filtering, and pagination."""
    org_id = org_ctx.organization.id

    stmt = select(Project).where(Project.organization_id == org_id)

    if not include_archived:
        stmt = stmt.where(Project.archived_at.is_(None))

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Project.name).like(term) | func.lower(func.coalesce(Project.description, "")).like(term)
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    # Paginate
    offset = (page - 1) * page_size
    items_stmt = stmt.order_by(Project.created_at.desc()).offset(offset).limit(page_size)
    items = db.scalars(items_stmt).all()

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return ProjectListResponse(
        items=[ProjectRead.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project in current organization",
)
def create_project(
    payload: ProjectCreate,
    user: Annotated[User, Depends(get_current_user)],
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectRead:
    """Create a new project associated with the user's active organization."""
    project = Project(
        organization_id=org_ctx.organization.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        created_by=user.id,
        settings=payload.settings or {},
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectRead.model_validate(project)


@router.get(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Get project by ID",
)
def get_project(
    project: Annotated[Project, Depends(get_authorized_project)],
) -> ProjectRead:
    """Retrieve details for a project within the user's active organization."""
    return ProjectRead.model_validate(project)


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Update project details",
)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectRead:
    """Update project name, description, and settings."""
    project = get_authorized_project(project_id, org_ctx, db)

    if payload.name is not None and payload.name.strip():
        project.name = payload.name.strip()
    if payload.description is not None:
        project.description = payload.description.strip() or None
    if payload.settings is not None:
        project.settings = payload.settings

    project.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(project)
    return ProjectRead.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Soft archive a project",
)
def archive_project(
    project_id: uuid.UUID,
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Soft archive a project by setting archived_at timestamp."""
    project = get_authorized_project(project_id, org_ctx, db)

    if project.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project is already archived",
        )

    project.archived_at = datetime.now(UTC)
    project.updated_at = datetime.now(UTC)
    db.commit()

    return {"message": "Project archived successfully", "id": str(project.id)}
