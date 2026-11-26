"""FastAPI authentication and authorization dependencies."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.ingestion_job import IngestionJob
from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Validate Bearer access token and return the authenticated user."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token user ID",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = db.scalar(select(User).where(User.id == user_uuid))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


@dataclass
class OrganizationContext:
    """Resolved organization workspace and user membership."""

    organization: Organization
    membership: Membership
    role: MembershipRole


def get_current_organization(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    x_organization_id: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> OrganizationContext:
    """Resolve the active organization context for the authenticated user."""
    stmt = (
        select(Membership, Organization)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
    )

    if x_organization_id:
        try:
            target_org_id = uuid.UUID(x_organization_id)
            stmt = stmt.where(Membership.organization_id == target_org_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid organization ID format in header",
            ) from None

    results = db.execute(stmt).first()
    if not results:
        if x_organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to the specified organization",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no associated organizations",
        )

    membership, organization = results
    return OrganizationContext(
        organization=organization,
        membership=membership,
        role=membership.role,
    )


def require_role(allowed_roles: list[MembershipRole]):
    """Factory dependency checking whether user has one of the allowed roles in current org."""

    def role_checker(
        org_context: Annotated[OrganizationContext, Depends(get_current_organization)],
    ) -> OrganizationContext:
        if org_context.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of the following roles: {[r.value for r in allowed_roles]}",
            )
        return org_context

    return role_checker


def get_authorized_project(
    project_id: uuid.UUID,
    org_context: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
) -> Project:
    """Retrieve project ensuring it belongs strictly to the user's active organization.

    Cross-organization access returns 404 to avoid leaking existence of projects in other orgs.
    """
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == org_context.organization.id,
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found in current organization",
        )
    return project


def get_authorized_dataset(
    dataset_id: uuid.UUID,
    org_context: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
) -> Dataset:
    """Retrieve dataset ensuring it belongs strictly to the user's active organization."""
    dataset = db.scalar(
        select(Dataset)
        .join(Project, Dataset.project_id == Project.id)
        .where(
            Dataset.id == dataset_id,
            Project.organization_id == org_context.organization.id,
        )
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found in current organization",
        )
    return dataset


def get_authorized_ingestion_job(
    job_id: uuid.UUID,
    org_context: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
) -> IngestionJob:
    """Retrieve ingestion job ensuring associated dataset belongs to current organization."""
    job = db.scalar(
        select(IngestionJob)
        .join(Dataset, IngestionJob.dataset_id == Dataset.id)
        .join(Project, Dataset.project_id == Project.id)
        .where(
            IngestionJob.id == job_id,
            Project.organization_id == org_context.organization.id,
        )
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingestion job not found in current organization",
        )
    return job
