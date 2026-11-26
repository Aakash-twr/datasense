"""Organization API routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    OrganizationContext,
    get_current_organization,
    get_current_user,
    require_role,
)
from app.core.security import generate_slug
from app.db.session import get_db
from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import (
    OrganizationUpdate,
    OrganizationWithRole,
)

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get(
    "",
    response_model=list[OrganizationWithRole],
    summary="List organizations the user belongs to",
)
def list_organizations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrganizationWithRole]:
    """Retrieve all organizations where the user has an active membership."""
    stmt = (
        select(Organization, Membership.role)
        .join(Membership, Organization.id == Membership.organization_id)
        .where(Membership.user_id == user.id)
        .order_by(Organization.created_at.asc())
    )
    rows = db.execute(stmt).all()
    return [
        OrganizationWithRole(
            id=org.id,
            name=org.name,
            slug=org.slug,
            owner_id=org.owner_id,
            created_at=org.created_at,
            updated_at=org.updated_at,
            role=role.value,
        )
        for org, role in rows
    ]


@router.get(
    "/current",
    response_model=OrganizationWithRole,
    summary="Get active organization and role",
)
def get_current(
    org_ctx: Annotated[OrganizationContext, Depends(get_current_organization)],
) -> OrganizationWithRole:
    """Return the active organization and the user's role within it."""
    org = org_ctx.organization
    return OrganizationWithRole(
        id=org.id,
        name=org.name,
        slug=org.slug,
        owner_id=org.owner_id,
        created_at=org.created_at,
        updated_at=org.updated_at,
        role=org_ctx.role.value,
    )


@router.patch(
    "/current",
    response_model=OrganizationWithRole,
    summary="Update current organization (owners and admins only)",
)
def update_current(
    payload: OrganizationUpdate,
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationWithRole:
    """Allow organization owners or admins to update organization name and slug."""
    org = org_ctx.organization

    if payload.name is not None and payload.name.strip():
        new_name = payload.name.strip()
        org.name = new_name
        # Update slug if unique
        new_slug = generate_slug(new_name)
        if new_slug != org.slug:
            existing = db.scalar(select(Organization).where(Organization.slug == new_slug, Organization.id != org.id))
            if not existing:
                org.slug = new_slug

    org.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(org)

    return OrganizationWithRole(
        id=org.id,
        name=org.name,
        slug=org.slug,
        owner_id=org.owner_id,
        created_at=org.created_at,
        updated_at=org.updated_at,
        role=org_ctx.role.value,
    )
