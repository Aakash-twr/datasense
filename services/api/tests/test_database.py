"""Database integrity and relationship tests."""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User


def test_user_organization_relationships(db: Session, register_user: Any) -> None:
    """Verify relationships between user, organizations, and memberships."""
    register_user(name="Owner User", email="rel_test@example.com", organization_name="Workspace 1")

    user = db.scalar(select(User).where(User.email == "rel_test@example.com"))
    assert user is not None
    assert len(user.memberships) == 1
    assert len(user.owned_organizations) == 1

    org = user.owned_organizations[0]
    assert org.owner_id == user.id
    assert org.name == "Workspace 1"
    assert org.slug.startswith("workspace-1")


def test_initial_owner_membership_creation(db: Session, register_user: Any) -> None:
    """Upon registration, user receives an OWNER membership."""
    register_user(email="owner_mem@example.com", organization_name="Owner Org")

    user = db.scalar(select(User).where(User.email == "owner_mem@example.com"))
    assert user is not None
    membership = user.memberships[0]
    assert membership.role == MembershipRole.OWNER


def test_unique_email_constraint(db: Session) -> None:
    """Database enforces unique constraint on email."""
    user1 = User(name="User 1", email="unique@example.com", password_hash="hash1")
    user2 = User(name="User 2", email="unique@example.com", password_hash="hash2")

    db.add(user1)
    db.commit()

    db.add(user2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_unique_organization_slug(db: Session) -> None:
    """Database enforces unique constraint on organization slug."""
    user = User(name="Owner", email="slug_owner@example.com", password_hash="hash")
    db.add(user)
    db.commit()

    org1 = Organization(name="Org 1", slug="duplicate-slug", owner_id=user.id)
    org2 = Organization(name="Org 2", slug="duplicate-slug", owner_id=user.id)

    db.add(org1)
    db.commit()

    db.add(org2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_membership_uniqueness(db: Session) -> None:
    """User cannot have duplicate memberships in the same organization."""
    user = User(name="Member", email="member_dup@example.com", password_hash="hash")
    db.add(user)
    db.commit()

    org = Organization(name="Org", slug="member-org", owner_id=user.id)
    db.add(org)
    db.commit()

    m1 = Membership(organization_id=org.id, user_id=user.id, role=MembershipRole.OWNER)
    m2 = Membership(organization_id=org.id, user_id=user.id, role=MembershipRole.ADMIN)

    db.add(m1)
    db.commit()

    db.add(m2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_project_creation_and_soft_archive(db: Session) -> None:
    """Verify project creation and soft archiving (not immediate deletion)."""
    user = User(name="Creator", email="proj_creator@example.com", password_hash="hash")
    db.add(user)
    db.commit()

    org = Organization(name="Org", slug="proj-org", owner_id=user.id)
    db.add(org)
    db.commit()

    project = Project(
        organization_id=org.id,
        name="Sales Analysis",
        description="Q3 Sales",
        created_by=user.id,
    )
    db.add(project)
    db.commit()
    assert project.id is not None
    assert project.archived_at is None

    # Soft archive
    from datetime import UTC, datetime
    project.archived_at = datetime.now(UTC)
    db.commit()

    # Still exists in database
    found = db.scalar(select(Project).where(Project.id == project.id))
    assert found is not None
    assert found.archived_at is not None


def test_database_transaction_rollback(db: Session) -> None:
    """Uncommitted changes do not persist when rolled back."""
    user = User(name="Rollback Candidate", email="rollback_test@example.com", password_hash="hash")
    db.add(user)
    db.flush()

    # User exists within the flushed session
    assert db.scalar(select(User).where(User.email == "rollback_test@example.com")) is not None

    # Rollback cancels the pending insertion
    db.rollback()

    # User does not persist after rollback
    assert db.scalar(select(User).where(User.email == "rollback_test@example.com")) is None
