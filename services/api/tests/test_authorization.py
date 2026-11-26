"""Authorization and multi-tenancy tests."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.user import User


def test_owner_can_manage_projects(client: TestClient, register_user: Any) -> None:
    """Organization owner can create, read, update, and archive projects."""
    reg = register_user(email="owner_proj@example.com", organization_name="Owner Org")
    token = reg["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project
    create_res = client.post(
        "/api/v1/projects",
        json={"name": "Revenue Analytics", "description": "Tracking ARR"},
        headers=headers,
    )
    assert create_res.status_code == 201
    proj_id = create_res.json()["id"]

    # Read project
    get_res = client.get(f"/api/v1/projects/{proj_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Revenue Analytics"

    # Update project
    patch_res = client.patch(
        f"/api/v1/projects/{proj_id}",
        json={"name": "Revenue Analytics Updated"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Revenue Analytics Updated"

    # Archive project
    del_res = client.delete(f"/api/v1/projects/{proj_id}", headers=headers)
    assert del_res.status_code == 200

    # Default list excludes archived project
    list_res = client.get("/api/v1/projects", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()["items"]) == 0


def test_admin_and_analyst_permissions(client: TestClient, register_user: Any, db: Session) -> None:
    """Admins and analysts have appropriate project permissions."""
    # Register org owner
    register_user(email="org_owner@example.com", organization_name="Team Org")
    org = db.scalar(select(Organization).where(Organization.name == "Team Org"))
    assert org is not None

    # Register admin user
    admin_reg = register_user(email="admin_user@example.com", organization_name="Temp Org 1")
    admin_user = db.scalar(select(User).where(User.email == "admin_user@example.com"))
    assert admin_user is not None
    # Add admin to Team Org
    db.add(Membership(organization_id=org.id, user_id=admin_user.id, role=MembershipRole.ADMIN))
    db.commit()

    # Register analyst user
    analyst_reg = register_user(email="analyst_user@example.com", organization_name="Temp Org 2")
    analyst_user = db.scalar(select(User).where(User.email == "analyst_user@example.com"))
    assert analyst_user is not None
    # Add analyst to Team Org
    db.add(Membership(organization_id=org.id, user_id=analyst_user.id, role=MembershipRole.ANALYST))
    db.commit()

    admin_headers = {
        "Authorization": f"Bearer {admin_reg['data']['access_token']}",
        "X-Organization-Id": str(org.id),
    }
    analyst_headers = {
        "Authorization": f"Bearer {analyst_reg['data']['access_token']}",
        "X-Organization-Id": str(org.id),
    }

    # Analyst can create project
    analyst_create = client.post(
        "/api/v1/projects",
        json={"name": "Analyst Project"},
        headers=analyst_headers,
    )
    assert analyst_create.status_code == 201
    proj_id = analyst_create.json()["id"]

    # Analyst CANNOT archive project (archive requires owner or admin)
    analyst_archive = client.delete(f"/api/v1/projects/{proj_id}", headers=analyst_headers)
    assert analyst_archive.status_code == 403

    # Admin CAN archive project
    admin_archive = client.delete(f"/api/v1/projects/{proj_id}", headers=admin_headers)
    assert admin_archive.status_code == 200


def test_viewer_cannot_perform_write_actions(client: TestClient, register_user: Any, db: Session) -> None:
    """Viewers have read-only access and cannot create or update projects."""
    register_user(email="v_owner@example.com", organization_name="Viewer Org")
    org = db.scalar(select(Organization).where(Organization.name == "Viewer Org"))
    assert org is not None

    # Register viewer
    viewer_reg = register_user(email="viewer@example.com", organization_name="Viewer Temp")
    viewer_user = db.scalar(select(User).where(User.email == "viewer@example.com"))
    assert viewer_user is not None
    db.add(Membership(organization_id=org.id, user_id=viewer_user.id, role=MembershipRole.VIEWER))
    db.commit()

    viewer_headers = {
        "Authorization": f"Bearer {viewer_reg['data']['access_token']}",
        "X-Organization-Id": str(org.id),
    }

    # Cannot create project
    create_attempt = client.post(
        "/api/v1/projects",
        json={"name": "Viewer Project"},
        headers=viewer_headers,
    )
    assert create_attempt.status_code == 403

    # But viewer CAN list projects
    list_attempt = client.get("/api/v1/projects", headers=viewer_headers)
    assert list_attempt.status_code == 200


def test_users_cannot_access_another_organization_projects(client: TestClient, register_user: Any) -> None:
    """Users cannot access projects belonging to an organization they are not part of (returns 404)."""
    # Org A
    user_a = register_user(email="user_a@example.com", organization_name="Org A")
    token_a = user_a["data"]["access_token"]
    proj_a = client.post(
        "/api/v1/projects",
        json={"name": "Org A Project"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()

    # Org B
    user_b = register_user(email="user_b@example.com", organization_name="Org B")
    token_b = user_b["data"]["access_token"]

    # User B tries to access User A's project
    attempt = client.get(
        f"/api/v1/projects/{proj_a['id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    # Must return 404 to avoid leaking project existence across organizations
    assert attempt.status_code == 404


def test_unauthorized_project_ids_are_rejected(client: TestClient, register_user: Any) -> None:
    """Random non-existent or foreign project IDs are safely rejected with 404."""
    user = register_user(email="random_id@example.com", organization_name="Random Org")
    headers = {"Authorization": f"Bearer {user['data']['access_token']}"}

    fake_id = uuid.uuid4()
    res = client.get(f"/api/v1/projects/{fake_id}", headers=headers)
    assert res.status_code == 404
